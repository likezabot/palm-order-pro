/**
 * Auto-teste de config + diff banco/local.
 *
 * Este painel é a PROVA visual de que a config aplicada no Admin é a mesma
 * usada pela impressão real. Fluxo:
 *   1. "Forçar sincronização e imprimir teste" → busca config do banco,
 *      grava no localStorage, imprime cupom listando header/footer/width/
 *      updated_at + APP_BUILD/PRINT_ENGINE.
 *   2. Mostra diff CONFIG_DB_UPDATED_AT vs CONFIG_LOCAL_UPDATED_AT.
 *   3. Se houver diff, botão "Aplicar config do banco neste dispositivo".
 *   4. Avisa quando get_print_config falha (config_source = local_fallback).
 *
 * NÃO mexe em: bridge/EXE/USB/print_jobs/dispatcher/receipt-layout.
 */

import { useEffect, useState, useCallback } from "react";
import {
  syncPrintConfigFromDb,
  fetchPrintConfigDbMeta,
  type PrintConfig,
} from "@/lib/print-config";
import { sendConfigSelfTest } from "@/lib/thermal-printer";
import { APP_BUILD, PRINT_ENGINE_VERSION } from "@/lib/print-engine";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AlertTriangle,
  CheckCircle2,
  Printer,
  RefreshCw,
  Database,
  HardDrive,
} from "lucide-react";
import { toast } from "sonner";

interface Props {
  cfg: PrintConfig;
  /** Chamado quando o usuário aplica a config do banco (sync forçado). */
  onConfigSynced: (next: PrintConfig) => void;
}

type DbMeta = {
  updatedAt: string | null;
  ok: boolean;
  error?: string;
} | null;

function fmt(ts: string | null | undefined): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString("pt-BR");
  } catch {
    return ts;
  }
}

export default function PrintConfigSelfTest({ cfg, onConfigSynced }: Props) {
  const [dbMeta, setDbMeta] = useState<DbMeta>(null);
  const [checkingDb, setCheckingDb] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [lastResult, setLastResult] = useState<
    | null
    | {
        ok: boolean;
        latencyMs: number;
        error?: string;
        printedConfig: {
          headerText: string;
          footerText: string;
          paperWidth: string;
          printSize: string;
          configSource: string;
          configUpdatedAt: string;
        };
      }
  >(null);

  const refreshDbMeta = useCallback(async () => {
    setCheckingDb(true);
    try {
      const meta = await fetchPrintConfigDbMeta();
      setDbMeta(meta);
    } finally {
      setCheckingDb(false);
    }
  }, []);

  useEffect(() => {
    void refreshDbMeta();
    const id = setInterval(refreshDbMeta, 30_000);
    return () => clearInterval(id);
  }, [refreshDbMeta]);

  const localTs = cfg.configUpdatedAt ? Date.parse(cfg.configUpdatedAt) : 0;
  const dbTs = dbMeta?.updatedAt ? Date.parse(dbMeta.updatedAt) : 0;
  const dbOlder = dbTs && localTs && dbTs <= localTs;
  const dbNewer = dbTs && (!localTs || dbTs > localTs);
  const hasDiff = !!(dbTs && localTs && dbTs !== localTs);
  const dbReachable = dbMeta?.ok !== false;

  const handleApplyDb = async () => {
    try {
      const fresh = await syncPrintConfigFromDb();
      onConfigSynced(fresh);
      await refreshDbMeta();
      toast.success("Config do banco aplicada neste dispositivo.");
    } catch (e: any) {
      toast.error(`Falha ao sincronizar: ${e?.message ?? "?"}`);
    }
  };

  const handleForcePrint = async () => {
    setPrinting(true);
    try {
      // 1. Sincroniza do banco antes de imprimir
      let applied = cfg;
      try {
        applied = await syncPrintConfigFromDb();
        onConfigSynced(applied);
      } catch (e) {
        // Segue com cfg local se falhar
        console.warn("[selfTest] sync falhou, imprimindo com cache local", e);
      }
      await refreshDbMeta();

      // 2. Bridge precisa estar configurada
      if (applied.printMode !== "bridge" || !applied.bridgeUrl) {
        toast.error(
          "Ative a Ponte Local com BRIDGE_URL configurada antes de imprimir o teste.",
        );
        setLastResult(null);
        return;
      }

      // 3. Imprime cupom de prova
      const result = await sendConfigSelfTest({
        bridgeUrl: applied.bridgeUrl,
        appBuild: APP_BUILD,
        engineVersion: PRINT_ENGINE_VERSION,
        configSource: applied.configSource ?? "default",
        configUpdatedAt: applied.configUpdatedAt ?? "",
        headerText: applied.headerText ?? "",
        footerText: applied.footerText ?? "",
        paperWidth: applied.paperWidth,
        printSize: applied.printSize,
      });

      setLastResult({
        ...result,
        printedConfig: {
          headerText: applied.headerText ?? "",
          footerText: applied.footerText ?? "",
          paperWidth: applied.paperWidth,
          printSize: applied.printSize,
          configSource: applied.configSource ?? "default",
          configUpdatedAt: applied.configUpdatedAt ?? "",
        },
      });

      if (result.ok) {
        toast.success(`Cupom enviado em ${result.latencyMs}ms.`);
      } else {
        toast.error(`Falha: ${result.error ?? "ponte indisponível"}`);
      }
    } finally {
      setPrinting(false);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-bold uppercase tracking-wide flex items-center gap-2">
          <Printer className="w-4 h-4 text-primary" />
          Auto-teste da config
        </CardTitle>
        <p className="text-[11px] text-muted-foreground leading-snug">
          Prove que a config editada no Admin é a mesma que a impressora está usando.
          Se o papel não bater com o que está aqui, esta instância NÃO é a que imprime
          os pedidos reais — feche EXE/abas/PWAs antigos.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Diff banco vs local */}
        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded-md border p-2 space-y-0.5 min-w-0">
            <div className="flex items-center gap-1 text-muted-foreground font-bold uppercase text-[9px] tracking-wider">
              <Database className="w-3 h-3" /> Banco
            </div>
            <div className="font-mono truncate" title={dbMeta?.updatedAt ?? ""}>
              {checkingDb ? "..." : fmt(dbMeta?.updatedAt ?? null)}
            </div>
            {dbMeta?.ok === false && (
              <div className="text-rose-600 dark:text-rose-400 text-[10px] truncate">
                {dbMeta.error ?? "erro RPC"}
              </div>
            )}
          </div>
          <div className="rounded-md border p-2 space-y-0.5 min-w-0">
            <div className="flex items-center gap-1 text-muted-foreground font-bold uppercase text-[9px] tracking-wider">
              <HardDrive className="w-3 h-3" /> Este dispositivo
            </div>
            <div className="font-mono truncate" title={cfg.configUpdatedAt ?? ""}>
              {fmt(cfg.configUpdatedAt)}
            </div>
            <div className="text-[10px] text-muted-foreground">
              fonte: <span className="font-bold">{cfg.configSource ?? "default"}</span>
            </div>
          </div>
        </div>

        {!dbReachable && (
          <div className="rounded-md bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 p-2 text-[11px] text-rose-800 dark:text-rose-200">
            <AlertTriangle className="w-3.5 h-3.5 inline mr-1 mb-0.5" />
            Não foi possível carregar print_config do banco. A impressão pode usar
            configuração local antiga (CONFIG_SOURCE: local_fallback).
          </div>
        )}

        {hasDiff && dbNewer && dbReachable && (
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-2 text-[11px] text-amber-800 dark:text-amber-200 space-y-2">
            <div>
              <AlertTriangle className="w-3.5 h-3.5 inline mr-1 mb-0.5" />
              <strong>CONFIG_DIFF: sim</strong> — o banco tem versão mais nova que o
              cache deste dispositivo.
            </div>
            <Button size="sm" variant="outline" className="w-full font-bold" onClick={handleApplyDb}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              Aplicar config do banco neste dispositivo
            </Button>
          </div>
        )}

        {hasDiff && dbOlder && dbReachable && (
          <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 p-2 text-[11px] text-amber-800 dark:text-amber-200">
            <AlertTriangle className="w-3.5 h-3.5 inline mr-1 mb-0.5" />
            Cache local mais novo que o banco. Salve a config para subir ao banco.
          </div>
        )}

        {!hasDiff && dbReachable && dbTs > 0 && (
          <div className="rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900 p-2 text-[11px] text-emerald-800 dark:text-emerald-200">
            <CheckCircle2 className="w-3.5 h-3.5 inline mr-1 mb-0.5" />
            Config local idêntica à do banco.
          </div>
        )}

        {/* Config que será impressa */}
        <div className="rounded-md border bg-muted/30 p-2 text-[11px] font-mono space-y-0.5">
          <div className="text-[9px] uppercase font-bold text-muted-foreground tracking-wider mb-1">
            Config que será impressa neste teste
          </div>
          <Row label="HEADER" value={cfg.headerText || "—"} />
          <Row label="FOOTER" value={cfg.footerText || "—"} />
          <Row label="WIDTH" value={cfg.paperWidth} />
          <Row label="SIZE" value={cfg.printSize} />
          <Row label="UPDATED_AT" value={fmt(cfg.configUpdatedAt)} />
          <Row label="APP_BUILD" value={APP_BUILD} />
          <Row label="PRINT_ENGINE" value={PRINT_ENGINE_VERSION} />
        </div>

        <Button
          className="w-full font-bold gap-2"
          onClick={handleForcePrint}
          disabled={printing}
        >
          <Printer className="w-4 h-4" />
          {printing ? "Sincronizando e imprimindo..." : "Forçar sincronização e imprimir teste local"}
        </Button>

        {lastResult && (
          <div
            className={`rounded-md border p-2 text-[11px] space-y-1 ${
              lastResult.ok
                ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900 text-emerald-800 dark:text-emerald-200"
                : "bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-200"
            }`}
          >
            <div className="font-bold flex items-center gap-1.5">
              {lastResult.ok ? (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Cupom enviado em {lastResult.latencyMs}ms
                </>
              ) : (
                <>
                  <AlertTriangle className="w-3.5 h-3.5" /> Falha:{" "}
                  {lastResult.error ?? "ponte indisponível"}
                </>
              )}
            </div>
            {lastResult.ok && (
              <div className="font-mono text-[10px] leading-tight">
                Confira no papel:
                <br />
                HEADER: <strong>{lastResult.printedConfig.headerText}</strong>
                <br />
                FOOTER: <strong>{lastResult.printedConfig.footerText}</strong>
                <br />
                WIDTH: <strong>{lastResult.printedConfig.paperWidth}</strong>
                <br />
                Se o papel mostrar valores diferentes, esta instância NÃO é a
                que imprime os pedidos. Feche EXE/abas/PWAs antigos.
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 min-w-0">
      <span className="text-muted-foreground shrink-0 text-[10px]">{label}</span>
      <span className="font-bold truncate text-right">{value}</span>
    </div>
  );
}
