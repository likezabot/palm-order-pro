import { CheckCircle2, AlertTriangle, Printer, Clock } from "lucide-react";
import type { PrintJobInfo } from "@/hooks/use-print-jobs-status";

interface Props {
  /** Info do print_job (fonte de verdade nova). Se null, fallback para legado. */
  jobInfo: PrintJobInfo | null;
  /** Fallback: print_status legado da tabela orders. */
  legacyStatus?: string | null;
  size?: "xs" | "sm";
}

/**
 * Badge visual de status de impressão.
 * Prioriza print_jobs sobre orders.print_status.
 * Se não houver job E o legado for "pending" ou nada, NÃO mostra nada
 * (evita "NA FILA" falso para pedidos enviados sem imprimir).
 */
export function PrintStatusBadge({ jobInfo, legacyStatus, size = "xs" }: Props) {
  if (legacyStatus === "printing") {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 ${SIZE[size]} font-bold uppercase bg-primary/10 text-primary border-primary/20`}>
        <Printer className="w-2.5 h-2.5" /> Imprimindo
      </span>
    );
  }

  // Nova fonte de verdade — mas se o job diz "queued"/"printing" e o
  // legado já diz "printed", o status do banco é mais confiável
  // (a RPC complete_order_print atualizou orders mas o job ainda não foi
  // sincronizado por causa de RLS no update direto de print_jobs)
  if (jobInfo && legacyStatus === "printed" && (jobInfo.status === "queued" || jobInfo.status === "printing")) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 ${SIZE[size]} font-bold uppercase bg-success/10 text-success border-success/20`}>
        <CheckCircle2 className="w-2.5 h-2.5" /> Impresso
      </span>
    );
  }

  if (jobInfo) {
    const cfg = STATUS_MAP[jobInfo.status];
    if (!cfg) return null;
    const Icon = cfg.icon;
    return (
      <span
        className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 ${SIZE[size]} font-bold uppercase ${cfg.cls}`}
        title={jobInfo.lastError ? `Erro: ${jobInfo.lastError}` : cfg.label}
      >
        <Icon className="w-2.5 h-2.5" /> {cfg.label}
      </span>
    );
  }

  // Sem job: só mostra badge de "impresso" do legado (caso já tenha sido impresso antes da nova fila)
  if (legacyStatus === "printed") {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full bg-success/10 text-success border border-success/20 px-1.5 py-0.5 ${SIZE[size]} font-bold uppercase`}>
        <CheckCircle2 className="w-2.5 h-2.5" /> Impresso
      </span>
    );
  }
  if (legacyStatus === "failed") {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full bg-destructive/10 text-destructive border border-destructive/20 px-1.5 py-0.5 ${SIZE[size]} font-bold uppercase`}>
        <AlertTriangle className="w-2.5 h-2.5" /> Falha
      </span>
    );
  }

  // pending/queued/printing legados sem job_jobs novo → não mostra nada
  // (foi "enviar sem imprimir" ou aguardando criação do job)
  return null;
}

const SIZE = {
  xs: "text-[9px]",
  sm: "text-[10px]",
};

const STATUS_MAP: Record<string, { label: string; cls: string; icon: typeof CheckCircle2 }> = {
  printed: {
    label: "Impresso",
    cls: "bg-success/10 text-success border-success/20",
    icon: CheckCircle2,
  },
  queued: {
    label: "Na fila",
    cls: "bg-warning/15 text-warning border-warning/30",
    icon: Clock,
  },
  printing: {
    label: "Imprimindo",
    cls: "bg-blue-500/15 text-blue-400 border-blue-500/30",
    icon: Printer,
  },
  failed: {
    label: "Falhou",
    cls: "bg-destructive/10 text-destructive border-destructive/20",
    icon: AlertTriangle,
  },
};
