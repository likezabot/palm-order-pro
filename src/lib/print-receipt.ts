/**
 * Sistema de Impressão Térmica — Plano B Espetaria
 * 
 * Usa iframe oculto com documento HTML isolado.
 * Configurações dinâmicas via PrintConfig.
 */

import { loadPrintConfig, type PrintConfig } from "./print-config";

export type PaperWidth = "58mm" | "80mm";

export function getPaperWidth(): PaperWidth {
  return loadPrintConfig().paperWidth;
}

export function setPaperWidth(width: PaperWidth) {
  const cfg = loadPrintConfig();
  cfg.paperWidth = width;
  const { savePrintConfig } = require("./print-config");
  savePrintConfig(cfg);
}

// ============================================================
// CSS GENERATION
// ============================================================

function contentWidth(paper: PaperWidth): string {
  return paper === "58mm" ? "48mm" : "72mm";
}

function sidePad(paper: PaperWidth, paddingMm: number): string {
  return `${paddingMm}mm`;
}

export function thermalCSS(cfg: PrintConfig): string {
  const paper = cfg.paperWidth;
  const cw = contentWidth(paper);
  const sp = sidePad(paper, cfg.receiptPadding);

  return `
    @page {
      size: ${paper} auto !important;
      margin: 0 !important;
      padding: 0 !important;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html {
      width: ${paper} !important;
      max-width: ${paper} !important;
      min-width: ${paper} !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
    }

    body {
      width: ${paper} !important;
      max-width: ${paper} !important;
      min-width: ${paper} !important;
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
      color: #000 !important;
      font-family: 'Courier New', Courier, monospace !important;
      font-size: ${cfg.baseFontSize}px !important;
      line-height: ${cfg.lineSpacing} !important;
      overflow: hidden !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    .receipt {
      width: ${cw} !important;
      max-width: ${cw} !important;
      padding: 3mm ${sp} 4mm ${sp} !important;
      margin: 0 auto !important;
    }

    .center { text-align: center !important; }
    .bold { font-weight: bold !important; }

    .separator {
      border: none !important;
      border-top: 1px dashed #000 !important;
      margin: 4px 0 !important;
      padding: 0 !important;
    }

    .separator-double {
      border: none !important;
      border-top: 2px solid #000 !important;
      margin: 4px 0 !important;
      padding: 0 !important;
    }

    .row {
      display: flex !important;
      justify-content: space-between !important;
      align-items: flex-start !important;
      gap: 4px !important;
      width: 100% !important;
      padding: 2px 0 !important;
    }

    .row .left {
      flex: 1 !important;
      text-align: left !important;
      word-break: break-word !important;
      overflow-wrap: break-word !important;
    }

    .row .right {
      flex-shrink: 0 !important;
      text-align: right !important;
      white-space: nowrap !important;
      font-weight: bold !important;
    }

    .item-note {
      padding-left: 12px !important;
      font-size: ${cfg.noteFontSize}px !important;
      color: #333 !important;
      font-style: italic !important;
      margin-bottom: 2px !important;
    }

    .header-text {
      font-size: ${cfg.titleFontSize}px !important;
      font-weight: 900 !important;
      text-align: center !important;
      letter-spacing: 1px !important;
      padding: 4px 0 !important;
    }

    .info-line {
      font-size: ${cfg.baseFontSize - 1}px !important;
      padding: 1px 0 !important;
    }

    .info-label {
      font-weight: bold !important;
      text-transform: uppercase !important;
      font-size: ${cfg.baseFontSize - 2}px !important;
      color: #555 !important;
    }

    .info-value {
      font-weight: bold !important;
    }

    .senha-num {
      font-size: ${cfg.senhaFontSize}px !important;
      font-weight: 900 !important;
      text-align: center !important;
      line-height: 1.1 !important;
      margin: 6px 0 !important;
      letter-spacing: 2px !important;
    }

    .total-block {
      padding: 6px 0 !important;
    }

    .total-row {
      font-size: ${cfg.totalFontSize}px !important;
      font-weight: 900 !important;
      display: flex !important;
      justify-content: space-between !important;
    }

    .item-qty {
      font-weight: 900 !important;
      min-width: 24px !important;
      display: inline-block !important;
    }

    .footer {
      font-size: ${cfg.footerFontSize}px !important;
      text-align: center !important;
      margin-top: 6px !important;
      color: #555 !important;
      padding: 2px 0 !important;
    }

    .cut {
      text-align: center !important;
      font-size: 8px !important;
      color: #aaa !important;
      margin-top: 4mm !important;
      letter-spacing: 2px !important;
    }

    @media print {
      html, body {
        width: ${paper} !important;
        max-width: ${paper} !important;
        min-width: ${paper} !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
        margin: 0 !important;
        padding: 0 !important;
        overflow: hidden !important;
      }
    }
  `;
}

// ============================================================
// HTML GENERATION (public, used by preview)
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
    .map((i) => `<div class="row"><span class="left"><span class="item-qty">${i.quantity}x</span> ${i.product_name}</span></div>`)
    .join("");

  return wrapHtml("Senha", cfg, `
<div class="receipt">
  ${cfg.showEstablishment ? `<div class="header-text">${cfg.headerText}</div>` : ""}
  <hr class="separator-double">
  ${cfg.showDateTime ? `<div class="center info-line">${time}</div>` : ""}
  <div class="center info-line" style="font-size:${cfg.baseFontSize - 2}px;color:#555;">BALCÃO</div>
  <div class="senha-num">${senha}</div>
  <hr class="separator">
  ${itemsHtml}
  <hr class="separator">
  ${cfg.showFooter ? `<div class="footer">${cfg.footerText}</div>` : ""}
  ${cfg.showCutLine ? `<div class="cut">✂ --------------------------------</div>` : ""}
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
  const now = new Date();
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("pt-BR");

  const itemsHtml = items
    .map((item) => {
      const sub = (item.product_price * item.quantity).toFixed(2);
      const noteHtml = (item.note && cfg.showNotes)
        ? `<div class="item-note">↳ ${item.note}</div>`
        : "";
      return `
      <div class="row">
        <span class="left"><span class="item-qty">${item.quantity}x</span> ${item.product_name}</span>
        <span class="right">R$${sub}</span>
      </div>${noteHtml}`;
    })
    .join("");

  const infoLines: string[] = [];
  if (cfg.showTable) infoLines.push(`<div class="info-line"><span class="info-label">Mesa:</span> <span class="info-value">${tableName}</span></div>`);
  if (cfg.showWaiter) infoLines.push(`<div class="info-line"><span class="info-label">Garçom:</span> <span class="info-value">${waiterName}</span></div>`);
  if (cfg.showDateTime) infoLines.push(`<div class="info-line"><span class="info-label">Data:</span> <span class="info-value">${date} ${time}</span></div>`);

  return wrapHtml("Cupom", cfg, `
<div class="receipt">
  ${cfg.showEstablishment ? `<div class="header-text">${cfg.headerText}</div>` : ""}
  <hr class="separator-double">
  ${infoLines.join("\n  ")}
  <hr class="separator">
  ${itemsHtml}
  <hr class="separator-double">
  <div class="total-block">
    <div class="total-row">
      <span>TOTAL</span>
      <span>R$ ${total.toFixed(2)}</span>
    </div>
  </div>
  <hr class="separator">
  <div class="center info-line" style="font-size:${cfg.baseFontSize - 2}px;color:#777;">Qtd itens: ${items.reduce((s, i) => s + i.quantity, 0)}</div>
  ${cfg.showFooter ? `<div class="footer">${cfg.footerText}</div>` : ""}
  ${cfg.showCutLine ? `<div class="cut">✂ --------------------------------</div>` : ""}
</div>`);
}

// ============================================================
// PRINTING VIA HIDDEN IFRAME
// ============================================================

let printLock = false;

function doPrint(html: string): void {
  if (printLock) {
    console.warn("[print] Impressão já em andamento, ignorando chamada duplicada");
    return;
  }
  printLock = true;

  const old = document.getElementById("__thermal_print_frame");
  if (old) old.remove();

  const cfg = loadPrintConfig();
  const paper = cfg.paperWidth;
  const pxWidth = paper === "58mm" ? 219 : 302;

  const iframe = document.createElement("iframe");
  iframe.id = "__thermal_print_frame";
  iframe.style.cssText = `
    position: fixed;
    right: -9999px;
    bottom: -9999px;
    width: ${pxWidth}px;
    height: 600px;
    border: 0;
    visibility: hidden;
    pointer-events: none;
  `;
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    console.error("[print] Não foi possível acessar o documento do iframe");
    iframe.remove();
    printLock = false;
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => {
    printLock = false;
    setTimeout(() => {
      try { iframe.remove(); } catch {}
    }, 1000);
  };

  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      if (iframe.contentWindow) {
        iframe.contentWindow.onafterprint = cleanup;
      }
      iframe.contentWindow?.print();
      setTimeout(() => {
        if (printLock) cleanup();
      }, 15000);
    } catch (e) {
      console.error("[print] Erro ao imprimir:", e);
      cleanup();
    }
  }, 400);
}

// ============================================================
// PUBLIC API
// ============================================================

export function printSenha(
  senha: string,
  items: { product_name: string; quantity: number }[]
) {
  doPrint(buildSenhaHtml(senha, items));
}

export function printReceipt(
  tableName: string,
  waiterName: string,
  items: { product_name: string; quantity: number; product_price: number; note?: string | null }[],
  total: number
) {
  doPrint(buildReceiptHtml(tableName, waiterName, items, total));
}

export function printTest() {
  printReceipt(
    "TESTE",
    "Admin",
    [
      { product_name: "Espeto Picanha", quantity: 2, product_price: 15.0, note: "Bem passado" },
      { product_name: "Refrigerante Lata", quantity: 1, product_price: 8.5, note: null },
      { product_name: "Cerveja Original", quantity: 3, product_price: 12.0, note: "Bem gelada" },
    ],
    78.5
  );
}
