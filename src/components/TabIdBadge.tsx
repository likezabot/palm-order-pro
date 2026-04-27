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
      aria-label="Copiar ID da aba"
      className={`inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition ${className}`}
    >
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5 opacity-70" />}
    </button>
  );
}
