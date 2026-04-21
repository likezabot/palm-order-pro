import { useMemo } from "react";
import { Wifi, WifiOff, AlertTriangle, RefreshCw } from "lucide-react";
import { useConnectivity } from "@/hooks/use-connectivity";
import { forceConnectivityCheck } from "@/lib/connectivity-monitor";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

/**
 * Banner sutil no topo. Só renderiza quando há problema.
 * Auto-dismiss quando tudo voltar.
 */
export default function ConnectivityBanner() {
  const conn = useConnectivity();

  const view = useMemo(() => {
    if (conn.isOffline) {
      return {
        tone: "destructive" as const,
        icon: <WifiOff className="h-4 w-4" />,
        title: "Sem internet",
        desc: "Trabalhando offline. Pedidos serão sincronizados ao reconectar.",
      };
    }
    if (conn.realtime === "offline" || conn.realtime === "degraded") {
      return {
        tone: "warning" as const,
        icon: <AlertTriangle className="h-4 w-4" />,
        title: "Atualizações em tempo real instáveis",
        desc: "Recarregando dados periodicamente como fallback.",
      };
    }
    if (conn.backend === "offline") {
      return {
        tone: "warning" as const,
        icon: <AlertTriangle className="h-4 w-4" />,
        title: "Conexão com servidor degradada",
        desc: "Algumas ações podem demorar mais que o normal.",
      };
    }
    return null;
  }, [conn]);

  if (!view || conn.isFullyOnline) return null;

  const handleReconnect = async () => {
    // Força reconnect dos canais Realtime e re-checa pings.
    try {
      const rt = (supabase as unknown as { realtime?: { disconnect?: () => void; connect?: () => void } }).realtime;
      rt?.disconnect?.();
      rt?.connect?.();
    } catch {
      /* noop */
    }
    await forceConnectivityCheck();
  };

  const bg =
    view.tone === "destructive"
      ? "bg-destructive text-destructive-foreground"
      : "bg-warning text-warning-foreground";

  return (
    <div
      role="status"
      aria-live="polite"
      className={`${bg} px-3 py-2 text-sm flex items-center gap-3 sticky top-0 z-50 shadow-md`}
    >
      <span className="shrink-0">{view.icon}</span>
      <div className="flex-1 min-w-0">
        <div className="font-semibold leading-tight truncate">{view.title}</div>
        <div className="text-xs opacity-90 truncate">{view.desc}</div>
      </div>
      <Button
        size="sm"
        variant="secondary"
        onClick={handleReconnect}
        className="shrink-0 h-8"
      >
        <RefreshCw className="h-3.5 w-3.5 mr-1" />
        Reconectar
      </Button>
    </div>
  );
}
