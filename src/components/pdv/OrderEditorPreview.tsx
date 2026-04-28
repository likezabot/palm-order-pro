
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
    <div className="flex flex-col items-center bg-zinc-100 p-8 h-full overflow-y-auto border-l border-border">
      <div className="flex items-center gap-2 text-[10px] text-zinc-400 font-black uppercase tracking-[0.2em] mb-6">
        <Printer size={12} />
        Preview Impressão
      </div>
      
      {/* Simulated Thermal Paper */}
      <div 
        className="bg-white shadow-2xl p-6 min-h-fit mb-10 transition-all duration-300 ease-in-out"
        style={{ 
          width: cfg.paperWidth === "58mm" ? "300px" : "400px",
          minHeight: "600px",
          fontFamily: "'Courier New', Courier, monospace",
          color: "#1a1a1a"
        }}
      >
        <div 
          className="thermal-preview-container text-[12px] leading-tight"
          dangerouslySetInnerHTML={{ __html: html }} 
        />
      </div>
      
      <div className="mt-8 text-[9px] text-zinc-400 italic">
        A largura do preview adapta-se à configuração ({cfg.paperWidth})
      </div>
    </div>
  );
};
