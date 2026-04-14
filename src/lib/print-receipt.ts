export function printSenha(senha: string, items: { product_name: string; quantity: number }[]) {
  const now = new Date();
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

  const itemsHtml = items
    .map((i) => `<div style="font-size:16px">${i.quantity}x ${i.product_name}</div>`)
    .join("");

  const html = `
    <html><head><title>Senha</title>
    <style>
      body { font-family: monospace; width: 300px; margin: 0 auto; padding: 12px; font-size: 14px; }
      .center { text-align: center; }
      .bold { font-weight: bold; }
      .divider { border-top: 1px dashed #000; margin: 8px 0; }
      .senha { font-size: 64px; font-weight: 900; text-align: center; margin: 8px 0; }
    </style></head><body>
      <div class="center bold">PLANO B ESPETARIA</div>
      <div class="center">BALCÃO — ${time}</div>
      <div class="senha">${senha}</div>
      <div class="divider"></div>
      ${itemsHtml}
      <div class="divider"></div>
      <div class="center" style="font-size:12px">Aguarde sua senha ser chamada</div>
    </body></html>
  `;

  const win = window.open("", "_blank", "width=350,height=400");
  if (win) {
    win.document.write(html);
    win.document.close();
    setTimeout(() => { win.print(); }, 500);
  }
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
    <html><head><title>Cupom</title>
    <style>
      body { font-family: monospace; width: 300px; margin: 0 auto; padding: 16px; font-size: 14px; }
      .divider { border-top: 1px dashed #000; margin: 8px 0; }
      .center { text-align: center; }
      .bold { font-weight: bold; }
    </style></head><body>
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
    </body></html>
  `;

  const win = window.open("", "_blank", "width=350,height=500");
  if (win) {
    win.document.write(html);
    win.document.close();
    setTimeout(() => {
      win.print();
    }, 500);
  }
}
