import { useEffect, useState } from "react";
import {
  Clock,
  CreditCard,
  MapPin,
  Phone,
  StickyNote,
  Truck,
  Store,
  UtensilsCrossed,
  User,
  MessageCircle,
  ArrowRight,
  CheckCircle2,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import {
  buildWaMessage,
  buildWaUrl,
  shortOrderId,
  WA_CONTEXT_LABEL,
  type WaContext,
} from "@/lib/online-order-messages";

type Address = {
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  complement?: string | null;
  reference?: string | null;
  city?: string | null;
  zip?: string | null;
} | null;

type OrderInfo = {
  id: string;
  table_name: string;
  status: string;
  service_type: string;
  payment_method: string | null;
  change_for: number | null;
  total: number | null;
  delivery_fee: number;
  customer_name_snapshot: string | null;
  customer_phone_snapshot: string | null;
  delivery_address: Address;
  created_at: string;
  updated_at: string | null;
  estimated_ready_at: string | null;
};

type Item = {
  id: string;
  product_name: string;
  product_price: number;
  quantity: number;
  subtotal: number;
  note: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orderId: string | null;
}

const SERVICE_LABEL: Record<string, string> = {
  delivery: "Entrega",
  pickup: "Retirada",
  dine_in: "No local",
};

const SERVICE_ICON: Record<string, typeof Truck> = {
  delivery: Truck,
  pickup: Store,
  dine_in: UtensilsCrossed,
};

const STATUS_LABEL: Record<string, string> = {
  new: "Novo",
  preparing: "Em preparo",
  done: "Pronto",
  paid: "Finalizado",
  cancelled: "Cancelado",
};

const PAYMENT_LABEL: Record<string, string> = {
  pix: "PIX",
  cash: "Dinheiro",
  credit: "Crédito",
  debit: "Débito",
  card: "Cartão",
};

function formatAddress(addr: Address): string {
  if (!addr) return "";
  const line1 = [addr.street, addr.number].filter(Boolean).join(", ");
  const line2 = [addr.neighborhood, addr.city].filter(Boolean).join(" - ");
  const extras = [addr.complement && `Compl.: ${addr.complement}`, addr.reference && `Ref.: ${addr.reference}`]
    .filter(Boolean)
    .join(" / ");
  return [line1, line2, extras].filter(Boolean).join("\n");
}

export default function OnlineOrderDetailsDialog({ open, onOpenChange, orderId }: Props) {
  const [order, setOrder] = useState<OrderInfo | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [orderNote, setOrderNote] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [advancing, setAdvancing] = useState(false);

  useEffect(() => {
    if (!open || !orderId) {
      setOrder(null);
      setItems([]);
      setOrderNote(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: o }, { data: rows }] = await Promise.all([
        supabase
          .from("orders")
          .select(
            "id, table_name, status, service_type, payment_method, change_for, total, delivery_fee, customer_name_snapshot, customer_phone_snapshot, delivery_address, created_at, updated_at, estimated_ready_at",
          )
          .eq("id", orderId)
          .maybeSingle(),
        supabase
          .from("order_items")
          .select("id, product_name, product_price, quantity, subtotal, note")
          .eq("order_id", orderId),
      ]);
      if (cancelled) return;
      setOrder((o ?? null) as OrderInfo | null);
      const list = (rows ?? []) as Item[];
      setItems(list);
      // Observação geral do pedido = nota de item especial "__order_note__" ou primeira nota com prefixo
      const general = list.find((it) => it.product_name === "__order_note__");
      setOrderNote(general?.note ?? null);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, orderId]);

  if (!order && !loading) return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Detalhes do pedido</DialogTitle></DialogHeader>
        <div className="py-8 text-center text-muted-foreground">Carregando…</div>
      </DialogContent>
    </Dialog>
  );

  const Icon = order ? (SERVICE_ICON[order.service_type] ?? UtensilsCrossed) : UtensilsCrossed;
  const fee = Number(order?.delivery_fee ?? 0);
  const realItems = items.filter((it) => it.product_name !== "__order_note__");
  const subtotal = realItems.reduce((s, it) => s + Number(it.subtotal), 0);
  const total = Number(order?.total ?? subtotal + fee);
  const isDelivery = order?.service_type === "delivery";
  const addr = formatAddress(order?.delivery_address ?? null);
  const payLabel = order?.payment_method
    ? PAYMENT_LABEL[order.payment_method] ?? order.payment_method
    : null;

  const sid = order ? shortOrderId(order.id) : "";
  const phone = order?.customer_phone_snapshot ?? "";
  const customerName = order?.customer_name_snapshot ?? null;
  const nextMap: Record<string, { next: string; label: string } | null> = {
    new: { next: "preparing", label: "Iniciar preparo" },
    preparing: { next: "done", label: "Marcar pronto" },
    done: { next: "paid", label: "Finalizar" },
    paid: null,
    cancelled: null,
  };
  const nextStep = order ? nextMap[order.status] : null;

  async function handleAdvance() {
    if (!order || !nextStep || advancing) return;
    setAdvancing(true);
    const { error } = await supabase.rpc("update_order_status" as any, {
      p_order_id: order.id,
      p_status: nextStep.next,
    });
    if (error) {
      toast.error(`Não foi possível avançar status: ${error.message}`);
      setAdvancing(false);
      return;
    }
    toast.success(`Pedido movido para "${STATUS_LABEL[nextStep.next] ?? nextStep.next}"`);
    setOrder({ ...order, status: nextStep.next });
    setAdvancing(false);
  }

  function handleWhatsApp(ctx: WaContext) {
    if (!phone) {
      toast.error("Cliente sem telefone");
      return;
    }
    const msg = buildWaMessage({
      context: ctx,
      customerName,
      shortId: sid,
    });
    const url = buildWaUrl(phone, msg);
    if (!url) {
      toast.error("Telefone inválido");
      return;
    }
    window.open(url, "_blank", "noopener,noreferrer");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            <span>Detalhes do pedido</span>
            {order && (
              <span className="font-mono text-base text-primary">#{sid}</span>
            )}
            {order && (
              <Badge variant="outline" className="text-[10px] uppercase">
                {STATUS_LABEL[order.status] ?? order.status}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {loading && <div className="py-8 text-center text-muted-foreground">Carregando…</div>}

        {order && !loading && (
          <div className="space-y-4 text-sm">
            {/* Destaque: tipo de serviço */}
            <div
              className={`flex items-center justify-between gap-2 rounded-xl border-2 px-3 py-2.5 ${
                isDelivery
                  ? "border-primary/40 bg-primary/10"
                  : "border-success/40 bg-success/10"
              }`}
            >
              <div className="flex items-center gap-2">
                <Icon size={20} className={isDelivery ? "text-primary" : "text-success"} />
                <span className="font-black uppercase text-sm">
                  {SERVICE_LABEL[order.service_type] ?? order.service_type}
                </span>
              </div>
              <span className="font-mono text-xs text-muted-foreground">#{sid}</span>
            </div>

            {/* Cliente */}
            <section className="space-y-1.5">
              <h3 className="text-xs font-black uppercase text-muted-foreground">Cliente</h3>
              <div className="flex items-center gap-2">
                <User size={14} className="text-muted-foreground" />
                <span className="font-semibold">{order.customer_name_snapshot ?? order.table_name}</span>
              </div>
              {order.customer_phone_snapshot && (
                <div className="flex items-center gap-2">
                  <Phone size={14} className="text-muted-foreground" />
                  <span>{order.customer_phone_snapshot}</span>
                </div>
              )}
            </section>

            {/* Horários */}
            <section className="space-y-1.5">
              <h3 className="text-xs font-black uppercase text-muted-foreground">Horários</h3>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock size={14} />
                Pedido feito às{" "}
                {new Date(order.created_at).toLocaleString("pt-BR", {
                  day: "2-digit",
                  month: "2-digit",
                  hour: "2-digit",
                  minute: "2-digit",
                })}
              </div>
              {order.estimated_ready_at && (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock size={14} />
                  Previsão:{" "}
                  {new Date(order.estimated_ready_at).toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
              )}
            </section>

            {/* Endereço */}
            {isDelivery && addr && (
              <section className="space-y-1.5">
                <h3 className="text-xs font-black uppercase text-muted-foreground">Endereço de entrega</h3>
                <div className="flex items-start gap-2">
                  <MapPin size={14} className="text-muted-foreground mt-0.5" />
                  <pre className="whitespace-pre-wrap font-sans">{addr}</pre>
                </div>
              </section>
            )}

            {/* Pagamento */}
            {payLabel && (
              <section className="space-y-1.5">
                <h3 className="text-xs font-black uppercase text-muted-foreground">Pagamento</h3>
                <div className="flex items-center gap-2">
                  <CreditCard size={14} className="text-muted-foreground" />
                  <span className="font-semibold">{payLabel}</span>
                  {order.payment_method === "cash" && order.change_for != null && (
                    <span className="text-muted-foreground">
                      (troco para R$ {Number(order.change_for).toFixed(2)})
                    </span>
                  )}
                </div>
              </section>
            )}

            {/* Observação geral */}
            {orderNote && (
              <section className="space-y-1.5">
                <h3 className="text-xs font-black uppercase text-muted-foreground">
                  Observação do cliente
                </h3>
                <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-2.5">
                  <StickyNote size={14} className="text-warning mt-0.5 shrink-0" />
                  <span className="italic">{orderNote}</span>
                </div>
              </section>
            )}

            {/* Itens */}
            <section className="space-y-1.5">
              <h3 className="text-xs font-black uppercase text-muted-foreground">
                Itens ({realItems.length})
              </h3>
              <div className="space-y-1.5">
                {realItems.map((it) => (
                  <div key={it.id} className="flex justify-between gap-2 border-b border-border pb-1.5 last:border-0">
                    <div className="min-w-0">
                      <div className="font-semibold">
                        {it.quantity}× {it.product_name}
                      </div>
                      {it.note && (
                        <div className="mt-0.5 inline-flex items-start gap-1 text-xs italic text-warning">
                          <StickyNote size={11} className="mt-0.5 shrink-0" />
                          {it.note}
                        </div>
                      )}
                    </div>
                    <div className="text-right tabular-nums shrink-0">
                      <div>R$ {Number(it.subtotal).toFixed(2)}</div>
                      <div className="text-xs text-muted-foreground">
                        R$ {Number(it.product_price).toFixed(2)}/un
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Totais */}
            <section className="border-t border-border pt-3 space-y-1 tabular-nums">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>R$ {subtotal.toFixed(2)}</span>
              </div>
              {isDelivery && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Taxa de entrega</span>
                  <span>R$ {fee.toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between font-black text-base pt-1">
                <span>Total</span>
                <span>R$ {total.toFixed(2)}</span>
              </div>
            </section>

            {/* Ações */}
            <section className="border-t border-border pt-3 space-y-2">
              {nextStep && (
                <Button
                  className="w-full gap-2 h-11 font-bold"
                  onClick={handleAdvance}
                  disabled={advancing}
                >
                  {advancing ? null : order.status === "done" ? (
                    <CheckCircle2 size={16} />
                  ) : (
                    <ArrowRight size={16} />
                  )}
                  {advancing ? "Atualizando…" : nextStep.label}
                </Button>
              )}
              {phone && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="outline"
                      className="w-full gap-2 h-11 font-bold text-success border-success/30 hover:bg-success/10"
                    >
                      <MessageCircle size={16} /> WhatsApp do cliente
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    <DropdownMenuLabel>Mensagem pronta</DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    {(
                      [
                        "received",
                        "preparing",
                        isDelivery ? "out_for_delivery" : "ready_pickup",
                      ] as WaContext[]
                    ).map((ctx) => (
                      <DropdownMenuItem key={ctx} onClick={() => handleWhatsApp(ctx)}>
                        {WA_CONTEXT_LABEL[ctx]}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </section>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
