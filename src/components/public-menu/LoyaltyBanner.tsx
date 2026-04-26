/**
 * Banner discreto de fidelidade exibido no topo do cardápio público,
 * apenas se setting loyalty_enabled = true.
 */
import { useEffect, useState } from "react";
import { Gift } from "lucide-react";
import { fetchLoyaltyEnabled } from "@/lib/loyalty";

export default function LoyaltyBanner() {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchLoyaltyEnabled().then((v) => {
      if (!cancelled) setEnabled(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!enabled) return null;
  return (
    <div className="mx-auto max-w-3xl px-4 mt-3">
      <div className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
        <Gift size={16} className="text-primary shrink-0" />
        <span className="text-foreground">
          Ganhe <strong>1 ponto</strong> a cada R$ 1 em pedidos online e troque por brindes.
        </span>
      </div>
    </div>
  );
}
