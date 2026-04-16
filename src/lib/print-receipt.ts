/**
 * Sistema de Impressão Térmica — Plano B Espetaria
 * 
 * Usa iframe oculto com documento HTML isolado.
 * Layout profissional otimizado para impressoras 58mm/80mm.
 */

import { loadPrintConfig, savePrintConfig, getFontSizes, type PrintConfig, type PaperWidth } from "./print-config";
import { buildEscPosReceipt, buildEscPosDelta, buildEscPosBill, sendToBridge } from "./thermal-printer";
import { createReceiptLayoutModel, type LayoutBlock, type DocType, type ReceiptItem } from "./receipt-layout";

// ============================================================
// HTML RENDERER a partir do layout model (fonte unica)
// ============================================================

function renderBlocksToHtml(blocks: LayoutBlock[], cfg: PrintConfig): string {
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

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Helper: monta HTML completo a partir do docType + dados, usando layout model. */
function buildHtmlFromLayout(
  docType: DocType,
  title: string,
  data: { tableName?: string; waiterName?: string; items: ReceiptItem[]; total?: number; senha?: string },
  cfg: PrintConfig
): string {
  const layout = createReceiptLayoutModel({ docType, ...data }, cfg);
  return buildHtmlFromBlocks(title, layout.blocks, cfg);
}

/** Helper: monta HTML completo a partir de blocos JA prontos (preserva extras injetados). */
function buildHtmlFromBlocks(title: string, blocks: LayoutBlock[], cfg: PrintConfig): string {
  const body = `<div class="receipt" id="receipt-root">${renderBlocksToHtml(blocks, cfg)}</div>`;
  return wrapHtml(title, cfg, body);
}

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
  const f = getFontSizes(cfg);
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
  return buildHtmlFromLayout(
    "SENHA",
    "Senha",
    {
      items: items.map((i) => ({ ...i, product_price: 0, note: null })),
      senha,
    },
    cfg
  );
}

export function buildReceiptHtml(
  tableName: string,
  waiterName: string,
  items: { product_name: string; quantity: number; product_price: number; note?: string | null }[],
  total: number,
  configOverride?: PrintConfig
): string {
  const cfg = configOverride || loadPrintConfig();
  return buildHtmlFromLayout("PEDIDO", "Cupom", { tableName, waiterName, items, total }, cfg);
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
  
  // No navegador/celular, não imprimir senha para evitar PDF
  console.log("[print] Senha ignorada no modo browser.");
  return false;
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

  // No navegador/celular, não imprimir pedido para evitar PDF
  console.log("[print] Pedido ignorado no modo browser.");
  return false;
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

  // Modo browser: gera HTML a partir da MESMA fonte de layout (sem montagem paralela).
  buildHtmlFromLayout(
    "ACRESCIMO",
    "Acréscimo",
    {
      tableName,
      waiterName,
      items: deltaItems,
      total: deltaItems.reduce((s, i) => s + i.product_price * i.quantity, 0),
    },
    cfg
  );

  console.log("[print] Acréscimo ignorado no modo browser.");
  return false;
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

  // Modo browser: gera HTML a partir da MESMA fonte de layout (sem montagem paralela).
  buildHtmlFromLayout("CONTA", "Conta", { tableName, waiterName, items, total }, cfg);

  console.log("[print] Conta ignorada no modo browser.");
  return false;
}

export async function printCustomerReceipt(
  tableName: string,
  waiterName: string,
  items: { product_name: string; quantity: number; product_price: number; note?: string | null }[],
  total: number,
  paymentMethod: string,
  amountPaid: number,
  customerData?: { name?: string; document?: string } | null
): Promise<boolean> {
  const cfg = loadPrintConfig();
  const COMPANY_CNPJ = "38.000.368/0001-22";
  const payLabel: Record<string, string> = { cash: "DINHEIRO", pix: "PIX", card: "CARTÃO" };
  const change = amountPaid - total;

  // Base estrutural via fonte unica de layout (CONTA: titulo, info, itens, total).
  const layout = createReceiptLayoutModel(
    { docType: "CONTA", tableName, waiterName, items, total },
    cfg
  );

  // Insere blocos extras (cliente / pagamento / troco) imediatamente antes do rodape/cutMark.
  const extras: LayoutBlock[] = [];
  if (customerData?.name) extras.push({ kind: "info", label: "Cliente", value: customerData.name });
  if (customerData?.document) extras.push({ kind: "info", label: "CPF/CNPJ", value: customerData.document });
  if (customerData?.name || customerData?.document) extras.push({ kind: "sep" });
  extras.push({ kind: "info", label: "Pagamento", value: payLabel[paymentMethod] || paymentMethod });
  extras.push({ kind: "info", label: "Valor pago", value: `R$ ${amountPaid.toFixed(2)}` });
  if (paymentMethod === "cash" && change > 0) {
    extras.push({ kind: "info", label: "Troco", value: `R$ ${change.toFixed(2)}` });
  }

  // Insere extras antes do cutMark (e depois do qtyLine, se houver).
  const cutIdx = layout.blocks.findIndex((b) => b.kind === "cutMark");
  const insertAt = cutIdx === -1 ? layout.blocks.length : cutIdx;
  layout.blocks.splice(insertAt, 0, { kind: "sep" }, ...extras);

  // CNPJ entra logo apos o titulo (se visivel), como subheader simples.
  const titleIdx = layout.blocks.findIndex((b) => b.kind === "title");
  if (titleIdx !== -1) {
    layout.blocks.splice(titleIdx + 1, 0, { kind: "info", label: "CNPJ", value: COMPANY_CNPJ });
  }

  // HTML so e gerado para inspecao/log; impressao real ocorre via bridge.
  buildHtmlFromLayout("CONTA", "Comprovante", { tableName, waiterName, items, total }, cfg);

  if (cfg.printMode === "bridge") {
    // Reaproveita a base CONTA para garantir mesma estrutura no papel.
    const payload = buildEscPosBill(tableName, waiterName, items, total, cfg);
    return await sendToBridge(payload, cfg.bridgeUrl);
  }

  console.log("[print] Comprovante do cliente ignorado no modo browser.");
  return false;
}

export async function printTest() {
  const items = [
    { product_name: "Espeto Picanha", quantity: 2, product_price: 15.0, note: "Bem passado" },
    { product_name: "Refrigerante Lata", quantity: 1, product_price: 8.5, note: null },
    { product_name: "Cerveja Original", quantity: 3, product_price: 12.0, note: "Bem gelada" },
  ];
  const ok = await printReceipt("TESTE", "Admin", items, 78.5);
  if (!ok && loadPrintConfig().printMode !== "bridge") {
    // Se falhou por estar no modo browser, avisar no log mas não lançar erro
    console.warn("[print] Teste de impressão bloqueado no navegador.");
  }
  return ok;
}
