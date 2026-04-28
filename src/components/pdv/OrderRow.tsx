import { forwardRef, memo } from "react";
import { Clock, Users, Package, Printer, Pencil, ChevronRight, DollarSign, UtensilsCrossed, Bike, ShoppingBag, Wifi, X, AlertTriangle } from "lucide-react";
import { useElapsedTime } from "@/hooks/use-elapsed-time";
import { formatTableLabel } from "@/lib/utils";
import { usePrintJobsStatus } from "@/hooks/use-print-jobs-status";
import { PrintStatusBadge } from "@/components/pdv/PrintStatusBadge";
import { getOrderKind, isOnlineOrder, KIND_LABEL, KIND_BADGE_CLASS } from "@/lib/order-classification";
import type { Order } from "@/lib/types";
import { getPrintOriginRecords } from "@/lib/print-origin-tracker";

const STATUS_LABEL: Record<string, string> = {
  new: "AGUARDANDO",
  preparing: "PREPARO",
  done: "PRONTO",
};

const STATUS_CHIP: Record<string, string> = {
  new: "bg-blue-500/15 text-blue-400 border-blue-500/30",
  preparing: "bg-warning/15 text-warning border-warning/30",
  done: "bg-success/15 text-success border-success/30",
};

const NEXT_STATUS: Record<string, string | null> = {
  new: "preparing",
  preparing: "done",
  done: null,
};

const ADVANCE_LABEL: Record<string, string> = {
  new: "▶",
  preparing: "✓",
};

const ADVANCE_BTN: Record<string, string> = {
  new: "bg-warning text-warning-foreground hover:bg-warning/90",
  preparing: "bg-success text-success-foreground hover:bg-success/90",
};

interface OrderRowProps {
  order: Order;
  itemCount: number;
  selected: boolean;
  onSelect: () => void;
  onAdvance?: (order: Order) => void;
  onPrint?: (order: Order) => void;
  onEdit?: (order: Order) => void;
  onClose?: (order: Order) => void;
  onCancel?: (order: Order) => void;
  isUnseen?: boolean;
}

const OrderRowImpl = forwardRef<HTMLDivElement, OrderRowProps>(({ order, itemCount, selected, onSelect, onAdvance, onPrint, onEdit, onClose, onCancel, isUnseen }, ref) => {
  const elapsed = useElapsedTime(order.updated_at || order.created_at);
  const { get: getJobInfo } = usePrintJobsStatus();
  const jobInfo = getJobInfo(order.id);

  const status = order.status || "new";
  const next = NEXT_STATUS[status];
  const kind = getOrderKind(order);
  const online = isOnlineOrder(order);
  
  // Verifica se impresso POR ESTA ABA
  const printedAt = (order as any).printed_at || (order as any).print_status === "printed";
  const printedLocally = getPrintOriginRecords().some(r => r.orderId === order.id && r.ok);
  const showPrintWarning = printedAt && !printedLocally;

  const stageMs = Date.now() - new Date(order.updated_at || order.created_at).getTime();
  const stageMin = Math.floor(stageMs / 60000);
  const isCritical = stageMin >= 25;
  const isAlert = !isCritical && stageMin >= 10;

  const borderAccent = isUnseen
    ? "border-l-orange-500"
    : status === "done"
      ? "border-l-success"
      : isCritical
        ? "border-l-destructive"
        : isAlert
          ? "border-l-warning"
          : "border-l-transparent";

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  const getTimeLabel = () => {
    if (!elapsed || elapsed === "agora") return "agora";
    return `${elapsed}`;
  };

  const title = online && order.customer_name_snapshot
    ? order.customer_name_snapshot
    : formatTableLabel(order.table_name, order.original_table_name);

  const KindIcon = kind === "delivery" ? Bike : kind === "pickup" ? ShoppingBag : null;

  return (
    <div
      ref={ref}
      onClick={onSelect}
      className={`group relative flex flex-col h-[148px] p-2.5 rounded-xl border-l-4 border-2 ${borderAccent} transition-all cursor-pointer overflow-hidden ${
        selected
          ? "border-primary bg-primary/10 shadow-[0_0_0_2px_hsl(var(--primary)/0.3)]"
          : isUnseen
            ? "border-orange-500/60 bg-orange-500/10 ring-2 ring-orange-500/40 animate-pulse-active"
            : isCritical
              ? "border-destructive/40 bg-destructive/5 animate-pulse-active"
              : "border-border bg-card hover:border-primary/40 hover:shadow-md"
      }`}
      style={
        isUnseen
          ? ({ ["--pulse-color" as any]: "hsl(24 95% 53% / 0.45)" } as React.CSSProperties)
          : isCritical
            ? ({ ["--pulse-color" as any]: "hsl(var(--destructive) / 0.35)" } as React.CSSProperties)
            : undefined
      }
    >
      {isUnseen && (
        <span className="absolute -top-1.5 -left-1.5 z-30 rounded-full bg-orange-500 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white shadow-lg border border-white/20">
          NOVO
        </span>
      )}

      {/* Botão cancelar (canto sup. direito) */}
      {onCancel && status !== "done" && (
        <button
          onClick={(e) => { stop(e); onCancel(order); }}
          className="absolute top-0 right-0 z-20 p-2.5 text-muted-foreground hover:text-destructive active:scale-90 transition-all bg-destructive/5 hover:bg-destructive/10 rounded-bl-xl border-l border-b border-border/50"
          title="Cancelar pedido"
          aria-label="Cancelar pedido"
        >
          <X size={20} className="drop-shadow-sm" />
        </button>
      )}

      {/* Header: Título + Status */}
      <div className="flex items-start justify-between gap-1.5 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="font-black text-base leading-tight truncate flex items-center gap-1">
            <span className="truncate">{title}</span>
            {order.served_at && (
              <UtensilsCrossed
                className="w-3 h-3 text-success shrink-0"
                aria-label="Pedido servido"
              />
            )}
          </div>
          <div className="mt-0.5 flex items-center gap-1 flex-wrap">
            <span className={`inline-flex items-center gap-0.5 rounded-full border px-1.5 py-px text-[9px] font-black uppercase tracking-wide ${KIND_BADGE_CLASS[kind]}`}>
              {KindIcon && <KindIcon className="w-2.5 h-2.5" />}
              {online ? "ONLINE" : KIND_LABEL[kind]}
            </span>
            <span className={`inline-flex items-center rounded-full border px-1.5 py-px text-[9px] font-black uppercase tracking-wide ${STATUS_CHIP[status] || STATUS_CHIP.new}`}>
              {STATUS_LABEL[status] || status.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      {/* Info compacta */}
      <div className="flex-1 flex flex-col justify-center gap-0.5 py-0.5 text-[11px] text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 min-w-0 truncate">
            <Users className="w-3 h-3 shrink-0" />
            <span className="truncate font-medium text-foreground/80">{order.waiter_name || "—"}</span>
          </span>
          <span className="inline-flex items-center gap-1 shrink-0">
            <Package className="w-3 h-3" />
            <span>{itemCount}</span>
          </span>
          <span className="inline-flex items-center gap-1 shrink-0">
            <Clock className="w-3 h-3" />
            <span className="font-medium text-foreground">{getTimeLabel()}</span>
          </span>
        </div>
        <div className="flex items-center justify-end gap-1.5">
          {showPrintWarning && (
            <div className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 text-[9px] font-bold uppercase" title="Impresso por outra aba ou instância antiga">
              <AlertTriangle className="w-2.5 h-2.5" /> ORIGEM EXTERNA
            </div>
          )}
          <PrintStatusBadge jobInfo={jobInfo} legacyStatus={order.print_status} />
        </div>
      </div>

      {/* Base: valor + ações */}
      <div className="flex items-end justify-between gap-1 pt-1.5 border-t border-border/50">
        <div className="font-black text-lg text-primary leading-none">R$ {(order.total || 0).toFixed(2)}</div>
        <div className="flex items-center gap-0.5" onClick={stop}>
          {onPrint && (
            <button
              onClick={(e) => { stop(e); onPrint(order); }}
              className="p-1.5 rounded-md bg-secondary text-foreground active:scale-95 transition-transform shrink-0 hover:bg-secondary/80"
              title="Imprimir"
              aria-label="Imprimir"
            >
              <Printer size={13} />
            </button>
          )}
          {onEdit && status !== "done" && (
            <button
              onClick={(e) => { stop(e); onEdit(order); }}
              className="p-1.5 rounded-md bg-secondary text-foreground active:scale-95 transition-transform shrink-0 hover:bg-secondary/80"
              title="Editar itens"
              aria-label="Editar itens"
            >
              <Pencil size={13} />
            </button>
          )}
          {next && onAdvance ? (
            <button
              onClick={(e) => { stop(e); onAdvance(order); }}
              className={`rounded-md px-2.5 py-1.5 font-black text-xs tracking-wide active:scale-95 transition-transform min-h-[28px] ${ADVANCE_BTN[status] || "bg-secondary text-foreground"}`}
              title={`Avançar para ${STATUS_LABEL[next]}`}
              aria-label="Avançar status"
            >
              {ADVANCE_LABEL[status] || <ChevronRight size={13} />}
            </button>
          ) : status === "done" && onClose ? (
            <button
              onClick={(e) => { stop(e); onClose(order); }}
              className="rounded-md bg-gradient-to-r from-primary to-primary/80 px-2.5 py-1.5 font-black text-xs tracking-wide text-primary-foreground active:scale-95 transition-transform min-h-[28px] flex items-center gap-1"
            >
              <DollarSign size={12} /> FECHAR
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
});
OrderRowImpl.displayName = "OrderRow";

export const OrderRow = memo(OrderRowImpl) as typeof OrderRowImpl;
