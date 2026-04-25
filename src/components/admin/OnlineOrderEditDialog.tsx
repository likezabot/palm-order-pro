import { useEffect, useState } from "react";
import { Minus, Plus, Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

type OrderItem = {
  id: string;
  product_name: string;
  product_price: number;
  quantity: number;
  subtotal: number;
  note?: string | null;
};

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  orderId: string | null;
  onUpdated?: () => void;
}

/**
 * Edição mínima de pedido online:
 * - Alterar quantidade ou remover item.
 * - Backend recalcula total = subtotal + delivery_fee.
 */
export default function OnlineOrderEditDialog({
  open,
  onOpenChange,
  orderId,
  onUpdated,
}: Props) {
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState<string | null>(null);
  const [orderInfo, setOrderInfo] = useState<{
    delivery_fee: number;
    total: number;
    table_name: string;
    channel: string;
    status: string;
    service_type: string;
  } | null>(null);
  const { toast } = useToast();

  const load = async () => {
    if (!orderId) return;
    setLoading(true);
    const { data: order } = await supabase
      .from("orders")
      .select("table_name, channel, delivery_fee, total, status, service_type")
      .eq("id", orderId)
      .maybeSingle();
    const { data: rows } = await supabase
      .from("order_items")
      .select("id, product_name, product_price, quantity, subtotal, note")
      .eq("order_id", orderId);
    setItems(((rows ?? []) as OrderItem[]).filter((it) => it.product_name !== "__order_note__"));
    if (order) {
      setOrderInfo({
        delivery_fee: Number(order.delivery_fee ?? 0),
        total: Number(order.total ?? 0),
        table_name: order.table_name,
        channel: order.channel,
        status: order.status,
        service_type: order.service_type,
      });
    }
    setLoading(false);
  };

  useEffect(() => {
    if (open && orderId) load();
    else {
      setItems([]);
      setOrderInfo(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId]);

  const updateItem = async (itemId: string, newQty: number) => {
    if (!orderId) return;
    setWorking(itemId);
    const { error } = await supabase.rpc(
      "admin_edit_online_order_item" as any,
      {
        p_order_id: orderId,
        p_item_id: itemId,
        p_new_quantity: newQty,
      },
    );
    setWorking(null);
    if (error) {
      const msg = String(error.message ?? "");
      let friendly = "Não foi possível atualizar o item.";
      if (msg.includes("not_online_order"))
        friendly = "Apenas pedidos online podem ser editados aqui.";
      else if (msg.includes("order_finalized"))
        friendly = "Pedido já foi finalizado.";
      else if (msg.includes("invalid_quantity"))
        friendly = "Quantidade inválida.";
      toast({
        title: "Erro",
        description: friendly,
        variant: "destructive",
      });
      return;
    }
    toast({
      title: newQty === 0 ? "Item removido" : "Item atualizado",
    });
    await load();
    onUpdated?.();
  };

  const subtotal = items.reduce((s, it) => s + it.subtotal, 0);
  const fee = orderInfo?.service_type === "delivery" ? (orderInfo?.delivery_fee ?? 0) : 0;
  const total = subtotal + fee;
  const isOnline = orderInfo?.channel === "online";
  const isLocked = orderInfo?.status === "paid" || orderInfo?.status === "cancelled";
  const canEdit = isOnline && !isLocked;
  const lockedReason =
    orderInfo?.status === "paid"
      ? "Pedido já foi finalizado/pago — não pode mais ser editado."
      : orderInfo?.status === "cancelled"
        ? "Pedido foi cancelado — edição bloqueada."
        : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Editar pedido
            {orderInfo && (
              <span className="text-sm text-muted-foreground font-normal">
                {orderInfo.table_name}
              </span>
            )}
          </DialogTitle>
        </DialogHeader>

        {!isOnline && orderInfo && (
          <div className="rounded-lg bg-warning/10 text-warning-foreground p-3 text-sm border border-warning/30">
            Esta edição rápida é apenas para pedidos do cardápio online.
          </div>
        )}

        {lockedReason && (
          <div className="rounded-lg bg-destructive/10 text-destructive p-3 text-sm border border-destructive/30 font-semibold">
            {lockedReason}
          </div>
        )}

        {loading ? (
          <div className="py-8 text-center text-muted-foreground">Carregando…</div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-muted-foreground">
            Nenhum item neste pedido.
          </div>
        ) : (
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {items.map((it) => (
              <div
                key={it.id}
                className="flex items-center gap-2 rounded-lg border border-border p-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{it.product_name}</div>
                  <div className="text-xs text-muted-foreground">
                    R$ {it.product_price.toFixed(2)} • Sub: R${" "}
                    {it.subtotal.toFixed(2)}
                  </div>
                  {it.note && (
                    <div className="text-xs italic text-muted-foreground truncate">
                      {it.note}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-9 w-9"
                    disabled={working === it.id || !canEdit}
                    onClick={() =>
                      updateItem(it.id, Math.max(0, it.quantity - 1))
                    }
                  >
                    <Minus size={16} />
                  </Button>
                  <span className="w-8 text-center font-bold tabular-nums">
                    {it.quantity}
                  </span>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-9 w-9"
                    disabled={working === it.id || !canEdit}
                    onClick={() => updateItem(it.id, it.quantity + 1)}
                  >
                    <Plus size={16} />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-9 w-9 text-destructive"
                    disabled={working === it.id || !canEdit}
                    onClick={() => updateItem(it.id, 0)}
                    aria-label="Remover item"
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        {orderInfo && (
          <div className="border-t border-border pt-3 space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span className="tabular-nums">R$ {subtotal.toFixed(2)}</span>
            </div>
            {fee > 0 && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Taxa de entrega</span>
                <span className="tabular-nums">R$ {fee.toFixed(2)}</span>
              </div>
            )}
            <div className="flex justify-between font-black text-base pt-1">
              <span>Total</span>
              <span>R$ {total.toFixed(2)}</span>
            </div>
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
