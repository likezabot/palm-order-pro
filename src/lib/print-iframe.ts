/**
 * Disparo de impressão via iframe oculto — extraído de print-receipt.ts.
 *
 * Implementa lock global + validação DOM + cleanup robusto para evitar
 * impressões duplicadas e cupons truncados.
 */
import { loadPrintConfig } from "./print-config";

let printLock = false;

export function doPrint(html: string, expectedItemCount: number): void {
  console.log(`[print] Iniciando processo de impressão. Itens esperados: ${expectedItemCount}`);

  if (printLock) {
    console.warn("[print] Impressão bloqueada: outra tarefa em andamento");
    return;
  }

  printLock = true;

  const old = document.getElementById("__thermal_print_frame");
  if (old) old.remove();

  const cfg = loadPrintConfig();
  const pxWidth = cfg.paperWidth === "58mm" ? 219 : 302;

  const iframe = document.createElement("iframe");
  iframe.id = "__thermal_print_frame";
  iframe.style.cssText = `
    position: fixed;
    right: -9999px;
    bottom: -9999px;
    width: ${pxWidth}px;
    height: 800px;
    border: 0;
    visibility: hidden;
    pointer-events: none;
  `;
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    console.error("[print] Erro crítico: Iframe inacessível");
    iframe.remove();
    printLock = false;
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => {
    console.log("[print] Limpando recursos de impressão");
    printLock = false;
    setTimeout(() => {
      try { iframe.remove(); } catch {}
    }, 2000);
  };

  setTimeout(() => {
    try {
      const frameDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!frameDoc) throw new Error("Documento perdeu referência");

      const itemRows = frameDoc.querySelectorAll(".item-row");
      const hasTotal = frameDoc.body.innerText.includes("TOTAL");

      console.log(`[print] Validação DOM: ${itemRows.length} itens encontrados, Total presente: ${hasTotal}`);

      if (itemRows.length < expectedItemCount) {
        console.error(`[print] ERRO: HTML incompleto! Esperava ${expectedItemCount}, encontrou ${itemRows.length}. Cancelando.`);
        cleanup();
        return;
      }

      if (!hasTotal) {
        console.error("[print] ERRO: Bloco de total ausente no HTML final. Cancelando.");
        cleanup();
        return;
      }

      console.log("[print] Disparando window.print()");
      iframe.contentWindow?.focus();
      if (iframe.contentWindow) {
        iframe.contentWindow.onafterprint = cleanup;
      }
      iframe.contentWindow?.print();

      // Fallback cleanup para drivers de impressora que não disparam onafterprint corretamente
      setTimeout(() => {
        if (printLock) cleanup();
      }, 20000);
    } catch (e) {
      console.error("[print] Exceção durante disparo:", e);
      cleanup();
    }
  }, 800);
}
