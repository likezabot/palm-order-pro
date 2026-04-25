import { useState, useCallback } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import { Search, Phone, ChevronRight, RotateCw, AlertCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { formatPhone, validatePhone, usePublicCart } from "@/lib/public-cart";
import type { PublicProduct } from "@/lib/public-menu";

type CustomerOrderItem = {
  product_id: string | null;
  product_name: string;
  product_price: number;
  quantity: number;
  note: string | null;
};

type CustomerOrder = {
  id: string;
  status: string;
  total: number;
  service_type: string;
  created_at: string;
  estimated_ready_at: string | null;
  public_token: string | null;
  payment_method: string | null;
  items: CustomerOrderItem[];
};

const STORAGE_PHONE_KEY = "public_my_orders_phone";

const statusLabel: Record<string, string> = {
  new: "Recebido",
  preparing: "Em preparo",
  done: "Pronto",
  paid: "Finalizado",
  cancelled: "Cancelado",
};

const statusClass: Record<string, string> = {
  new: "bg-primary/15 text-primary",
  preparing: "bg-warning/15 text-warning",
  done: "bg-success/15 text-success",
  paid: "bg-muted text-muted-foreground",
  cancelled: "bg-destructive/15 text-destructive",
};

const serviceLabel: Record<string, string> = {
  delivery: "Entrega",
  pickup: "Retirada",
  dine_in: "Local",
};

export default function PublicMyOrders() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { add, clear } = usePublicCart();

  const [phone, setPhone] = useState<string>(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(STORAGE_PHONE_KEY) ?? "";
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [orders, setOrders] = useState<CustomerOrder[] | null>(null);

  const search = useCallback(async () => {
    setError(null);
    if (!validatePhone(phone)) {
      setError("Informe um telefone válido com DDD.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("get_customer_orders" as any, {
        p_phone: phone,
      });
      if (error) throw error;
      const list = (data ?? []) as CustomerOrder[];
      setOrders(list);
      try {
        localStorage.setItem(STORAGE_PHONE_KEY, phone);
      } catch {
        /* noop */
      }
    } catch (e) {
      setError("Não foi possível buscar seus pedidos. Verifique o telefone.");
      setOrders(null);
    } finally {
      setLoading(false);
    }
  }, [phone]);

  const reorder = useCallback(
    (order: CustomerOrder) => {
      clear();
      order.items.forEach((it) => {
        if (!it.product_id) return;
        const fakeProduct: PublicProduct = {
          id: it.product_id,
          name: it.product_name,
          price: Number(it.product_price),
          image_url: null,
          description: null,
          category: "",
          is_featured: false,
          is_sold_out: false,
          display_order: 0,
        } as unknown as PublicProduct;
        add(fakeProduct, it.quantity, it.note ?? "");
      });
      navigate(`/menu/${slug}`);
    },
    [add, clear, navigate, slug],
  );

  return (
    <div className="min-h-screen bg-background px-5 py-6 max-w-2xl mx-auto">
      <header className="mb-6">
        <Link to={`/menu/${slug}`} className="text-sm text-muted-foreground hover:text-foreground">
          ← Voltar ao cardápio
        </Link>
        <h1 className="text-2xl font-black mt-2">Meus pedidos</h1>
        <p className="text-sm text-muted-foreground">
          Informe o telefone usado no pedido para ver seu histórico.
        </p>
      </header>

      <div className="rounded-2xl border border-border p-4 space-y-3 mb-6">
        <label htmlFor="phone-input" className="text-sm font-semibold flex items-center gap-2">
          <Phone size={14} /> Telefone
        </label>
        <div className="flex gap-2">
          <Input
            id="phone-input"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(formatPhone(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") search();
            }}
            placeholder="(11) 99999-9999"
            aria-label="Telefone para buscar pedidos"
          />
          <Button onClick={search} disabled={loading} aria-label="Buscar pedidos">
            <Search size={16} />
            {loading ? "Buscando..." : "Buscar"}
          </Button>
        </div>
        {error && (
          <div className="flex items-start gap-2 text-sm text-destructive">
            <AlertCircle size={14} className="mt-0.5 shrink-0" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {orders !== null && orders.length === 0 && (
        <div className="text-center text-muted-foreground py-10">
          Nenhum pedido encontrado para este telefone.
        </div>
      )}

      {orders && orders.length > 0 && (
        <ul className="space-y-3">
          {orders.map((o) => {
            const date = new Date(o.created_at);
            const cls = statusClass[o.status] ?? "bg-muted text-muted-foreground";
            return (
              <li key={o.id} className="rounded-2xl border border-border p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs text-muted-foreground">
                      {date.toLocaleDateString("pt-BR")} ·{" "}
                      {date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </div>
                    <div className="font-bold mt-1">
                      R$ {Number(o.total).toFixed(2)}{" "}
                      <span className="text-xs font-normal text-muted-foreground">
                        · {serviceLabel[o.service_type] ?? o.service_type}
                      </span>
                    </div>
                  </div>
                  <span className={`text-xs font-bold px-2 py-1 rounded-full ${cls}`}>
                    {statusLabel[o.status] ?? o.status}
                  </span>
                </div>

                {o.items.length > 0 && (
                  <ul className="text-sm text-muted-foreground space-y-0.5">
                    {o.items.slice(0, 4).map((it, idx) => (
                      <li key={`${o.id}-${idx}`} className="truncate">
                        {it.quantity}× {it.product_name}
                      </li>
                    ))}
                    {o.items.length > 4 && (
                      <li className="text-xs">+{o.items.length - 4} item(s)</li>
                    )}
                  </ul>
                )}

                <div className="flex flex-wrap gap-2 pt-1">
                  {o.public_token && (
                    <Button
                      asChild
                      variant="outline"
                      size="sm"
                      className="flex-1 min-w-[140px]"
                    >
                      <Link to={`/menu/${slug}/sucesso/${o.id}?t=${o.public_token}`}>
                        Acompanhar
                        <ChevronRight size={14} />
                      </Link>
                    </Button>
                  )}
                  <Button
                    variant="default"
                    size="sm"
                    onClick={() => reorder(o)}
                    className="flex-1 min-w-[140px]"
                    disabled={o.items.every((i) => !i.product_id)}
                    aria-label="Pedir novamente os itens deste pedido"
                  >
                    <RotateCw size={14} />
                    Pedir novamente
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
