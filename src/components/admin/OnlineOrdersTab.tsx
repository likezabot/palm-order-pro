import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Clock,
  Pencil,
  RefreshCw,
  Truck,
  Store,
  UtensilsCrossed,
  Phone,
  MapPin,
  MessageCircle,
  Eye,
  Search,
  CreditCard,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import OnlineOrderEditDialog from "./OnlineOrderEditDialog";
import OnlineOrderDetailsDialog from "./OnlineOrderDetailsDialog";
import {
  buildWaMessage,
  buildWaUrl,
  shortOrderId,
  WA_CONTEXT_LABEL,
  type WaContext,
} from "@/lib/online-order-messages";

type DeliveryAddress = {
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  complement?: string | null;
  reference?: string | null;
  city?: string | null;
  zip?: string | null;
} | null;

type OnlineOrder = {
  id: string;
  table_name: string;
  status: string;
  total: number | null;
  delivery_fee: number;
  service_type: string;
  created_at: string;
  customer_name_snapshot: string | null;
  customer_phone_snapshot: string | null;
  payment_method: string | null;
  change_for: number | null;
  delivery_address: DeliveryAddress;
};

const SERVICE_ICON: Record<string, typeof Truck> = {
  delivery: Truck,
  pickup: Store,
  dine_in: UtensilsCrossed,
};

const SERVICE_LABEL: Record<string, string> = {
  delivery: "Entrega",
  pickup: "Retirada",
  dine_in: "No local",
};

const STATUS_LABEL: Record<string, string> = {
  new: "Novo",
  preparing: "Em preparo",
  done: "Pronto",
  paid: "Finalizado",
  cancelled: "Cancelado",
};

const STATUS_BADGE: Record<string, string> = {
  new: "bg-primary/15 text-primary border-primary/30",
  preparing: "bg-warning/15 text-warning border-warning/30",
  done: "bg-success/15 text-success border-success/30",
  paid: "bg-muted text-muted-foreground border-border",
  cancelled: "bg-destructive/15 text-destructive border-destructive/30",
};

const PAYMENT_LABEL: Record<string, string> = {
  pix: "PIX",
  cash: "Dinheiro",
  credit: "Crédito",
  debit: "Débito",
  card: "Cartão",
};

type FilterKey = "all" | "new" | "preparing" | "done" | "delivery" | "pickup";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "new", label: "Novo" },
  { key: "preparing", label: "Em preparo" },
  { key: "done", label: "Pronto" },
  { key: "delivery", label: "Entrega" },
  { key: "pickup", label: "Retirada" },
];

function shortId(id: string) {
  return shortOrderId(id);
}

function formatAddress(addr: DeliveryAddress): string {
  if (!addr) return "";
  const line1 = [addr.street, addr.number].filter(Boolean).join(", ");
  const line2 = [addr.neighborhood, addr.city].filter(Boolean).join(" - ");
  const extras = [addr.complement, addr.reference].filter(Boolean).join(" / ");
  return [line1, line2, extras].filter(Boolean).join(" • ");
}

function onlyDigits(s: string | null | undefined) {
  return (s ?? "").replace(/\D+/g, "");
}

async function fetchOnlineOrders(): Promise<OnlineOrder[]> {
  const { data, error } = await supabase
    .from("orders")
    .select(
      "id, table_name, status, total, delivery_fee, service_type, created_at, customer_name_snapshot, customer_phone_snapshot, payment_method, change_for, delivery_address",
    )
    .eq("channel", "online")
    .in("status", ["new", "preparing", "done"])
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return (data ?? []) as OnlineOrder[];
}

async function copyToClipboard(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`${label} copiado`);
  } catch {
    toast.error("Não foi possível copiar");
  }
}

function openWhatsAppContext(opts: {
  context: WaContext;
  phone: string;
  customerName: string | null;
  shortId: string;
}) {
  const msg = buildWaMessage({
    context: opts.context,
    customerName: opts.customerName,
    shortId: opts.shortId,
  });
  const url = buildWaUrl(opts.phone, msg);
  if (!url) {
    toast.error("Telefone inválido");
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

const NEXT_STATUS: Record<string, { next: string; label: string } | null> = {
  new: { next: "preparing", label: "Iniciar preparo" },
  preparing: { next: "done", label: "Marcar pronto" },
  done: { next: "paid", label: "Finalizar" },
  paid: null,
  cancelled: null,
};

async function advanceStatus(orderId: string, currentStatus: string) {
  const next = NEXT_STATUS[currentStatus]?.next;
  if (!next) return;
  const { error } = await supabase.rpc("update_order_status" as any, {
    p_order_id: orderId,
    p_status: next,
  });
  if (error) {
    toast.error(`Não foi possível avançar status: ${error.message}`);
    return;
  }
  toast.success(`Pedido movido para "${STATUS_LABEL[next] ?? next}"`);
}

export default function OnlineOrdersTab() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");

  const ordersQuery = useQuery({
    queryKey: ["admin", "online-orders"],
    queryFn: fetchOnlineOrders,
    refetchInterval: 15_000,
    staleTime: 5_000,
  });

  useEffect(() => {
    const ch = supabase
      .channel("admin-online-orders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders" },
        () => qc.invalidateQueries({ queryKey: ["admin", "online-orders"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const orders = ordersQuery.data ?? [];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const qDigits = onlyDigits(search);
    return orders.filter((o) => {
      // filtro de aba
      if (filter === "new" || filter === "preparing" || filter === "done") {
        if (o.status !== filter) return false;
      } else if (filter === "delivery" || filter === "pickup") {
        if (o.service_type !== filter) return false;
      }
      // busca
      if (q) {
        const name = (o.customer_name_snapshot ?? "").toLowerCase();
        const phone = onlyDigits(o.customer_phone_snapshot);
        const sid = shortId(o.id).toLowerCase();
        const matchesName = name.includes(q);
        const matchesPhone = qDigits.length > 0 && phone.includes(qDigits);
        const matchesId = sid.includes(q);
        if (!matchesName && !matchesPhone && !matchesId) return false;
      }
      return true;
    });
  }, [orders, filter, search]);

  const grouped = useMemo(() => {
    const g: Record<string, OnlineOrder[]> = { new: [], preparing: [], done: [] };
    for (const o of filtered) {
      if (g[o.status]) g[o.status].push(o);
    }
    return g;
  }, [filtered]);

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = {
      all: orders.length,
      new: 0,
      preparing: 0,
      done: 0,
      delivery: 0,
      pickup: 0,
    };
    for (const o of orders) {
      if (o.status === "new") c.new++;
      if (o.status === "preparing") c.preparing++;
      if (o.status === "done") c.done++;
      if (o.service_type === "delivery") c.delivery++;
      if (o.service_type === "pickup") c.pickup++;
    }
    return c;
  }, [orders]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-black">Pedidos online</h2>
          <p className="text-sm text-muted-foreground">
            Pedidos do cardápio público. Total = subtotal + taxa de entrega.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => ordersQuery.refetch()}
          disabled={ordersQuery.isFetching}
          className="gap-2"
        >
          <RefreshCw size={14} className={ordersQuery.isFetching ? "animate-spin" : ""} />
          Atualizar
        </Button>
      </div>

      {/* Busca */}
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, telefone ou nº do pedido…"
          className="pl-9 h-11"
        />
      </div>

      {/* Filtros */}
      <div className="flex gap-2 flex-wrap">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const count = counts[f.key];
          return (
            <button
              key={f.key}
              onClick={() => setFilter(f.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                active
                  ? "bg-primary text-primary-foreground border-primary"
                  : "bg-card text-foreground border-border hover:border-primary/40"
              }`}
            >
              {f.label}
              <span className={`ml-1.5 ${active ? "opacity-90" : "text-muted-foreground"}`}>
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {ordersQuery.isLoading && (
        <div className="py-12 text-center text-muted-foreground">Carregando…</div>
      )}

      {!ordersQuery.isLoading && filtered.length === 0 && (
        <div className="py-12 text-center text-muted-foreground border-2 border-dashed border-border rounded-xl">
          {orders.length === 0
            ? "Nenhum pedido online ativo no momento."
            : "Nenhum pedido corresponde ao filtro/busca."}
        </div>
      )}

      {(["new", "preparing", "done"] as const).map((status) => {
        const list = grouped[status];
        if (!list?.length) return null;
        return (
          <section key={status} className="space-y-2">
            <h3 className="text-xs font-black uppercase tracking-wide text-muted-foreground">
              {STATUS_LABEL[status]} ({list.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {list.map((o) => {
                const Icon = SERVICE_ICON[o.service_type] ?? UtensilsCrossed;
                const isDelivery = o.service_type === "delivery";
                const fee = Number(o.delivery_fee ?? 0);
                const subtotal = Math.max(0, Number(o.total ?? 0) - fee);
                const phone = o.customer_phone_snapshot ?? "";
                const addrText = formatAddress(o.delivery_address);
                const payLabel = o.payment_method
                  ? PAYMENT_LABEL[o.payment_method] ?? o.payment_method
                  : null;
                return (
                  <div
                    key={o.id}
                    className="rounded-xl border border-border bg-card p-4 shadow-sm space-y-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h4 className="font-black truncate">
                            {o.customer_name_snapshot || o.table_name}
                          </h4>
                          <Badge
                            variant="outline"
                            className={`text-[10px] uppercase ${STATUS_BADGE[o.status] ?? ""}`}
                          >
                            {STATUS_LABEL[o.status] ?? o.status}
                          </Badge>
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                          <Clock size={12} />
                          {new Date(o.created_at).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          <span className="opacity-60">•</span>
                          <span className="font-mono">#{shortId(o.id)}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-primary font-black text-lg tabular-nums">
                          R$ {Number(o.total ?? 0).toFixed(2)}
                        </p>
                      </div>
                    </div>

                    {/* Tipo + pagamento */}
                    <div className="flex items-center justify-between text-xs text-muted-foreground gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
                        <Icon size={14} />
                        {SERVICE_LABEL[o.service_type] ?? o.service_type}
                      </span>
                      {payLabel && (
                        <span className="inline-flex items-center gap-1.5">
                          <CreditCard size={12} />
                          {payLabel}
                          {o.payment_method === "cash" && o.change_for != null && (
                            <span className="opacity-80">
                              (troco p/ R$ {Number(o.change_for).toFixed(2)})
                            </span>
                          )}
                        </span>
                      )}
                    </div>

                    {/* Telefone */}
                    {phone && (
                      <div className="flex items-center gap-1.5 text-xs">
                        <Phone size={12} className="text-muted-foreground" />
                        <span className="truncate">{phone}</span>
                      </div>
                    )}

                    {/* Endereço delivery */}
                    {isDelivery && addrText && (
                      <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                        <MapPin size={12} className="mt-0.5 shrink-0" />
                        <span className="line-clamp-2">{addrText}</span>
                      </div>
                    )}

                    {/* Totais */}
                    <div className="text-xs text-muted-foreground tabular-nums border-t border-border pt-2 space-y-0.5">
                      <div className="flex justify-between">
                        <span>Subtotal</span>
                        <span>R$ {subtotal.toFixed(2)}</span>
                      </div>
                      {isDelivery && (
                        <div className="flex justify-between">
                          <span>Taxa entrega</span>
                          <span>R$ {fee.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex justify-between font-black text-foreground">
                        <span>Total</span>
                        <span>R$ {Number(o.total ?? 0).toFixed(2)}</span>
                      </div>
                    </div>

                    {/* Ações rápidas */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 h-9"
                        onClick={() => setDetailsId(o.id)}
                      >
                        <Eye size={14} /> Detalhes
                      </Button>
                      {phone && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 h-9"
                            onClick={() => copyToClipboard(phone, "Telefone")}
                            title="Copiar telefone"
                          >
                            <Phone size={14} />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="gap-1.5 h-9 text-success border-success/30 hover:bg-success/10"
                            onClick={() => openWhatsApp(phone, o.customer_name_snapshot)}
                            title="Abrir WhatsApp"
                          >
                            <MessageCircle size={14} />
                          </Button>
                        </>
                      )}
                      {isDelivery && addrText && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="gap-1.5 h-9"
                          onClick={() => copyToClipboard(addrText, "Endereço")}
                          title="Copiar endereço"
                        >
                          <MapPin size={14} />
                        </Button>
                      )}
                    </div>

                    <Button
                      variant="default"
                      className="w-full gap-2 h-11 font-bold"
                      onClick={() => setEditingId(o.id)}
                    >
                      <Pencil size={16} /> Editar pedido
                    </Button>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      <OnlineOrderEditDialog
        open={!!editingId}
        onOpenChange={(o) => !o && setEditingId(null)}
        orderId={editingId}
        onUpdated={() => qc.invalidateQueries({ queryKey: ["admin", "online-orders"] })}
      />

      <OnlineOrderDetailsDialog
        open={!!detailsId}
        onOpenChange={(o) => !o && setDetailsId(null)}
        orderId={detailsId}
      />
    </div>
  );
}
