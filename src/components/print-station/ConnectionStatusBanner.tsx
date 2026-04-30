import { useEffect, useState, useRef } from "react";
import { CheckCircle2, WifiOff, AlertTriangle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { usePrintQueue } from "@/hooks/use-print-queue";

interface Props {
  realtimeStatus: "online" | "offline";
  /** URL base da bridge .exe (ex: http://localhost:3001). Se vazio, não checa. */
  bridgeUrl?: string;
}

function getHealthUrl(bridgeUrl: string): string {
  const [rawPath, query = ""] = bridgeUrl.split("?");
  const base = rawPath.replace(/\/(?:print|health)\/?$/, "").replace(/\/$/, "");
  return `${base}/health${query ? `?${query}` : ""}`;
}

type OverallStatus = "all_ok" | "internet_off" | "realtime_off" | "bridge_off";

/**
 * Banner fixo no topo que mostra:
 * - VERDE quando tudo OK
 * - VERMELHO quando algo cai (internet, Realtime ou bridge .exe)
 * Verifica a bridge .exe a cada 15s via /health.
 */
export default function ConnectionStatusBanner({ realtimeStatus, bridgeUrl }: Props) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [bridgeOnline, setBridgeOnline] = useState<boolean | null>(null); // null = ainda não checou
  const lastStatusRef = useRef<OverallStatus | null>(null);
  const { toast } = useToast();
  const { jobs } = usePrintQueue();
  const pendingCount = jobs.filter((j) => !j.dead).length;

  // Internet do navegador
  useEffect(() => {
    const goOnline = () => setIsOnline(true);
    const goOffline = () => setIsOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  // Polling de saúde da bridge
  useEffect(() => {
    if (!bridgeUrl) {
      setBridgeOnline(null);
      return;
    }
    let cancelled = false;

    const check = async () => {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 4000);
        const res = await fetch(getHealthUrl(bridgeUrl), {
          signal: ctrl.signal,
        });
        clearTimeout(t);
        if (!cancelled) setBridgeOnline(res.ok);
      } catch {
        if (!cancelled) setBridgeOnline(false);
      }
    };

    check();
    const id = setInterval(check, 15_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [bridgeUrl]);

  // Status agregado
  const status: OverallStatus = !isOnline
    ? "internet_off"
    : realtimeStatus === "offline"
    ? "realtime_off"
    : bridgeUrl && bridgeOnline === false
    ? "bridge_off"
    : "all_ok";

  // Toasts em transições
  useEffect(() => {
    const prev = lastStatusRef.current;
    if (prev !== null && prev !== status) {
      if (status === "all_ok") {
        toast({ title: "✓ Conexão restabelecida", description: "Tudo voltou a funcionar." });
      } else if (prev === "all_ok") {
        const map: Record<Exclude<OverallStatus, "all_ok">, string> = {
          internet_off: "Sem internet no PC",
          realtime_off: "Servidor de pedidos desconectado",
          bridge_off: "Impressora local não responde",
        };
        toast({ variant: "destructive", title: "⚠️ Conexão caiu", description: map[status] });
      }
    }
    lastStatusRef.current = status;
  }, [status, toast]);

  if (status === "all_ok") {
    return (
      <div className="sticky top-0 z-50 bg-success text-success-foreground py-2 px-4 flex items-center justify-center gap-2 text-sm font-bold shadow-md">
        <CheckCircle2 className="w-5 h-5" />
        TUDO ONLINE
        <span className="ml-2 inline-block h-2 w-2 rounded-full bg-success-foreground animate-pulse" />
      </div>
    );
  }

  const labels: Record<Exclude<OverallStatus, "all_ok">, { title: string; sub: string; Icon: typeof WifiOff }> = {
    internet_off: {
      title: "PC SEM INTERNET",
      sub: "Verifique o Wi-Fi ou cabo de rede.",
      Icon: WifiOff,
    },
    realtime_off: {
      title: "SERVIDOR DE PEDIDOS DESCONECTADO",
      sub: "Tentando reconectar automaticamente…",
      Icon: AlertTriangle,
    },
    bridge_off: {
      title: "IMPRESSORA LOCAL OFFLINE",
      sub:
        pendingCount > 0
          ? `${pendingCount} ${pendingCount === 1 ? "cupom aguardando" : "cupons aguardando"}. Bridge .exe não responde em ${bridgeUrl}.`
          : `A bridge .exe não responde em ${bridgeUrl}. Verifique se a janela está aberta.`,
      Icon: AlertTriangle,
    },
  };

  const { title, sub, Icon } = labels[status];

  return (
    <div className="sticky top-0 z-50 bg-destructive text-destructive-foreground py-3 px-4 flex items-center gap-3 shadow-lg animate-pulse">
      <Icon className="w-6 h-6 shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-black text-sm uppercase tracking-wider leading-tight">{title}</p>
        <p className="text-xs opacity-90 leading-tight">{sub}</p>
      </div>
    </div>
  );
}
