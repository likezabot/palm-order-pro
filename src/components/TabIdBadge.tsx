import { useState } from "react";
import { Copy, Check } from "lucide-react";
import { getTabId, getShortTabId } from "@/lib/tab-id";

/**
 * Selo discreto com o ID da aba. Click → copia o UUID completo.
 * Aparece nas telas que usam Realtime (PDV, Palm, Kitchen) para
 * confirmar visualmente que cada PWA assina um canal único.
 */
export default function TabIdBadge({ className = "" }: { className?: string }) {
  const [copied, setCopied] = useState(false);
  const short = getShortTabId();

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getTabId());
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* noop */
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      title={`Tab ID: ${getTabId()} (clique para copiar)`}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted text-muted-foreground text-[10px] font-mono hover:bg-muted/70 transition ${className}`}
    >
      <span className="opacity-70">tab</span>
      <span>{short}</span>
      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3 opacity-60" />}
    </button>
  );
}
