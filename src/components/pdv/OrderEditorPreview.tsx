
import React, { useMemo } from "react";
import { createReceiptLayoutModel, type LayoutBlock, type BuildLayoutInput } from "@/lib/receipt-layout";
import { loadPrintConfig } from "@/lib/print-config";
import { buildHtmlFromBlocks } from "@/lib/receipt-html";

interface Props {
  input: BuildLayoutInput;
}

export const OrderEditorPreview: React.FC<Props> = ({ input }) => {
  const cfg = useMemo(() => loadPrintConfig(), []);
  
  const layout = useMemo(() => {
    return createReceiptLayoutModel(input, cfg);
  }, [input, cfg]);

  const html = useMemo(() => {
    return buildHtmlFromBlocks(layout.docType, layout.blocks, cfg);
  }, [layout, cfg]);

  return (
    <div className="flex flex-col items-center bg-zinc-100 p-4 rounded-xl border border-border h-full overflow-y-auto">
      <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-widest mb-4">
        Preview Impressão Térmica
      </div>
      
      {/* Simulated Thermal Paper */}
      <div 
        className="bg-white shadow-xl p-4 min-h-full"
        style={{ 
          width: cfg.paperWidth === "58mm" ? "280px" : "380px",
          fontFamily: "'Courier New', Courier, monospace"
        }}
      >
        <div 
          className="thermal-preview-container"
          dangerouslySetInnerHTML={{ __html: html }} 
        />
      </div>
      
      <div className="mt-8 text-[9px] text-zinc-400 italic">
        A largura do preview adapta-se à configuração ({cfg.paperWidth})
      </div>
    </div>
  );
};
