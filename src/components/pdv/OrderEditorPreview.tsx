import React, { useMemo, useRef, useEffect } from "react";
import { createReceiptLayoutModel, type BuildLayoutInput } from "@/lib/receipt-layout";
import { loadPrintConfig } from "@/lib/print-config";
import { buildHtmlFromBlocks } from "@/lib/receipt-html";
import { Printer } from "lucide-react";

interface Props {
  input: BuildLayoutInput;
}

/**
 * Preview de impressão isolado num <iframe>.
 *
 * IMPORTANTE: `buildHtmlFromBlocks` retorna um documento HTML COMPLETO com
 * `<style>html,body{font-family:'Courier New'!important}</style>`. Se for
 * injetado via `dangerouslySetInnerHTML` numa <div> normal, o navegador
 * extrai o <style> e aplica GLOBALMENTE — o que vinha sobrescrevendo a
 * fonte Inter da UI inteira (motivo de tudo aparecer em Courier no mobile).
 *
 * O iframe garante isolamento total de CSS/fonte.
 */
export const OrderEditorPreview: React.FC<Props> = ({ input }) => {
  const cfg = useMemo(() => loadPrintConfig(), []);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const html = useMemo(() => {
    const layout = createReceiptLayoutModel(input, cfg);
    return buildHtmlFromBlocks(layout.docType, layout.blocks, cfg);
  }, [input, cfg]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;
    iframe.srcdoc = html;
  }, [html]);

  // Largura aproximada do papel térmico em px.
  const paperPx = cfg.paperWidth === "58mm" ? 240 : 320;

  return (
    <div className="flex flex-col items-center bg-zinc-100 dark:bg-zinc-900 p-4 sm:p-6 h-full overflow-y-auto">
      <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-black uppercase tracking-[0.2em] mb-4">
        <Printer size={12} />
        Preview Impressão
      </div>

      <div
        className="bg-white shadow-2xl mb-6 transition-all duration-300"
        style={{ width: `${paperPx}px` }}
      >
        <iframe
          ref={iframeRef}
          title="Preview de Impressão"
          className="block border-0 bg-white"
          style={{ width: `${paperPx}px`, height: "640px" }}
          sandbox="allow-same-origin"
        />
      </div>

      <div className="text-[9px] text-muted-foreground italic text-center">
        Largura: {cfg.paperWidth}
      </div>
    </div>
  );
};
