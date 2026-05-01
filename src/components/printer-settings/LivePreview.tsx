import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Printer } from "lucide-react";
import { Utensils, Store, Truck, Plus } from "lucide-react";
import { createReceiptLayoutModel } from "@/lib/receipt-layout";
import { buildHtmlFromBlocks } from "@/lib/receipt-html";
import type { PrintConfig } from "@/lib/print-config";
import { PREVIEW_INPUTS, type PreviewKind } from "./sample-data";

const TABS: { value: PreviewKind; label: string; Icon: typeof Utensils }[] = [
  { value: "mesa", label: "Mesa", Icon: Utensils },
  { value: "balcao", label: "Balcão", Icon: Store },
  { value: "delivery", label: "Delivery", Icon: Truck },
  { value: "acrescimo", label: "Acréscimo", Icon: Plus },
];

interface Props {
  cfg: PrintConfig;
}

export default function LivePreview({ cfg }: Props) {
  const [kind, setKind] = useState<PreviewKind>("mesa");

  const html = useMemo(() => {
    const layout = createReceiptLayoutModel(PREVIEW_INPUTS[kind], cfg);
    return buildHtmlFromBlocks(layout.docType, layout.blocks, cfg);
  }, [cfg, kind]);

  const paperWidthPx = cfg.paperWidth === "58mm" ? 280 : 360;

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">
        <Printer className="w-4 h-4" />
        Preview ao vivo
      </div>

      <Tabs value={kind} onValueChange={(v) => setKind(v as PreviewKind)} className="mb-4">
        <TabsList className="grid grid-cols-4 w-full">
          {TABS.map(({ value, label, Icon }) => (
            <TabsTrigger key={value} value={value} className="flex items-center gap-1.5 text-xs">
              <Icon className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">{label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <div className="flex-1 flex items-start justify-center bg-zinc-200 dark:bg-zinc-900 rounded-xl p-4 sm:p-6 overflow-y-auto">
        <div
          className="bg-white shadow-2xl rounded-sm"
          style={{
            width: paperWidthPx,
            minHeight: 420,
            color: "#111",
            fontFamily: "'Courier New', Courier, monospace",
            padding: "12px 14px",
          }}
        >
          <div
            className="thermal-preview"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        </div>
      </div>

      <p className="text-[10px] text-muted-foreground text-center mt-3 italic">
        Largura simulada: {cfg.paperWidth} • {cfg.paperWidth === "58mm" ? "32 colunas" : "48 colunas"}
      </p>
    </div>
  );
}
