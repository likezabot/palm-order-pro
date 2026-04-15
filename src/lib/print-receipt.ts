/**
 * Sistema de Impressão Térmica — Plano B Espetaria
 * 
 * Usa iframe oculto com documento HTML isolado.
 * Layout profissional otimizado para impressoras 58mm/80mm.
 */

import { loadPrintConfig, savePrintConfig, getFontSizes, type PrintConfig, type PaperWidth } from "./print-config";
import { buildEscPosReceipt, buildEscPosDelta, buildEscPosBill, sendToBridge } from "./thermal-printer";

export type { PaperWidth };

export function getPaperWidth(): PaperWidth {
  return loadPrintConfig().paperWidth;
}

export function setPaperWidth(width: PaperWidth) {
  const cfg = loadPrintConfig();
  cfg.paperWidth = width;
  savePrintConfig(cfg);
}

// ============================================================
// CSS GENERATION
// ============================================================

function contentWidth(paper: PaperWidth): string {
  return paper === "58mm" ? "48mm" : "72mm";
}

function thermalCSS(cfg: PrintConfig): string {
  const paper = cfg.paperWidth;
  const cw = contentWidth(paper);
  const f = getFontSizes(cfg.printSize);
  const pad = paper === "58mm" ? "2mm" : "4mm";

  return `
    @page {
      size: ${paper} auto !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: ${paper} !important;
      max-width: ${paper} !important;
      min-width: ${paper} !important;
      height: auto !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
      color: #000 !important;
      font-family: 'Courier New', Courier, monospace !important;
      font-size: ${f.base}px !important;
      line-height: ${f.lineHeight} !important;
      overflow: visible !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    .receipt {
      width: ${cw} !important;
      max-width: ${cw} !important;
      padding: 3mm ${pad} 4mm ${pad} !important;
      margin: 0 auto !important;
    }
    .center { text-align: center !important; }
    .bold { font-weight: bold !important; }

    .header-text {
      font-size: ${f.title}px !important;
      font-weight: 900 !important;
      text-align: center !important;
      letter-spacing: 1px !important;
      padding: 6px 0 4px 0 !important;
      text-transform: uppercase !important;
    }

    .sep {
      border: none !important;
      border-top: 1px dashed #000 !important;
      margin: 5px 0 !important;
    }
    .sep-bold {
      border: none !important;
      border-top: 2px solid #000 !important;
      margin: 5px 0 !important;
    }

    .info-row {
      display: flex !important;
      justify-content: space-between !important;
      padding: 2px 0 !important;
      font-size: ${f.base}px !important;
    }
    .info-label {
      font-weight: bold !important;
      text-transform: uppercase !important;
      font-size: ${f.base - 1}px !important;
    }
    .info-value {
      font-weight: 900 !important;
    }

    .item-row {
      display: flex !important;
      justify-content: space-between !important;
      align-items: flex-start !important;
      padding: 3px 0 !important;
      font-size: ${f.base}px !important;
      gap: 4px !important;
    }
    .item-left {
      flex: 1 !important;
      word-break: break-word !important;
    }
    .item-qty {
      font-weight: 900 !important;
      min-width: 28px !important;
      display: inline-block !important;
    }
    .item-right {
      flex-shrink: 0 !important;
      text-align: right !important;
      font-weight: bold !important;
      white-space: nowrap !important;
    }
    .item-note {
      padding-left: 16px !important;
      font-size: ${f.note}px !important;
      color: #333 !important;
      font-style: italic !important;
      margin-bottom: 2px !important;
    }

    .total-block {
      padding: 6px 0 !important;
    }
    .total-row {
      font-size: ${f.total}px !important;
      font-weight: 900 !important;
      display: flex !important;
      justify-content: space-between !important;
      letter-spacing: 0.5px !important;
    }

    .qty-line {
      font-size: ${f.base - 1}px !important;
      text-align: center !important;
      color: #555 !important;
      padding: 2px 0 !important;
    }

    .senha-num {
      font-size: ${f.senha}px !important;
      font-weight: 900 !important;
      text-align: center !important;
      line-height: 1.1 !important;
      margin: 8px 0 !important;
      letter-spacing: 3px !important;
    }

    .footer {
      font-size: ${f.footer}px !important;
      text-align: center !important;
      margin-top: 8px !important;
      color: #555 !important;
    }
    .cut {
      text-align: center !important;
      font-size: 8px !important;
      color: #aaa !important;
      margin-top: 5mm !important;
      letter-spacing: 2px !important;
    }

    @media print {
      html, body {
        width: ${paper} !important;
        max-width: ${paper} !important;
        min-width: ${paper} !important;
        height: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: visible !important;
      }
    }
  `;
}

// ============================================================
// HTML GENERATION
// ============================================================

function wrapHtml(title: string, cfg: PrintConfig, body: string): string {
  const paper = cfg.paperWidth;
  const pxWidth = paper === "58mm" ? 219 : 302;
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=${pxWidth}">
  <title>${title}</title>
  <style>${thermalCSS(cfg)}</style>
</head>
<body>
${body}
</body>
</html>`;
}

export function buildSenhaHtml(
  senha: string,
  items: { product_name: string; quantity: number }[],
  configOverride?: PrintConfig
): string {
  const cfg = configOverride || loadPrintConfig();
  const time = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const itemsHtml = items
    .map((i) => `<div class="item-row"><span class="item-left"><span class="item-qty">${i.quantity}x</span> ${i.product_name}</span></div>`)
    .join("");

  return wrapHtml("Senha", cfg, `
<div class="receipt">
  <div class="header-text">${cfg.headerText}</div>
  <hr class="sep-bold">
  <div class="center" style="font-size:${getFontSizes(cfg.printSize).base - 1}px;color:#555;">BALCÃO • ${time}</div>
  <div class="senha-num">${senha}</div>
  <hr class="sep">
  ${itemsHtml}
  <hr class="sep">
  <div class="footer">${cfg.footerText}</div>
  <div class="cut">✂ --------------------------------</div>
</div>`);
}

export function buildReceiptHtml(
  tableName: string,
  waiterName: string,
  items: { product_name: string; quantity: number; product_price: number; note?: string | null }[],
  total: number,
  configOverride?: PrintConfig
): string {
  const cfg = configOverride || loadPrintConfig();
  const f = getFontSizes(cfg.printSize);
  const now = new Date();
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("pt-BR");
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  const itemsHtml = items
    .map((item) => {
      const sub = (item.product_price * item.quantity).toFixed(2);
      const noteHtml = item.note
        ? `<div class="item-note">↳ ${item.note}</div>`
        : "";
      return `
      <div class="item-row">
        <span class="item-left"><span class="item-qty">${item.quantity}x</span> ${item.product_name}</span>
        <span class="item-right">R$${sub}</span>
      </div>${noteHtml}`;
    })
    .join("");

  return wrapHtml("Cupom", cfg, `
<div class="receipt" id="receipt-root">
  <div class="header-text">${cfg.headerText}</div>
  <hr class="sep-bold">
  <div class="info-row"><span class="info-label">Mesa:</span> <span class="info-value">${tableName}</span></div>
  <div class="info-row"><span class="info-label">Garçom:</span> <span class="info-value">${waiterName}</span></div>
  <div class="info-row"><span class="info-label">Data:</span> <span class="info-value">${date} ${time}</span></div>
  <hr class="sep">
  ${itemsHtml}
  <hr class="sep-bold">
  <div class="total-block">
    <div class="total-row">
      <span>TOTAL</span>
      <span>R$ ${total.toFixed(2)}</span>
    </div>
  </div>
  <hr class="sep">
  <div class="qty-line">Qtd itens: ${totalQty}</div>
  <div class="footer">${cfg.footerText}</div>
  <div class="cut">✂ --------------------------------</div>
</div>`);
}

// ============================================================
// PRINTING VIA HIDDEN IFRAME
// ============================================================

let printLock = false;

function doPrint(html: string, expectedItemCount: number): void {
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

  // Espera a renderização completa
  setTimeout(() => {
    try {
      const frameDoc = iframe.contentDocument || iframe.contentWindow?.document;
      if (!frameDoc) throw new Error("Documento perdeu referência");

      // Validação final do DOM antes de disparar o comando do sistema
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
  }, 800); // Aumentado de 400ms para 800ms para garantir layout em apps desktop
}

// ============================================================
// PUBLIC API
// ============================================================

export async function printSenha(
  senha: string,
  items: { product_name: string; quantity: number }[]
): Promise<boolean> {
  const cfg = loadPrintConfig();
  if (cfg.printMode === "bridge") {
    console.log("[print] Usando ponte térmica para senha");
    const payload = buildEscPosReceipt(
      `SENHA ${senha}`,
      "BALCÃO",
      items.map(i => ({ ...i, product_price: 0, note: null })),
      0,
      cfg
    );
    return await sendToBridge(payload, cfg.bridgeUrl);
  }
  
  doPrint(buildSenhaHtml(senha, items), items.length);
  return true;
}

export async function printReceipt(
  tableName: string,
  waiterName: string,
  items: { product_name: string; quantity: number; product_price: number; note?: string | null }[],
  total: number
) {
  const cfg = loadPrintConfig();
  console.log(`[print] Preparando cupom para Mesa ${tableName}. Modo: ${cfg.printMode}`);

  if (cfg.printMode === "bridge") {
    const payload = buildEscPosReceipt(tableName, waiterName, items, total, cfg);
    const success = await sendToBridge(payload, cfg.bridgeUrl);
    
    if (!success) {
      console.warn("[print] Falha na ponte térmica.");
      // Opcional: só faz fallback se o usuário não exigir erro real
      // Mas o usuário pediu "sem falsa confirmação", então vamos retornar o erro.
      return false;
    }
    return true;
  }

  doPrint(buildReceiptHtml(tableName, waiterName, items, total), items.length);
  return true;
}

export async function printDelta(
  tableName: string,
  waiterName: string,
  deltaItems: { product_name: string; quantity: number; product_price: number; note?: string | null }[]
): Promise<boolean> {
  const cfg = loadPrintConfig();
  console.log(`[print] Preparando ACRÉSCIMO para Mesa ${tableName}. Modo: ${cfg.printMode}`);

  if (cfg.printMode === "bridge") {
    const payload = buildEscPosDelta(tableName, waiterName, deltaItems, cfg);
    return await sendToBridge(payload, cfg.bridgeUrl);
  }

  const deltaTotal = deltaItems.reduce((s, i) => s + i.product_price * i.quantity, 0);
  // Reuse receipt HTML but with ACRÉSCIMO header
  const f = getFontSizes(cfg.printSize);
  const now = new Date();
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("pt-BR");

  const itemsHtml = deltaItems.map((item) => {
    const sub = (item.product_price * item.quantity).toFixed(2);
    const noteHtml = item.note ? `<div class="item-note">↳ ${item.note}</div>` : "";
    return `<div class="item-row"><span class="item-left"><span class="item-qty">${item.quantity}x</span> ${item.product_name}</span><span class="item-right">R$${sub}</span></div>${noteHtml}`;
  }).join("");

  const html = wrapHtml("Acréscimo", cfg, `
<div class="receipt">
  <div class="header-text">${cfg.headerText}</div>
  <hr class="sep-bold">
  <div class="center bold" style="font-size:${f.total}px;margin:6px 0;">*** ACRÉSCIMO ***</div>
  <hr class="sep-bold">
  <div class="info-row"><span class="info-label">Mesa:</span> <span class="info-value">${tableName}</span></div>
  <div class="info-row"><span class="info-label">Garçom:</span> <span class="info-value">${waiterName}</span></div>
  <div class="info-row"><span class="info-label">Data:</span> <span class="info-value">${date} ${time}</span></div>
  <hr class="sep">
  ${itemsHtml}
  <hr class="sep-bold">
  <div class="total-block"><div class="total-row"><span>SUBTOTAL</span><span>R$ ${deltaTotal.toFixed(2)}</span></div></div>
  <hr class="sep">
  <div class="footer">${cfg.footerText}</div>
  <div class="cut">✂ --------------------------------</div>
</div>`);

  doPrint(html, deltaItems.length);
  return true;
}

export async function printBill(
  tableName: string,
  waiterName: string,
  items: { product_name: string; quantity: number; product_price: number; note?: string | null }[],
  total: number
): Promise<boolean> {
  const cfg = loadPrintConfig();
  console.log(`[print] Preparando CONTA para Mesa ${tableName}. Modo: ${cfg.printMode}`);

  if (cfg.printMode === "bridge") {
    const payload = buildEscPosBill(tableName, waiterName, items, total, cfg);
    return await sendToBridge(payload, cfg.bridgeUrl);
  }

  // Reuse receipt HTML but with CONTA header
  const f = getFontSizes(cfg.printSize);
  const now = new Date();
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("pt-BR");
  const totalQty = items.reduce((s, i) => s + i.quantity, 0);

  const itemsHtml = items.map((item) => {
    const sub = (item.product_price * item.quantity).toFixed(2);
    const noteHtml = item.note ? `<div class="item-note">↳ ${item.note}</div>` : "";
    return `<div class="item-row"><span class="item-left"><span class="item-qty">${item.quantity}x</span> ${item.product_name}</span><span class="item-right">R$${sub}</span></div>${noteHtml}`;
  }).join("");

  const html = wrapHtml("Conta", cfg, `
<div class="receipt">
  <div class="header-text">${cfg.headerText}</div>
  <hr class="sep-bold">
  <div class="center bold" style="font-size:${f.total}px;margin:6px 0;">*** CONTA ***</div>
  <hr class="sep-bold">
  <div class="info-row"><span class="info-label">Mesa:</span> <span class="info-value">${tableName}</span></div>
  <div class="info-row"><span class="info-label">Garçom:</span> <span class="info-value">${waiterName}</span></div>
  <div class="info-row"><span class="info-label">Data:</span> <span class="info-value">${date} ${time}</span></div>
  <hr class="sep">
  ${itemsHtml}
  <hr class="sep-bold">
  <div class="total-block"><div class="total-row"><span>TOTAL</span><span>R$ ${total.toFixed(2)}</span></div></div>
  <hr class="sep">
  <div class="qty-line">Qtd itens: ${totalQty}</div>
  <div class="footer">${cfg.footerText}</div>
  <div class="cut">✂ --------------------------------</div>
</div>`);

  doPrint(html, items.length);
  return true;
}

export async function printTest() {
  const items = [
    { product_name: "Espeto Picanha", quantity: 2, product_price: 15.0, note: "Bem passado" },
    { product_name: "Refrigerante Lata", quantity: 1, product_price: 8.5, note: null },
    { product_name: "Cerveja Original", quantity: 3, product_price: 12.0, note: "Bem gelada" },
  ];
  return await printReceipt("TESTE", "Admin", items, 78.5);
}
