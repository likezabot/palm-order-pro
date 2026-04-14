import { CartItem } from "./types";

export function printReceipt(tableName: string, items: CartItem[], total: number) {
  const now = new Date();
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("pt-BR");

  const itemsHtml = items
    .map((item) => {
      const line = `${item.quantity}x ${item.product.name}`;
      const price = `R$${(item.product.price * item.quantity).toFixed(2)}`;
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
    win.print();
  }
}
