import { useMemo } from "react";
import { Printer } from "lucide-react";
import { createReceiptLayoutModel } from "@/lib/receipt-layout";
import { buildHtmlFromBlocks } from "@/lib/receipt-html";
import type { PrintConfig } from "@/lib/print-config";

interface Props {
  cfg: PrintConfig;
}

const SAMPLE_INPUT = {
  docType: "SENHA" as const,
  senha: "#042",
  customerName: "Maria",
  customerPhone: "(11) 98888-1234",
  orderId: "preview-senha",
  orderShortId: "042",
  serviceType: "pickup" as const,
  items: [
    { product_name: "Espeto Picanha", quantity: 2, product_price: 15.0 },
    { product_name: "Suco Natural", quantity: 1, product_price: 16.0, note: "Sem açúcar" },
  ],
  total: 46.0,
  paymentMethod: "pix",
};

export default function SenhaPreview({ cfg }: Props) {
  const html = useMemo(() => {
    const layout = createReceiptLayoutModel(SAMPLE_INPUT, cfg);
    return buildHtmlFromBlocks("SENHA", layout.blocks, cfg, "SENHA");
  }, [cfg]);

  const paperWidthPx = cfg.paperWidth === "58mm" ? 280 : 360;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
        <Printer className="w-4 h-4" />
        Preview do cupom de senha
      </div>

      <div className="flex-1 flex items-start justify-center bg-zinc-200 dark:bg-zinc-900 rounded-xl p-4 sm:p-6 overflow-y-auto">
        <iframe
          srcDoc={html}
          title="Preview do cupom de senha"
          scrolling="no"
          style={{
            width: paperWidthPx,
            minHeight: 420,
            border: "none",
            display: "block",
            borderRadius: 2,
            boxShadow: "0 4px 24px rgba(0,0,0,0.18)",
            background: "#fff",
          }}
          onLoad={(e) => {
            const iframe = e.currentTarget;
            try {
              const h = iframe.contentDocument?.body?.scrollHeight;
              if (h && h > 0) iframe.style.height = h + 24 + "px";
            } catch {}
          }}
        />
      </div>

      <p className="text-[10px] text-muted-foreground text-center mt-3 italic">
        Este preview usa o mesmo motor que envia para a impressora térmica.
      </p>
    </div>
  );
}
