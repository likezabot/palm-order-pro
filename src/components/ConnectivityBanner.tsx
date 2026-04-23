import { useEffect, useRef, useState } from "react";
import { Wifi, WifiOff, WifiLow, Loader2 } from "lucide-react";
import { useConnectivity } from "@/hooks/use-connectivity";
import { forceConnectivityCheck } from "@/lib/connectivity-monitor";
import { supabase } from "@/integrations/supabase/client";
import { debugLog } from "@/lib/debug-logger";

/**
 * Indicador discreto de conectividade (canto inferior esquerdo).
 * - Verde: tudo OK → ícone esmaece (quase invisível)
 * - Amarelo: realtime/backend instável → reconnect automático em background
 * - Vermelho: sem internet
 * Click → força reconexão manual.
 */

function tryReconnectRealtime() {
  try {
    const rt = (supabase as unknown as { realtime?: { disconnect?: () => void; connect?: () => void } }).realtime;
    rt?.disconnect?.();
    rt?.connect?.();
    debugLog.info("realtime", "auto-reconnect disparado");
  } catch {
    /* noop */
  }
}

export default function ConnectivityBanner() {
  const conn = useConnectivity();
  const [reconnecting, setReconnecting] = useState(false);
  const lastAutoRef = useRef(0);

  // Auto-reconnect com backoff: tenta a cada 15s enquanto degradado/offline-realtime
  // (se internet estiver OK).
  useEffect(() => {
    if (conn.isOffline) return; // sem internet, não adianta tentar
    const needsReconnect =
      conn.realtime === "degraded" ||
      conn.realtime === "offline" ||
      conn.backend === "offline";
    if (!needsReconnect) return;

    const now = Date.now();
    if (now - lastAutoRef.current > 15_000) {
      lastAutoRef.current = now;
      setReconnecting(true);
      tryReconnectRealtime();
      forceConnectivityCheck().finally(() => {
        setTimeout(() => setReconnecting(false), 1200);
      });
    }

    const id = setInterval(() => {
      lastAutoRef.current = Date.now();
      setReconnecting(true);
      tryReconnectRealtime();
      forceConnectivityCheck().finally(() => {
        setTimeout(() => setReconnecting(false), 1200);
      });
    }, 15_000);

    return () => clearInterval(id);
  }, [conn.isOffline, conn.realtime, conn.backend]);

  // Decide aparência
  let Icon = Wifi;
  let tone = "text-muted-foreground/40"; // quase invisível quando OK
  let title = "Conexão estável";

  if (conn.isOffline) {
    Icon = WifiOff;
    tone = "text-destructive";
    title = "Sem internet — trabalhando offline";
  } else if (conn.realtime === "offline" || conn.backend === "offline") {
    Icon = WifiLow;
    tone = "text-warning";
    title = "Conexão instável — reconectando automaticamente";
  } else if (conn.realtime === "degraded") {
    Icon = WifiLow;
    tone = "text-warning/80";
    title = "Tempo real instável — reconectando";
  }

  const handleClick = async () => {
    setReconnecting(true);
    tryReconnectRealtime();
    await forceConnectivityCheck();
    setTimeout(() => setReconnecting(false), 1200);
  };

  const allOk = !conn.isOffline && conn.realtime !== "offline" && conn.realtime !== "degraded" && conn.backend !== "offline";

  return (
    <button
      type="button"
      onClick={handleClick}
      title={`${title} (clique para reconectar)`}
      aria-label={title}
      className="fixed bottom-2 left-2 z-50 inline-flex items-center justify-center h-7 w-7 rounded-full bg-background/70 backdrop-blur-sm border border-border/50 hover:bg-background transition shadow-sm"
    >
      {reconnecting ? (
        <Loader2 className={`h-3.5 w-3.5 animate-spin ${tone}`} />
      ) : (
        <>
          <Icon className={`h-3.5 w-3.5 ${tone}`} />
          {allOk && (
            <span
              className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-success animate-pulse-live"
              aria-hidden="true"
            />
          )}
        </>
      )}
    </button>
  );
}
