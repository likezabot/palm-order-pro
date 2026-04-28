/**
 * Painel "Origem dos pedidos reais"
 *
 * Mostra as últimas impressões REAIS (sendToBridge) que ESTA instância
 * efetivamente executou. Se nenhum registro aparece mas papel sai mesmo
 * assim, então o papel veio de outra aba/EXE/PWA/cache antigo.
 */

import { useEffect, useState } from "react";
import {
  getPrintOriginRecords,
  subscribePrintOrigin,
  type PrintOriginRecord,
} from "@/lib/print-origin-tracker";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, CheckCircle2, Copy, Inbox, RefreshCw, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

function isFetchError(msg?: string | null): boolean {
  if (!msg) return false;
  const m = msg.toLowerCase();
  return m.includes("failed to fetch") || m.includes("networkerror") || m.includes("fetch");
}

function buildInstanceDiagnostic(record: PrintOriginRecord): string {
  const lines = [
    "=== DIAGNÓSTICO DE INSTÂNCIA ===",
    `ts: ${new Date(record.ts).toISOString()}`,
    `ok: ${record.ok}`,
    `erro: ${record.errorMsg ?? "—"}`,
    `bridgeUrl: ${record.bridgeUrl ?? "—"}`,
    `printPath: ${record.printPath}`,
    `source: ${record.source}`,
    `orderId: ${record.orderId ?? "—"}`,
    `orderShortId: ${record.orderShortId ?? "—"}`,
    `serviceType: ${record.serviceType ?? "—"}`,
    `customer: ${record.customerName ?? "—"}`,
    `total: R$ ${record.total?.toFixed(2) ?? "—"}`,
    `items: ${record.itemsCount ?? "—"}`,
    `tableName: ${record.tableName ?? "—"}`,
    `bytes: ${record.bytes ?? "—"}`,
    `APP_BUILD: ${record.appBuild}`,
    `PRINT_ENGINE: ${record.engineVersion}`,
    `userAgent: ${typeof navigator !== "undefined" ? navigator.userAgent : "—"}`,
    `url: ${typeof location !== "undefined" ? location.href : "—"}`,
  ];
  return lines.join("\n");
}

async function copyDiagnostic(record: PrintOriginRecord) {
  const text = buildInstanceDiagnostic(record);
  try {
    if (navigator?.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
    }
    toast.success("Diagnóstico copiado");
  } catch {
    toast.error("Falha ao copiar diagnóstico");
  }
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function sourceTone(source: PrintOriginRecord["source"]) {
  switch (source) {
    case "auto":
      return "default";
    case "manual":
      return "secondary";
    case "reprint":
      return "outline";
    case "queue":
      return "outline";
    case "test":
      return "outline";
    default:
      return "outline";
  }
}

export default function PrintOriginPanel() {
  const [records, setRecords] = useState<PrintOriginRecord[]>(() => getPrintOriginRecords());

  useEffect(() => {
    const unsub = subscribePrintOrigin(() => {
      setRecords(getPrintOriginRecords());
    });
    return () => {
      unsub();
    };
  }, []);

  const last = records[0] ?? null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-bold uppercase tracking-wide flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Inbox className="w-4 h-4" />
            Origem dos pedidos reais
          </span>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            onClick={() => setRecords(getPrintOriginRecords())}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span className="text-xs">Atualizar</span>
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-[11px] text-muted-foreground leading-snug">
          Lista as últimas impressões REAIS (pedidos) que <strong>esta aba</strong> enviou.
          Se um pedido sai no papel mas <strong>nada aparece aqui</strong>, então outra
          instância (aba antiga, EXE, PWA ou cache) está imprimindo — não esta.
        </p>

        {records.length === 0 ? (
          <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 dark:border-amber-900 p-3 text-xs text-amber-800 dark:text-amber-200">
            <AlertTriangle className="w-4 h-4 inline mr-1 mb-0.5" />
            <strong>Nenhum pedido real foi enviado por esta instância ainda.</strong>{" "}
            Se mesmo assim saiu papel de pedido, ele veio de outra aba/EXE/PWA/cache.
          </div>
        ) : (
          <>
            {/* Última impressão em destaque */}
            {last && <LastOriginCard record={last} />}

            {/* Histórico (até 20) */}
            <div className="space-y-1">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Histórico ({records.length})
              </div>
              <div className="rounded-md border divide-y max-h-72 overflow-auto">
                {records.map((r, i) => (
                  <OriginRow key={`${r.ts}-${i}`} record={r} />
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function LastOriginCard({ record }: { record: PrintOriginRecord }) {
  const Icon = record.ok ? CheckCircle2 : XCircle;
  const tone = record.ok ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400";
  const showFetchAlert = !record.ok && isFetchError(record.errorMsg);
  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="font-bold uppercase tracking-wide flex items-center gap-1.5">
          <Icon className={`w-3.5 h-3.5 ${tone}`} />
          Última impressão
        </span>
        <span className="text-muted-foreground font-mono">{formatTime(record.ts)}</span>
      </div>

      {showFetchAlert && (
        <div className="rounded-md border-2 border-rose-500 bg-rose-50 dark:bg-rose-950/40 dark:border-rose-700 p-2.5 text-[11px] text-rose-800 dark:text-rose-200 leading-snug">
          <div className="flex items-start gap-1.5">
            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
            <div>
              <strong>Esta aba NÃO imprimiu este pedido.</strong> Ela tentou enviar
              para a bridge e falhou (<span className="font-mono">{record.errorMsg}</span>).
              Se mesmo assim saiu papel, outra instância/app antigo imprimiu.
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-mono">
        <Field label="source" value={record.source} />
        <Field label="path" value={record.printPath} />
        <Field label="order" value={record.orderId ? record.orderId.slice(0, 8) : "—"} />
        <Field label="shortId" value={record.orderShortId ?? "—"} />
        <Field label="customer" value={record.customerName ?? "—"} truncate />
        <Field label="total" value={record.total != null ? `R$ ${record.total.toFixed(2)}` : "—"} />
        <Field label="items" value={record.itemsCount != null ? String(record.itemsCount) : "—"} />
        <Field label="service" value={record.serviceType ?? "—"} />
        <Field label="table" value={record.tableName ?? "—"} />
        <Field label="bytes" value={record.bytes != null ? String(record.bytes) : "—"} />
        <Field label="bridge" value={record.bridgeUrl ?? "—"} truncate />
        <Field label="ok" value={record.ok ? "true" : "false"} />
        <Field label="app" value={record.appBuild.slice(0, 16)} />
        <Field label="engine" value={record.engineVersion} />
      </div>
      {record.errorMsg && !showFetchAlert && (
        <div className="text-[11px] text-rose-600 dark:text-rose-400 font-mono break-words">
          erro: {record.errorMsg}
        </div>
      )}

      <div className="flex justify-end pt-1">
        <Button
          size="sm"
          variant="outline"
          className="h-7 gap-1.5"
          onClick={() => copyDiagnostic(record)}
        >
          <Copy className="w-3 h-3" />
          <span className="text-[11px]">Copiar diagnóstico de instância</span>
        </Button>
      </div>
    </div>
  );
}

function OriginRow({ record }: { record: PrintOriginRecord }) {
  return (
    <div className="px-2.5 py-1.5 text-[11px] flex items-center gap-2 min-w-0">
      <span className={record.ok ? "text-emerald-500" : "text-rose-500"}>
        {record.ok ? "✓" : "✗"}
      </span>
      <span className="font-mono text-muted-foreground shrink-0">{formatTime(record.ts)}</span>
      <Badge variant={sourceTone(record.source) as any} className="text-[9px] uppercase shrink-0">
        {record.source}
      </Badge>
      <span className="font-mono truncate">{record.printPath}</span>
      <span className="ml-auto font-mono text-muted-foreground shrink-0">
        {record.orderId ? record.orderId.slice(0, 6) : "—"}
      </span>
      <span className="font-mono text-[10px] text-muted-foreground shrink-0">
        {record.serviceType ?? "—"}
      </span>
    </div>
  );
}

function Field({
  label,
  value,
  truncate,
}: {
  label: string;
  value: string;
  truncate?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-1.5 min-w-0">
      <span className="text-muted-foreground shrink-0">{label}:</span>
      <span className={`font-bold ${truncate ? "truncate" : ""}`}>{value}</span>
    </div>
  );
}
