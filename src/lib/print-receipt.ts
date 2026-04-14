function executePrint(html: string) {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  document.body.appendChild(iframe);

  const doc = iframe.contentWindow?.document || iframe.contentDocument;
  if (!doc) return;

  doc.write(html);
  doc.close();

  // Give it a moment to load styles and content
  setTimeout(() => {
    if (iframe.contentWindow) {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      // Remove the iframe after printing dialog closes/completes
      setTimeout(() => {
        document.body.removeChild(iframe);
      }, 1000);
    }
  }, 500);
}

export function printSenha(senha: string, items: { product_name: string; quantity: number }[]) {
  const now = new Date();
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const itemsHtml = items
    .map((i) => `<div style="font-size:16px">${i.quantity}x ${i.product_name}</div>`)
    .join("");

  const html = `
    <html>
      <head>
        <title>Senha</title>
        <style>
          @page { margin: 0; size: 80mm auto; }
          body { 
            margin: 0; 
            padding: 8mm 4mm; 
            width: 72mm; 
            font-family: monospace; 
            font-size: 14px; 
          }
          .center { text-align: center; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          .senha { font-size: 64px; font-weight: 900; text-align: center; margin: 8px 0; line-height: 1; }
        </style>
      </head>
      <body>
        <div class="center bold">PLANO B ESPETARIA</div>
        <div class="center">BALCÃO — ${time}</div>
        <div class="senha">${senha}</div>
        <div class="divider"></div>
        ${itemsHtml}
        <div class="divider"></div>
        <div class="center" style="font-size:12px">Aguarde sua senha ser chamada</div>
        <div style="height: 10mm;"></div> <!-- Small space at bottom for cleaner cut -->
      </body>
    </html>
  `;

  executePrint(html);
}

export function printReceipt(
  tableName: string,
  waiterName: string,
  items: { product_name: string; quantity: number; product_price: number; note?: string | null }[],
  total: number
) {
  const now = new Date();
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("pt-BR");

  const itemsHtml = items
    .map((item) => {
      const line = `${item.quantity}x ${item.product_name}`;
      const price = `R$${(item.product_price * item.quantity).toFixed(2)}`;
      const note = item.note ? `<br>&nbsp;&nbsp;OBS: ${item.note}` : "";
      return `<div style="display:flex;justify-content:space-between"><span>${line}</span><span>${price}</span></div>${note}`;
    })
    .join("");

  const html = `
    <html>
      <head>
        <title>Cupom</title>
        <style>
          @page { margin: 0; size: 80mm auto; }
          body { 
            margin: 0; 
            padding: 8mm 4mm; 
            width: 72mm; 
            font-family: monospace; 
            font-size: 14px; 
          }
          .divider { border-top: 1px dashed #000; margin: 8px 0; }
          .center { text-align: center; }
          .bold { font-weight: bold; }
        </style>
      </head>
      <body>
        <div class="center bold">================================</div>
        <div class="center bold">PLANO B ESPETARIA</div>
        <div class="center bold">================================</div>
        <div>Garçom: ${waiterName}</div>
        <div>Mesa: ${tableName}</div>
        <div>Horário: ${time} — ${date}</div>
        <div class="divider"></div>
        ${itemsHtml}
        <div class="divider"></div>
        <div class="bold" style="display:flex;justify-content:space-between">
          <span>TOTAL:</span><span>R$${total.toFixed(2)}</span>
        </div>
        <div class="center bold">================================</div>
        <div style="height: 10mm;"></div> <!-- Small space at bottom for cleaner cut -->
      </body>
    </html>
  `;

  executePrint(html);
}
