import { forwardRef } from "react";
import { Clock, CheckCircle2, Users, Package, Printer, Pencil, ChevronRight, AlertTriangle, DollarSign } from "lucide-react";
import { useElapsedTime } from "@/hooks/use-elapsed-time";
import { formatTableLabel } from "@/lib/utils";
import type { Order } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  new: "AGUARDANDO",
  preparing: "EM PREPARO",
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
  new: "▶ PREPARAR",
  preparing: "✅ PRONTO",
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
  /** Avança status (1 clique). Se omitido, botão de avanço some. */
  onAdvance?: (order: Order) => void;
  /** Imprimir cupom (opcional). */
  onPrint?: (order: Order) => void;
  /** Editar pedido (opcional). */
  onEdit?: (order: Order) => void;
  /** Quando status === "done", o que fazer (ex: abrir pagamento). Default = onSelect. */
  onClose?: (order: Order) => void;
}

export const OrderRow = forwardRef<HTMLDivElement, OrderRowProps>(({ order, itemCount, selected, onSelect, onAdvance, onPrint, onEdit, onClose }, ref) => {
  // Cronômetro do TEMPO NA ETAPA ATUAL (updated_at)
  const elapsed = useElapsedTime(order.updated_at || order.created_at);
  const wasPrinted = order.print_status === "printed";
  const printFailed = order.print_status === "failed";

  const status = order.status || "new";
  const next = NEXT_STATUS[status];

  // Urgência baseada em tempo na etapa atual
  const stageMs = Date.now() - new Date(order.updated_at || order.created_at).getTime();
  const stageMin = Math.floor(stageMs / 60000);
  const isCritical = stageMin >= 25;
  const isAlert = !isCritical && stageMin >= 10;

  const borderAccent = isCritical
    ? "border-l-destructive"
    : isAlert
      ? "border-l-warning"
      : "border-l-transparent";

  const stop = (e: React.MouseEvent) => e.stopPropagation();

  // Texto do tempo padronizado: "Em preparo há 2 min" / "Pronto há 6 min"
  const getTimeLabel = () => {
    if (!elapsed || elapsed === "agora") return "agora";
    const statusText = status === "new" ? "Aguardando" : status === "preparing" ? "Em preparo" : "Pronto";
    return `${statusText} há ${elapsed}`;
  };

  return (
    <div
      onClick={onSelect}
      className={`relative flex flex-col p-3 rounded-xl border-l-4 border-2 ${borderAccent} transition-all cursor-pointer ${
        selected
          ? "border-primary bg-primary/10 shadow-[0_0_0_2px_hsl(var(--primary)/0.3)]"
          : isCritical
            ? "border-destructive/40 bg-destructive/5 animate-pulse-active"
            : "border-border bg-card hover:border-primary/40 hover:shadow-md"
      }`}
      style={isCritical ? ({ ["--pulse-color" as any]: "hsl(var(--destructive) / 0.35)" } as React.CSSProperties) : undefined}
    >
      {/* Header: Mesa + Status */}
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="font-black text-xl leading-tight break-words">
            {formatTableLabel(order.table_name, order.original_table_name)}
          </div>
          {order.original_table_name && order.table_name !== order.original_table_name && order.table_name !== "BALCÃO" && (
            <div className="text-[10px] font-bold text-muted-foreground">(Mesa {order.original_table_name})</div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-black uppercase tracking-wide ${STATUS_CHIP[status] || STATUS_CHIP.new}`}>
            {STATUS_LABEL[status] || status.toUpperCase()}
          </span>
          {wasPrinted && (
            <span className="inline-flex items-center gap-1 rounded-full bg-success/10 text-success border border-success/20 px-1.5 py-0.5 text-[9px] font-bold uppercase">
              <CheckCircle2 className="w-2.5 h-2.5" /> Impresso
            </span>
          )}
          {printFailed && (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive border border-destructive/20 px-1.5 py-0.5 text-[9px] font-bold uppercase">
              <AlertTriangle className="w-2.5 h-2.5" /> Falha
            </span>
          )}
        </div>
      </div>

      {/* Info central compacta */}
      <div className="flex-1 flex flex-col justify-center gap-1 py-1">
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1 min-w-0">
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate font-medium text-foreground/80">{order.waiter_name || "—"}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Package className="w-3.5 h-3.5 shrink-0" />
            <span>{itemCount} {itemCount === 1 ? "item" : "itens"}</span>
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span className="font-medium text-foreground">{getTimeLabel()}</span>
        </div>
      </div>

      {/* Base: valor + ações */}
      <div className="flex items-end justify-between gap-2 pt-2 border-t border-border/50">
        <div className="font-black text-2xl text-primary leading-none">R$ {(order.total || 0).toFixed(2)}</div>
        <div className="flex items-center gap-1" onClick={stop}>
          {onPrint && (
            <button
              onClick={(e) => { stop(e); onPrint(order); }}
              className="p-2 rounded-lg bg-secondary text-foreground active:scale-95 transition-transform shrink-0 hover:bg-secondary/80"
              title="Imprimir"
              aria-label="Imprimir"
            >
              <Printer size={16} />
            </button>
          )}
          {onEdit && (
            <button
              onClick={(e) => { stop(e); onEdit(order); }}
              className="p-2 rounded-lg bg-secondary text-foreground active:scale-95 transition-transform shrink-0 hover:bg-secondary/80"
              title="Editar"
              aria-label="Editar"
            >
              <Pencil size={16} />
            </button>
          )}
          {next && onAdvance ? (
            <button
              onClick={(e) => { stop(e); onAdvance(order); }}
              className={`rounded-lg px-3 py-2 font-black text-xs tracking-wide active:scale-95 transition-transform min-h-[36px] ${ADVANCE_BTN[status] || "bg-secondary text-foreground"}`}
              title={`Avançar para ${STATUS_LABEL[next]}`}
              aria-label="Avançar status"
            >
              {ADVANCE_LABEL[status] || <ChevronRight size={16} />}
            </button>
          ) : status === "done" && onClose ? (
            <button
              onClick={(e) => { stop(e); onClose(order); }}
              className="rounded-lg bg-gradient-to-r from-primary to-primary/80 px-3 py-2 font-black text-xs tracking-wide text-primary-foreground active:scale-95 transition-transform min-h-[36px]"
            >
              <DollarSign size={14} className="inline mr-1" /> FECHAR
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
};
