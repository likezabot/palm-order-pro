/**
 * Sistema de Impressão Térmica — Plano B Espetaria
 * 
 * Estratégia: iframe oculto com documento HTML completamente isolado.
 * O iframe tem dimensões reais (não 0x0) para que o Chrome calcule
 * o layout corretamente no preview de impressão.
 * 
 * Por que o preview ficava errado:
 * - iframe com width:0 height:0 → Chrome assume página A4
 * - @page size sozinho não basta se o documento não tem dimensões reais
 * - O preview mostra o cupom minúsculo no canto de uma folha grande
 * 
 * Solução:
 * - iframe com largura real do papel (58mm/80mm)
 * - HTML/body com largura fixa em mm
 * - @page com size explícito
 * - Nenhum estilo herdado do app
 */

type PaperWidth = "58mm" | "80mm";

export function getPaperWidth(): PaperWidth {
  return (localStorage.getItem("paper_width") as PaperWidth) || "80mm";
}

export function setPaperWidth(width: PaperWidth) {
  localStorage.setItem("paper_width", width);
}

// Largura útil do conteúdo (descontando margens mecânicas da bobina)
function contentWidth(paper: PaperWidth): string {
  return paper === "58mm" ? "48mm" : "72mm";
}

// Padding lateral para centralizar na bobina
function sidePad(paper: PaperWidth): string {
  return paper === "58mm" ? "5mm" : "4mm";
}

function thermalCSS(paper: PaperWidth): string {
  const cw = contentWidth(paper);
  const sp = sidePad(paper);
  const baseFontSize = paper === "58mm" ? "11px" : "13px";
  const titleSize = paper === "58mm" ? "14px" : "16px";
  const senhaSize = paper === "58mm" ? "48px" : "64px";
  const totalSize = paper === "58mm" ? "13px" : "15px";
  const noteSize = paper === "58mm" ? "9px" : "11px";
  const footerSize = paper === "58mm" ? "8px" : "10px";

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
      font-size: ${baseFontSize} !important;
      line-height: 1.3 !important;
      overflow: hidden !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }

    .receipt {
      width: ${cw} !important;
      max-width: ${cw} !important;
      padding: 2mm ${sp} 4mm ${sp} !important;
      margin: 0 auto !important;
    }

    .center { text-align: center !important; }
    .bold { font-weight: bold !important; }

    .separator {
      border: none !important;
      border-top: 1px dashed #000 !important;
      margin: 2px 0 !important;
      padding: 0 !important;
    }

    .row {
      display: flex !important;
      justify-content: space-between !important;
      align-items: flex-start !important;
      gap: 2px !important;
      width: 100% !important;
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
    }

    .item-note {
      padding-left: 8px !important;
      font-size: ${noteSize} !important;
      color: #333 !important;
    }

    .title {
      font-size: ${titleSize} !important;
      font-weight: 900 !important;
    }

    .senha-num {
      font-size: ${senhaSize} !important;
      font-weight: 900 !important;
      text-align: center !important;
      line-height: 1.1 !important;
      margin: 4px 0 !important;
    }

    .total-row {
      font-size: ${totalSize} !important;
      font-weight: 900 !important;
    }

    .footer {
      font-size: ${footerSize} !important;
      text-align: center !important;
      margin-top: 4px !important;
      color: #555 !important;
    }

    /* Corte visual simulado */
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
// IMPRESSÃO VIA IFRAME ISOLADO
// ============================================================

let printLock = false;

function doPrint(html: string): void {
  if (printLock) {
    console.warn("[print] Impressão já em andamento, ignorando chamada duplicada");
    return;
  }
  printLock = true;

  // Remove iframe anterior
  const old = document.getElementById("__thermal_print_frame");
  if (old) old.remove();

  const paper = getPaperWidth();
  // Converter mm para px aprox (1mm ≈ 3.78px em 96dpi)
  const pxWidth = paper === "58mm" ? 219 : 302;

  const iframe = document.createElement("iframe");
  iframe.id = "__thermal_print_frame";
  // Iframe com tamanho REAL do papel — essencial para o Chrome calcular layout correto
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

  // Aguardar renderização completa e disparar print
  setTimeout(() => {
    try {
      iframe.contentWindow?.focus();
      
      // Listener para liberar lock após impressão
      if (iframe.contentWindow) {
        iframe.contentWindow.onafterprint = cleanup;
      }
      
      iframe.contentWindow?.print();
      
      // Fallback: liberar lock após timeout se onafterprint não disparar
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
// GERAÇÃO DE HTML
// ============================================================

function wrapHtml(title: string, paper: PaperWidth, body: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=${paper === "58mm" ? 219 : 302}">
  <title>${title}</title>
  <style>${thermalCSS(paper)}</style>
</head>
<body>
${body}
</body>
</html>`;
}

export function buildSenhaHtml(
  senha: string,
  items: { product_name: string; quantity: number }[]
): string {
  const paper = getPaperWidth();
  const time = new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const itemsHtml = items
    .map((i) => `<div>${i.quantity}x ${i.product_name}</div>`)
    .join("");

  return wrapHtml("Senha", paper, `
<div class="receipt">
  <div class="center title">PLANO B ESPETARIA</div>
  <hr class="separator">
  <div class="center">BALCÃO — ${time}</div>
  <div class="senha-num">${senha}</div>
  <hr class="separator">
  ${itemsHtml}
  <hr class="separator">
  <div class="footer">Aguarde sua senha ser chamada</div>
  <div class="cut">✂ --------------------------------</div>
</div>`);
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

  return wrapHtml("Cupom", paper, `
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
  <div class="cut">✂ --------------------------------</div>
</div>`);
}

// ============================================================
// FUNÇÕES PÚBLICAS
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
