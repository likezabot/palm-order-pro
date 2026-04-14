/**
 * Sistema de Impressão Térmica — Plano B Espetaria
 * Suporta impressoras 58mm e 80mm
 * Usa iframe oculto para impressão limpa (sem popup about:blank)
 */

type PaperWidth = "58mm" | "80mm";

// Largura configurável — salva no localStorage
export function getPaperWidth(): PaperWidth {
  return (localStorage.getItem("paper_width") as PaperWidth) || "80mm";
}

export function setPaperWidth(width: PaperWidth) {
  localStorage.setItem("paper_width", width);
}

// Largura útil de impressão (margem interna da bobina)
function getContentWidth(paper: PaperWidth): string {
  return paper === "58mm" ? "44mm" : "68mm";
}

function buildBaseCSS(paper: PaperWidth): string {
  const contentW = getContentWidth(paper);
  const fontSize = paper === "58mm" ? "11px" : "13px";
  return `
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body {
      width: ${paper};
      height: auto !important;
      min-height: 0 !important;
      max-height: none !important;
      margin: 0;
      padding: 0;
      font-family: 'Courier New', Courier, monospace;
      font-size: ${fontSize};
      color: #000;
      background: #fff;
      overflow: hidden !important;
    }
    @page {
      size: ${paper} auto;
      margin: 0mm !important;
    }
    @media print {
      html, body {
        width: ${paper} !important;
        height: auto !important;
        min-height: 0 !important;
        max-height: none !important;
        overflow: hidden !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      /* Remove headers/footers in print */
      @page { margin: 0mm !important; }
    }
    .receipt {
      width: ${contentW};
      margin: 0 auto;
      padding: 2mm 0 1mm 0;
    }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .separator {
      border: none;
      border-top: 1px dashed #000;
      margin: 3px 0;
    }
    .row {
      display: table;
      width: 100%;
      table-layout: fixed;
    }
    .row .left { 
      display: table-cell; 
      text-align: left;
      word-wrap: break-word;
      overflow-wrap: break-word;
    }
    .row .right { 
      display: table-cell; 
      text-align: right; 
      white-space: nowrap;
      width: 30%;
    }
    .item-note {
      padding-left: 8px;
      font-size: ${paper === "58mm" ? "9px" : "11px"};
      color: #333;
    }
    .title {
      font-size: ${paper === "58mm" ? "13px" : "16px"};
      font-weight: 900;
    }
    .senha-num {
      font-size: ${paper === "58mm" ? "48px" : "64px"};
      font-weight: 900;
      text-align: center;
      line-height: 1.1;
      margin: 4px 0;
    }
    .total-row {
      font-size: ${paper === "58mm" ? "13px" : "15px"};
      font-weight: 900;
    }
    .footer {
      font-size: ${paper === "58mm" ? "8px" : "10px"};
      text-align: center;
      margin-top: 4px;
      color: #555;
    }
  `;
}

/**
 * Imprime usando iframe oculto.
 * Não abre popup, não cria janela about:blank.
 * O diálogo de impressão do navegador vai aparecer (limitação web).
 */
function doPrint(html: string): void {
  // Remove iframe anterior se existir
  const existingFrame = document.getElementById("__thermal_print_frame");
  if (existingFrame) existingFrame.remove();

  const iframe = document.createElement("iframe");
  iframe.id = "__thermal_print_frame";
  iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden;";
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument || iframe.contentWindow?.document;
  if (!doc) {
    console.error("[print] Não foi possível acessar o documento do iframe");
    iframe.remove();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  // Aguardar renderização e chamar print UMA vez
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch (e) {
      console.error("[print] Erro ao imprimir:", e);
    }
    // Limpar iframe após impressão
    setTimeout(() => {
      try { iframe.remove(); } catch {}
    }, 3000);
  }, 300);
}

// ============================================================
// GERAÇÃO DE HTML (separada da impressão)
// ============================================================

export function buildSenhaHtml(
  senha: string,
  items: { product_name: string; quantity: number }[]
): string {
  const paper = getPaperWidth();
  const time = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const itemsHtml = items
    .map((i) => `<div>${i.quantity}x ${i.product_name}</div>`)
    .join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Senha</title>
<style>${buildBaseCSS(paper)}</style>
</head><body>
<div class="receipt">
  <div class="center title">PLANO B ESPETARIA</div>
  <hr class="separator">
  <div class="center">BALCÃO — ${time}</div>
  <div class="senha-num">${senha}</div>
  <hr class="separator">
  ${itemsHtml}
  <hr class="separator">
  <div class="footer">Aguarde sua senha ser chamada</div>
</div>
</body></html>`;
}

export function buildReceiptHtml(
  tableName: string,
  waiterName: string,
  items: { product_name: string; quantity: number; product_price: number; note?: string | null }[],
  total: number
): string {
  const paper = getPaperWidth();
  const now = new Date();
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("pt-BR");

  const itemsHtml = items
    .map((item) => {
      const sub = (item.product_price * item.quantity).toFixed(2);
      const noteHtml = item.note ? `<div class="item-note">OBS: ${item.note}</div>` : "";
      return `
        <div class="row">
          <span class="left">${item.quantity}x ${item.product_name}</span>
          <span class="right">R$${sub}</span>
        </div>${noteHtml}`;
    })
    .join("");

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Cupom</title>
<style>${buildBaseCSS(paper)}</style>
</head><body>
<div class="receipt">
  <hr class="separator">
  <div class="center title">PLANO B ESPETARIA</div>
  <hr class="separator">
  <div>Garçom: ${waiterName}</div>
  <div>Mesa: ${tableName}</div>
  <div>${time} — ${date}</div>
  <hr class="separator">
  ${itemsHtml}
  <hr class="separator">
  <div class="row total-row">
    <span class="left">TOTAL:</span>
    <span class="right">R$${total.toFixed(2)}</span>
  </div>
  <hr class="separator">
  <div class="footer">Plano B Espetaria</div>
</div>
</body></html>`;
}

// ============================================================
// FUNÇÕES PÚBLICAS DE IMPRESSÃO
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
      { product_name: "Item Teste 1", quantity: 2, product_price: 15.0, note: "Sem cebola" },
      { product_name: "Item Teste 2", quantity: 1, product_price: 8.5, note: null },
      { product_name: "Cerveja Teste", quantity: 3, product_price: 10.0, note: null },
    ],
    68.5
  );
}
