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
  Hash,
  Copy,
  DollarSign,
  FileText,
  Loader2,
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

const recentToasts = new Map<string, number>();
function dedupedToast(kind: "success" | "error", msg: string) {
  const key = `${kind}:${msg}`;
  const now = Date.now();
  const last = recentToasts.get(key) ?? 0;
  if (now - last < 1500) return;
  recentToasts.set(key, now);
  if (kind === "success") toast.success(msg);
  else toast.error(msg);
}

async function copyToClipboard(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text);
    dedupedToast("success", `${label} copiado`);
  } catch {
    dedupedToast("error", "Não foi possível copiar");
  }
}

function buildOrderSummary(o: OnlineOrder): string {
  const sid = shortOrderId(o.id);
  const lines: string[] = [];
  lines.push(`Pedido #${sid}`);
  if (o.customer_name_snapshot) lines.push(`Cliente: ${o.customer_name_snapshot}`);
  if (o.customer_phone_snapshot) lines.push(`Tel: ${o.customer_phone_snapshot}`);
  lines.push(`Tipo: ${SERVICE_LABEL[o.service_type] ?? o.service_type}`);
  if (o.service_type === "delivery") {
    const addr = formatAddress(o.delivery_address);
    if (addr) lines.push(`Endereço: ${addr}`);
  }
  if (o.payment_method) {
    const pay = PAYMENT_LABEL[o.payment_method] ?? o.payment_method;
    const extra =
      o.payment_method === "cash" && o.change_for != null
        ? ` (troco p/ R$ ${Number(o.change_for).toFixed(2)})`
        : "";
    lines.push(`Pagamento: ${pay}${extra}`);
  }
  const fee = Number(o.delivery_fee ?? 0);
  const total = Number(o.total ?? 0);
  const subtotal = Math.max(0, total - fee);
  lines.push(`Subtotal: R$ ${subtotal.toFixed(2)}`);
  if (o.service_type === "delivery") lines.push(`Taxa: R$ ${fee.toFixed(2)}`);
  lines.push(`Total: R$ ${total.toFixed(2)}`);
  return lines.join("\n");
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
    dedupedToast("error", "Telefone inválido");
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

export default function OnlineOrdersTab() {
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailsId, setDetailsId] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [advancingIds, setAdvancingIds] = useState<Set<string>>(new Set());

  async function handleAdvance(orderId: string, currentStatus: string) {
    const next = NEXT_STATUS[currentStatus]?.next;
    if (!next) return;
    if (advancingIds.has(orderId)) return;
    setAdvancingIds((s) => {
      const n = new Set(s);
      n.add(orderId);
      return n;
    });
    const { error } = await supabase.rpc("update_order_status" as any, {
      p_order_id: orderId,
      p_status: next,
    });
    if (error) {
      dedupedToast("error", `Não foi possível avançar status: ${error.message}`);
    } else {
      dedupedToast("success", `Pedido movido para "${STATUS_LABEL[next] ?? next}"`);
    }
    setAdvancingIds((s) => {
      const n = new Set(s);
      n.delete(orderId);
      return n;
    });
  }

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
                    className={`rounded-xl border p-4 shadow-sm space-y-3 transition-colors ${
                      o.status === "new"
                        ? isDelivery
                          ? "bg-primary/10 border-primary ring-2 ring-primary/40 shadow-md"
                          : "bg-primary/5 border-primary/60"
                        : isDelivery
                          ? "bg-card border-primary/30"
                          : "bg-card border-border"
                    }`}
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
                          {isDelivery && (
                            <Badge
                              variant="outline"
                              className="text-[10px] uppercase bg-primary/15 text-primary border-primary/40"
                            >
                              <Truck size={10} className="mr-1" />
                              Delivery
                            </Badge>
                          )}
                        </div>
                        <div className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap">
                          <Clock size={12} />
                          {new Date(o.created_at).toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                          <span className="opacity-60">•</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(shortId(o.id), "Nº do pedido")}
                            className="font-mono inline-flex items-center gap-1 hover:text-foreground"
                            title="Copiar nº do pedido"
                          >
                            <Hash size={10} />
                            {shortId(o.id)}
                          </button>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <button
                          type="button"
                          onClick={() =>
                            copyToClipboard(`R$ ${Number(o.total ?? 0).toFixed(2)}`, "Total")
                          }
                          className="text-primary font-black text-lg tabular-nums hover:underline"
                          title="Copiar total"
                        >
                          R$ {Number(o.total ?? 0).toFixed(2)}
                        </button>
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
                      <button
                        type="button"
                        onClick={() => copyToClipboard(phone, "Telefone")}
                        className="flex items-center gap-1.5 text-xs hover:text-primary"
                        title="Copiar telefone"
                      >
                        <Phone size={12} className="text-muted-foreground" />
                        <span className="truncate">{phone}</span>
                      </button>
                    )}

                    {/* Endereço delivery */}
                    {isDelivery && addrText && (
                      <button
                        type="button"
                        onClick={() => copyToClipboard(addrText, "Endereço")}
                        className="flex items-start gap-1.5 text-xs text-muted-foreground hover:text-foreground text-left w-full"
                        title="Copiar endereço"
                      >
                        <MapPin size={12} className="mt-0.5 shrink-0" />
                        <span className="line-clamp-2">{addrText}</span>
                      </button>
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
                      <Button
                        size="sm"
                        variant="outline"
                        className="gap-1.5 h-9"
                        onClick={() => copyToClipboard(buildOrderSummary(o), "Resumo")}
                        title="Copiar resumo do pedido"
                      >
                        <FileText size={14} />
                      </Button>
                      {phone && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5 h-9 text-success border-success/30 hover:bg-success/10"
                              title="WhatsApp do cliente"
                            >
                              <MessageCircle size={14} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-64">
                            <DropdownMenuLabel>Abrir WhatsApp</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            {(
                              [
                                "received",
                                "preparing",
                                isDelivery ? "out_for_delivery" : "ready_pickup",
                              ] as WaContext[]
                            ).map((ctx) => (
                              <DropdownMenuItem
                                key={`open-${ctx}`}
                                onClick={() =>
                                  openWhatsAppContext({
                                    context: ctx,
                                    phone,
                                    customerName: o.customer_name_snapshot,
                                    shortId: shortId(o.id),
                                  })
                                }
                              >
                                {WA_CONTEXT_LABEL[ctx]}
                              </DropdownMenuItem>
                            ))}
                            <DropdownMenuSeparator />
                            <DropdownMenuLabel>Copiar mensagem</DropdownMenuLabel>
                            {(
                              [
                                "received",
                                "preparing",
                                isDelivery ? "out_for_delivery" : "ready_pickup",
                              ] as WaContext[]
                            ).map((ctx) => (
                              <DropdownMenuItem
                                key={`copy-${ctx}`}
                                onClick={() =>
                                  copyToClipboard(
                                    buildWaMessage({
                                      context: ctx,
                                      customerName: o.customer_name_snapshot,
                                      shortId: shortId(o.id),
                                    }),
                                    `Mensagem (${WA_CONTEXT_LABEL[ctx]})`,
                                  )
                                }
                              >
                                <Copy size={12} className="mr-2" />
                                {WA_CONTEXT_LABEL[ctx]}
                              </DropdownMenuItem>
                            ))}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </div>

                    {/* Avançar status */}
                    {NEXT_STATUS[o.status] && (
                      <Button
                        variant="default"
                        className="w-full gap-2 h-11 font-bold"
                        onClick={() => handleAdvance(o.id, o.status)}
                        disabled={advancingIds.has(o.id)}
                      >
                        {advancingIds.has(o.id) ? (
                          <Loader2 size={16} className="animate-spin" />
                        ) : o.status === "done" ? (
                          <CheckCircle2 size={16} />
                        ) : (
                          <ArrowRight size={16} />
                        )}
                        {advancingIds.has(o.id) ? "Atualizando…" : NEXT_STATUS[o.status]?.label}
                      </Button>
                    )}

                    <Button
                      variant="outline"
                      className="w-full gap-2 h-10 font-bold"
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
