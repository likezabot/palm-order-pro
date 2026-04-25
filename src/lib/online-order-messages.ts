// Mensagens de WhatsApp prontas por contexto operacional do pedido online.
// Não envia automático: apenas formata o texto e abre o wa.me.

export type WaContext = "received" | "preparing" | "ready_pickup" | "out_for_delivery";

export const WA_CONTEXT_LABEL: Record<WaContext, string> = {
  received: "Pedido recebido",
  preparing: "Em preparo",
  ready_pickup: "Pronto para retirada",
  out_for_delivery: "Saiu para entrega",
};

function onlyDigits(s: string | null | undefined) {
  return (s ?? "").replace(/\D+/g, "");
}

export function shortOrderId(id: string) {
  return id.slice(0, 8).toUpperCase();
}

export function buildWaMessage(opts: {
  context: WaContext;
  customerName?: string | null;
  shortId: string;
  restaurantName?: string;
  etaText?: string | null;
}): string {
  const greet = opts.customerName ? `Olá, ${opts.customerName}!` : "Olá!";
  const code = `Pedido #${opts.shortId}`;
  const r = opts.restaurantName ? ` ${opts.restaurantName}` : "";
  switch (opts.context) {
    case "received":
      return `${greet} Aqui é${r}. Recebemos seu ${code} e já vamos preparar. 🙌`;
    case "preparing":
      return `${greet} Seu ${code} já está em preparo na cozinha. 👨‍🍳${
        opts.etaText ? ` Previsão: ${opts.etaText}.` : ""
      }`;
    case "ready_pickup":
      return `${greet} Seu ${code} está pronto para retirada no balcão. 🛍️ Pode vir buscar!`;
    case "out_for_delivery":
      return `${greet} Seu ${code} acabou de sair para entrega. 🛵 Chega já já!`;
  }
}

export function buildWaUrl(phone: string, message: string): string | null {
  const digits = onlyDigits(phone);
  if (!digits) return null;
  const intl = digits.length <= 11 ? `55${digits}` : digits;
  return `https://wa.me/${intl}?text=${encodeURIComponent(message)}`;
}
