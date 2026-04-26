/**
 * Cliente do sistema de fidelidade (frontend).
 * - Lê configuração via setting loyalty_enabled.
 * - Consulta saldo + brindes via RPC pública get_public_loyalty_status.
 * Todas as RPCs admin são chamadas direto via supabase.rpc no Admin.
 */
import { supabase } from "@/integrations/supabase/client";

export type LoyaltyReward = {
  id: string;
  display_name: string;
  points_cost: number;
  min_order_subtotal: number;
  available: boolean;
  blocked_reason: string | null;
};

export type LoyaltyStatus = {
  enabled: boolean;
  balance: number;
  rewards: LoyaltyReward[];
  points_per_real: number;
  projected_earn: number;
};

const EMPTY: LoyaltyStatus = {
  enabled: false,
  balance: 0,
  rewards: [],
  points_per_real: 1,
  projected_earn: 0,
};

export function normalizePhoneClient(phone: string): string {
  return (phone || "").replace(/\D/g, "");
}

export async function fetchLoyaltyStatus(args: {
  phone: string;
  restaurantSlug: string;
  orderSubtotal: number;
  serviceType?: "pickup" | "delivery" | "dine_in";
}): Promise<LoyaltyStatus> {
  const phone = normalizePhoneClient(args.phone);
  if (!phone || phone.length < 10) return EMPTY;
  try {
    const { data, error } = await supabase.rpc(
      "get_public_loyalty_status" as never,
      {
        p_phone: phone,
        p_restaurant_slug: args.restaurantSlug,
        p_order_subtotal: args.orderSubtotal,
        p_service_type: args.serviceType ?? "pickup",
      } as never,
    );
    if (error) throw error;
    if (!data || typeof data !== "object") return EMPTY;
    const d = data as Record<string, unknown>;
    if (d.enabled !== true) return { ...EMPTY, enabled: false };
    return {
      enabled: true,
      balance: Number(d.balance ?? 0),
      rewards: Array.isArray(d.rewards) ? (d.rewards as LoyaltyReward[]) : [],
      points_per_real: Number(d.points_per_real ?? 1),
      projected_earn: Number(d.projected_earn ?? 0),
    };
  } catch {
    return EMPTY;
  }
}

export async function fetchLoyaltyEnabled(): Promise<boolean> {
  try {
    const { data, error } = await supabase
      .from("settings")
      .select("value")
      .eq("key", "loyalty_enabled")
      .maybeSingle();
    if (error) return false;
    return data?.value === "true";
  } catch {
    return false;
  }
}

export function blockedReasonText(reason: string | null): string | null {
  if (!reason) return null;
  if (reason === "pickup_only") {
    return "Disponível apenas na retirada";
  }
  if (reason.startsWith("missing_points:")) {
    const n = reason.split(":")[1];
    return `Faltam ${n} pontos`;
  }
  if (reason.startsWith("min_subtotal:")) {
    const v = Number(reason.split(":")[1] || 0);
    return `Pedido mínimo R$ ${v.toFixed(2)}`;
  }
  return null;
}
