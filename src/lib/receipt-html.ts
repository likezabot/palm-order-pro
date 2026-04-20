/**
 * Renderização HTML do cupom — extraído de print-receipt.ts.
 *
 * Converte os blocos canônicos de receipt-layout para HTML + CSS
 * otimizado para iframes de impressão térmica 58mm/80mm.
 */
import { getFontSizes, type PrintConfig, type PaperWidth } from "./print-config";
import { createReceiptLayoutModel, type LayoutBlock, type DocType, type ReceiptItem } from "./receipt-layout";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function renderBlocksToHtml(blocks: LayoutBlock[], cfg: PrintConfig): string {
  const f = getFontSizes(cfg);
  const parts: string[] = [];

  for (const blk of blocks) {
    switch (blk.kind) {
      case "title":
        parts.push(`<div class="header-text">${escapeHtml(blk.text)}</div>`);
        break;
      case "banner":
        parts.push(
          `<div class="center bold" style="font-size:${f.total}px;margin:6px 0;">${escapeHtml(blk.text)}</div>`
        );
        break;
      case "sep":
        parts.push(blk.bold ? `<hr class="sep-bold">` : `<hr class="sep">`);
        break;
      case "info":
        parts.push(
          `<div class="info-row"><span class="info-label">${escapeHtml(blk.label)}:</span> <span class="info-value">${escapeHtml(blk.value)}</span></div>`
        );
        break;
      case "item": {
        const right =
          blk.subtotal > 0
            ? `<span class="item-right">R$${blk.subtotal.toFixed(2)}</span>`
            : "";
        const note = blk.note
          ? `<div class="item-note">↳ ${escapeHtml(blk.note)}</div>`
          : "";
        parts.push(
          `<div class="item-row"><span class="item-left"><span class="item-qty">${blk.quantity}x</span> ${escapeHtml(blk.name)}</span>${right}</div>${note}`
        );
        break;
      }
      case "total":
        parts.push(
          `<div class="total-block"><div class="total-row"><span>${escapeHtml(blk.label)}</span><span>${escapeHtml(blk.value)}</span></div></div>`
        );
        break;
      case "qtyLine":
        parts.push(`<div class="qty-line">${escapeHtml(blk.text)}</div>`);
        break;
      case "senha":
        parts.push(`<div class="senha-num">${escapeHtml(blk.text)}</div>`);
        break;
      case "senhaTitle":
        parts.push(`<div class="senha-title">${escapeHtml(blk.text)}</div>`);
        break;
      case "itemTableHeader":
        parts.push(
          `<div class="item-table-row item-table-head"><span>Qtd</span><span>Item</span><span class="ta-right">Unit</span><span class="ta-right">Total</span></div>`
        );
        break;
      case "itemTableRow":
        parts.push(
          `<div class="item-table-row"><span>${blk.quantity}</span><span class="it-name">${escapeHtml(blk.name)}</span><span class="ta-right">${blk.unit.toFixed(2)}</span><span class="ta-right">${blk.subtotal.toFixed(2)}</span></div>`
        );
        break;
      case "itemTableTotal":
        parts.push(
          `<div class="item-table-total"><span>TOTAL</span><span>${escapeHtml(blk.value)}</span></div>`
        );
        break;
      case "footer":
        parts.push(`<div class="footer">${escapeHtml(blk.text)}</div>`);
        break;
      case "cutMark":
        parts.push(`<div class="cut">✂ --------------------------------</div>`);
        break;
    }
  }
  return parts.join("\n");
}

function contentWidth(paper: PaperWidth): string {
  return paper === "58mm" ? "48mm" : "72mm";
}

export function thermalCSS(cfg: PrintConfig): string {
  const paper = cfg.paperWidth;
  const cw = contentWidth(paper);
  const f = getFontSizes(cfg);
  const pad = paper === "58mm" ? "2mm" : "4mm";

  return `
    @page { size: ${paper} auto !important; margin: 0 !important; padding: 0 !important; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: ${paper} !important; max-width: ${paper} !important; min-width: ${paper} !important;
      height: auto !important; margin: 0 !important; padding: 0 !important;
      background: #fff !important; color: #000 !important;
      font-family: 'Courier New', Courier, monospace !important;
      font-size: ${f.base}px !important; line-height: ${f.lineHeight} !important;
      overflow: visible !important;
      -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important;
    }
    .receipt {
      width: ${cw} !important; max-width: ${cw} !important;
      padding: 3mm ${pad} 4mm ${pad} !important; margin: 0 auto !important;
    }
    .center { text-align: center !important; } .bold { font-weight: bold !important; }
    .header-text {
      font-size: ${f.title}px !important; font-weight: 900 !important; text-align: center !important;
      letter-spacing: 1px !important; padding: 6px 0 4px 0 !important; text-transform: uppercase !important;
    }
    .sep { border: none !important; border-top: 1px dashed #000 !important; margin: 5px 0 !important; }
    .sep-bold { border: none !important; border-top: 2px solid #000 !important; margin: 5px 0 !important; }
    .info-row {
      display: block !important;
      text-align: ${cfg.contentAlign === "left" ? "left" : "center"} !important;
      padding: 2px 0 !important; font-size: ${f.base}px !important;
    }
    .info-label { font-weight: bold !important; text-transform: uppercase !important; font-size: ${f.base - 1}px !important; }
    .info-value { font-weight: 900 !important; }
    .item-row {
      display: block !important;
      text-align: ${cfg.contentAlign === "left" ? "left" : "center"} !important;
      padding: 3px 0 !important; font-size: ${f.base}px !important;
    }
    .item-left { display: inline !important; word-break: break-word !important; }
    .item-qty { font-weight: 900 !important; display: inline !important; margin-right: 4px !important; }
    .item-right {
      display: inline !important;
      text-align: ${cfg.contentAlign === "left" ? "right" : "center"} !important;
      font-weight: bold !important; white-space: nowrap !important; margin-left: 6px !important;
    }
    .item-note {
      text-align: ${cfg.contentAlign === "left" ? "left" : "center"} !important;
      font-size: ${f.note}px !important; color: #333 !important;
      font-style: italic !important; margin-bottom: 2px !important;
      ${cfg.contentAlign === "left" ? "padding-left: 16px !important;" : ""}
    }
    .total-block { padding: 6px 0 !important; }
    .total-row {
      font-size: ${f.total}px !important; font-weight: 900 !important; display: block !important;
      text-align: ${cfg.contentAlign === "left" ? "right" : "center"} !important;
      letter-spacing: 0.5px !important;
    }
    .total-row span { display: inline !important; margin: 0 4px !important; }
    .qty-line { font-size: ${f.base - 1}px !important; text-align: center !important; color: #555 !important; padding: 2px 0 !important; }
    .senha-num {
      font-size: ${f.senha}px !important; font-weight: 900 !important; text-align: center !important;
      line-height: 1.1 !important; margin: 8px 0 !important; letter-spacing: 3px !important;
    }
    .senha-title {
      font-size: ${Math.round(f.senha * 0.55)}px !important; font-weight: 900 !important;
      text-align: center !important; line-height: 1.1 !important; margin: 4px 0 6px 0 !important;
      letter-spacing: 2px !important; text-transform: uppercase !important;
    }
    .item-table-row {
      display: grid !important;
      grid-template-columns: 2.2em 1fr 3.6em 3.6em !important;
      gap: 2px !important;
      font-size: ${f.base}px !important;
      font-family: 'Courier New', Courier, monospace !important;
      padding: 1px 0 !important;
      align-items: baseline !important;
    }
    .item-table-row .ta-right { text-align: right !important; }
    .item-table-row .it-name { word-break: break-word !important; text-transform: uppercase !important; }
    .item-table-head { font-weight: 900 !important; text-transform: uppercase !important; }
    .item-table-total {
      display: flex !important; justify-content: space-between !important;
      font-size: ${f.total}px !important; font-weight: 900 !important;
      padding: 4px 0 !important; letter-spacing: 0.5px !important;
    }
    .footer { font-size: ${f.footer}px !important; text-align: center !important; margin-top: 8px !important; color: #555 !important; }
    .cut { text-align: center !important; font-size: 8px !important; color: #aaa !important; margin-top: 5mm !important; letter-spacing: 2px !important; }
    @media print {
      html, body {
        width: ${paper} !important; max-width: ${paper} !important; min-width: ${paper} !important;
        height: auto !important; margin: 0 !important; padding: 0 !important; overflow: visible !important;
      }
    }
  `;
}

export function wrapHtml(title: string, cfg: PrintConfig, body: string): string {
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

/** Helper: monta HTML completo a partir do docType + dados, usando layout model. */
export function buildHtmlFromLayout(
  docType: DocType,
  title: string,
  data: { tableName?: string; waiterName?: string; items: ReceiptItem[]; total?: number; senha?: string },
  cfg: PrintConfig,
): string {
  const layout = createReceiptLayoutModel({ docType, ...data }, cfg);
  return buildHtmlFromBlocks(title, layout.blocks, cfg);
}

/** Helper: monta HTML completo a partir de blocos JA prontos (preserva extras injetados). */
export function buildHtmlFromBlocks(title: string, blocks: LayoutBlock[], cfg: PrintConfig): string {
  const body = `<div class="receipt" id="receipt-root">${renderBlocksToHtml(blocks, cfg)}</div>`;
  return wrapHtml(title, cfg, body);
}
