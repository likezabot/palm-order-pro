import { Clock, CheckCircle2, Users, Package, Printer, ChevronRight, AlertTriangle, DollarSign } from "lucide-react";
import { useElapsedTime } from "@/hooks/use-elapsed-time";
import { formatTableLabel } from "@/lib/utils";
import type { Order } from "@/lib/types";

const STATUS_LABEL: Record<string, string> = {
  new: "AGUARDANDO",
  preparing: "EM PREPARO",
  done: "PRONTO",
};

const STATUS_VERB: Record<string, string> = {
  new: "aguardando",
  preparing: "em preparo",
  done: "pronto",
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
  new: "▶ INICIAR PREPARO",
  preparing: "✅ MARCAR PRONTO",
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
  /** Quando status === "done", o que fazer (ex: abrir pagamento). Default = onSelect. */
  onClose?: (order: Order) => void;
}

export const OrderRow = ({ order, itemCount, selected, onSelect, onAdvance, onPrint, onClose }: OrderRowProps) => {
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

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left flex flex-col gap-2 p-3 rounded-xl border-l-4 border-2 ${borderAccent} transition-all min-h-[180px] ${
        selected
          ? "border-primary bg-primary/10"
          : isCritical
            ? "border-destructive/40 bg-destructive/5 animate-pulse-active"
            : "border-border bg-card hover:border-primary/40"
      }`}
      style={isCritical ? ({ ["--pulse-color" as any]: "hsl(var(--destructive) / 0.35)" } as React.CSSProperties) : undefined}
    >
      {/* Topo: mesa + status */}
      <div className="flex items-start justify-between gap-2 min-w-0">
        <div className="min-w-0 flex-1">
          <div className="font-black text-2xl leading-tight break-words">
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

      {/* Meio: garçom · itens · tempo na etapa */}
      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        <div className="flex items-center gap-3 flex-wrap">
          <span className="inline-flex items-center gap-1 min-w-0">
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate font-semibold text-foreground/80">{order.waiter_name || "—"}</span>
          </span>
          <span className="inline-flex items-center gap-1">
            <Package className="w-3.5 h-3.5 shrink-0" />
            <span>{itemCount} {itemCount === 1 ? "item" : "itens"}</span>
          </span>
        </div>
        <div className="inline-flex items-center gap-1">
          <Clock className="w-3.5 h-3.5 shrink-0" />
          <span className="font-bold text-foreground">há {elapsed || "agora"}</span>
          <span className="text-muted-foreground">{STATUS_VERB[status] || ""}</span>
        </div>
      </div>

      {/* Base: total + ações */}
      <div className="mt-auto flex flex-col gap-2">
        <div className="font-black text-2xl text-primary leading-none">R$ {(order.total || 0).toFixed(2)}</div>
        <div className="flex items-center gap-1.5" onClick={stop}>
          {onPrint && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { stop(e); onPrint(order); }}
              onKeyDown={(e) => { if (e.key === "Enter") { onPrint(order); } }}
              className="p-2 rounded-lg bg-secondary text-foreground active:scale-95 transition-transform shrink-0 cursor-pointer"
              title="Imprimir"
              aria-label="Imprimir"
            >
              <Printer size={16} />
            </span>
          )}
          {next && onAdvance ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { stop(e); onAdvance(order); }}
              onKeyDown={(e) => { if (e.key === "Enter") { onAdvance(order); } }}
              className={`flex-1 inline-flex items-center justify-center gap-1 rounded-lg px-3 py-2 font-black text-xs tracking-wide active:scale-95 transition-transform cursor-pointer ${ADVANCE_BTN[status] || "bg-secondary text-foreground"}`}
              aria-label={ADVANCE_LABEL[status] || "Avançar"}
            >
              {ADVANCE_LABEL[status] || <ChevronRight size={16} />}
            </span>
          ) : status === "done" && onClose ? (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => { stop(e); onClose(order); }}
              onKeyDown={(e) => { if (e.key === "Enter") { onClose(order); } }}
              className="flex-1 inline-flex items-center justify-center gap-1 rounded-lg bg-gradient-to-r from-primary to-primary/80 px-3 py-2 font-black text-xs tracking-wide text-primary-foreground active:scale-95 transition-transform cursor-pointer"
              aria-label="Fechar mesa"
            >
              <DollarSign size={14} /> FECHAR
            </span>
          ) : null}
        </div>
      </div>
    </button>
  );
};
