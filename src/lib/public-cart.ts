/**
 * Carrinho do cardápio público.
 * - Persiste em localStorage.
 * - Não compartilha estado com Palm/PDV.
 */
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { PublicProduct } from "./public-menu";

/**
 * Carrinho do cliente público:
 * - Usa sessionStorage para zerar a cada nova visita (nova aba / reabrir o site).
 * - Migração: limpa qualquer carrinho antigo persistido em localStorage.
 */
const STORAGE_KEY = "public_cart_v1";

if (typeof window !== "undefined") {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* noop */
  }
}

export type PublicCartItem = {
  product_id: string;
  product_name: string;
  product_price: number;
  quantity: number;
  note?: string;
  image_url?: string | null;
};

export type CheckoutCustomer = {
  name: string;
  phone: string;
  points_balance?: number;
  last_service_type?: ServiceType;
  last_payment_method?: PaymentMethod;
};

export type CheckoutAddress = {
  street?: string;
  number?: string;
  neighborhood?: string;
  complement?: string;
  reference?: string;
};

export type ServiceType = "delivery" | "pickup" | "dine_in";
export type PaymentMethod = "pix" | "cash" | "card";

export type CheckoutPayload = {
  restaurant_slug: string;
  customer: CheckoutCustomer;
  service_type: ServiceType;
  payment_method: PaymentMethod;
  change_for?: number | null;
  address?: CheckoutAddress | null;
  note?: string;
  items: PublicCartItem[];
  client_request_id: string;
  loyalty_reward_id?: string | null;
};

export type CreateOrderResult = {
  id: string;
  public_token: string | null;
  idempotent: boolean;
  status: string;
  auto_approved: boolean;
  estimated_ready_at: string | null;
  total: number;
};

function readCart(): PublicCartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((it) => it && typeof it.product_id === "string");
  } catch {
    return [];
  }
}

function writeCart(items: PublicCartItem[]) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch {
    /* noop */
  }
}

export function usePublicCart() {
  const [items, setItems] = useState<PublicCartItem[]>(() => readCart());

  useEffect(() => {
    writeCart(items);
  }, [items]);

  // Sincroniza entre abas e instâncias do hook
  useEffect(() => {
    const sync = () => {
      const current = readCart();
      // Evita loops infinitos verificando se os itens mudaram
      if (JSON.stringify(current) !== JSON.stringify(items)) {
        setItems(current);
      }
    };
    window.addEventListener("storage", sync);
    // Também ouve eventos customizados disparados no mesmo window
    window.addEventListener("public_cart_sync", sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener("public_cart_sync", sync);
    };
  }, [items]);

  const add = useCallback((product: PublicProduct, qty = 1, note = "") => {
    setItems((prev) => {
      const existing = prev.find((it) => it.product_id === product.id && (it.note ?? "") === note);
      if (existing) {
        return prev.map((it) =>
          it.product_id === product.id && (it.note ?? "") === note
            ? { ...it, quantity: Math.min(999, it.quantity + qty) }
            : it,
        );
      }
      return [
        ...prev,
        {
          product_id: product.id,
          product_name: product.name,
          product_price: product.price,
          quantity: Math.max(1, qty),
          note: note || undefined,
          image_url: product.image_url,
        },
      ];
    });
  }, []);

  const updateQty = useCallback((productId: string, note: string | undefined, delta: number) => {
    setItems((prev) =>
      prev
        .map((it) =>
          it.product_id === productId && (it.note ?? "") === (note ?? "")
            ? { ...it, quantity: Math.max(0, Math.min(999, it.quantity + delta)) }
            : it,
        )
        .filter((it) => it.quantity > 0),
    );
  }, []);

  const remove = useCallback((productId: string, note: string | undefined) => {
    setItems((prev) =>
      prev.filter((it) => !(it.product_id === productId && (it.note ?? "") === (note ?? ""))),
    );
  }, []);

  const clear = useCallback(() => {
    setItems([]);
    sessionStorage.setItem(STORAGE_KEY, "[]");
    window.dispatchEvent(new Event("public_cart_sync"));
  }, []);

  const itemCount = items.reduce((s, it) => s + it.quantity, 0);
  const subtotal = items.reduce((s, it) => s + it.product_price * it.quantity, 0);

  return { items, add, updateQty, remove, clear, itemCount, subtotal };
}

/** Taxa fixa de entrega aplicada apenas em service_type = 'delivery'. */
export const DELIVERY_FEE_FIXED = 5.0;

export function computeDeliveryFee(serviceType: ServiceType): number {
  return serviceType === "delivery" ? DELIVERY_FEE_FIXED : 0;
}

export function newClientRequestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `cli-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function createPublicOrder(payload: CheckoutPayload): Promise<CreateOrderResult> {
  const { data, error } = await supabase.rpc("create_public_order" as any, {
    p_restaurant_slug: payload.restaurant_slug,
    p_customer_name: payload.customer.name,
    p_customer_phone: payload.customer.phone,
    p_service_type: payload.service_type,
    p_payment_method: payload.payment_method,
    p_change_for: payload.change_for ?? null,
    p_address: payload.address ?? null,
    p_items: payload.items.map((it) => ({
      product_id: it.product_id,
      product_name: it.product_name,
      product_price: it.product_price,
      quantity: it.quantity,
      note: it.note ?? null,
    })),
    p_note: payload.note ?? null,
    p_client_request_id: payload.client_request_id,
    p_loyalty_reward_id: payload.loyalty_reward_id ?? null,
  });
  if (error) throw error;
  return data as CreateOrderResult;
}

export async function fetchCustomerProfile(
  phone: string,
  restaurantSlug: string
): Promise<(CheckoutCustomer & CheckoutAddress) | null> {
  try {
    const digits = phone.replace(/\D/g, "");
    if (digits.length < 10) return null;
    const { data, error } = await supabase.rpc(
      "get_customer_profile" as any,
      { p_phone: digits, p_restaurant_slug: restaurantSlug },
    );
    if (error || !data) return null;
    return data as any;
  } catch {
    return null;
  }
}

export async function fetchLastCustomerAddress(
  phone: string,
): Promise<CheckoutAddress | null> {
  // Mantido por retrocompatibilidade, mas agora usa fetchCustomerProfile internamente
  try {
    const profile = await fetchCustomerProfile(phone, "plano-b"); // Slug genérico ou fixo se não soubermos
    if (!profile) return null;
    return {
      street: profile.street,
      number: profile.number,
      neighborhood: profile.neighborhood,
      complement: profile.complement,
      reference: profile.reference,
    };
  } catch {
    return null;
  }
}

export function validatePhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 13;
}

export function formatPhone(phone: string): string {
  const d = phone.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}
