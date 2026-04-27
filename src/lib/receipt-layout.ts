/**
 * Fonte ÚNICA de verdade do layout do cupom.
 *
 * Tanto `print-receipt.ts` (preview/HTML) quanto `thermal-printer.ts` (ESC/POS)
 * leem desta função para montar a mesma sequência de blocos.
 *
 * Mudou aqui = muda no preview e no papel real, sem divergência.
 */

import type { PrintConfig } from "./print-config";

export type DocType = "PEDIDO" | "ACRESCIMO" | "CONTA" | "SENHA" | "DELIVERY";

export interface ReceiptItem {
  product_name: string;
  quantity: number;
  product_price: number;
  note?: string | null;
}

export interface DeliveryAddressData {
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  complement?: string | null;
  reference?: string | null;
  city?: string | null;
  zip?: string | null;
}

export type LayoutBlock =
  | { kind: "title"; text: string }
  | { kind: "banner"; text: string } // *** ACRESCIMO ***, *** CONTA ***, DELIVERY
  | { kind: "sep"; bold?: boolean }
  | { kind: "info"; label: string; value: string }
  /** Endereço em múltiplas linhas (sem label "ENDEREÇO" embutido — o label vem antes). */
  | { kind: "addressBlock"; lines: string[] }
  /** Bloco de observação geral (textão livre, várias linhas). */
  | { kind: "noteBlock"; label: string; text: string }
  | { kind: "item"; name: string; quantity: number; subtotal: number; note?: string | null }
  | { kind: "total"; label: string; value: string }
  /** Linha de resumo financeiro tipo "SUBTOTAL: R$ 20,00" (mais leve que `total`). */
  | { kind: "summaryRow"; label: string; value: string; bold?: boolean }
  | { kind: "qtyLine"; text: string }
  | { kind: "senha"; text: string }
  | { kind: "senhaTitle"; text: string }
  | { kind: "itemTableHeader" }
  | { kind: "itemTableRow"; quantity: number; name: string; unit: number; subtotal: number }
  | { kind: "itemTableTotal"; value: string }
  | { kind: "footer"; text: string }
  | { kind: "cutMark" };

export interface ReceiptLayout {
  blocks: LayoutBlock[];
  docType: DocType;
}

export interface BuildLayoutInput {
  docType: DocType;
  tableName?: string;
  waiterName?: string;
  items: ReceiptItem[];
  total?: number;
  senha?: string;
  orderId?: string;
  customerName?: string;
  // ----- delivery / online -----
  customerPhone?: string | null;
  deliveryAddress?: DeliveryAddressData | null;
  deliveryFee?: number | null;
  discount?: number | null;
  subtotal?: number | null;
  paymentMethod?: string | null;
  changeFor?: number | null;
  /** Observação geral do pedido (texto livre, ex.: "tocar campainha") */
  generalNote?: string | null;
  /** ID curto/legível para mostrar no cupom (ex.: A85976). */
  orderShortId?: string | null;
  /** Tipo de serviço (delivery/pickup/dine_in) — usado p/ legendas extras. */
  serviceType?: "delivery" | "pickup" | "dine_in" | string | null;
}

const NOT_PROVIDED = "NAO INFORMADO";

function safe(v: string | null | undefined): string {
  if (v == null) return NOT_PROVIDED;
  const s = String(v).trim();
  if (!s) return NOT_PROVIDED;
  if (/^(n\/?a|undefined|null)$/i.test(s)) return NOT_PROVIDED;
  return s;
}

function moneyBr(n: number): string {
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
}

function paymentLabel(m?: string | null): string {
  if (!m) return NOT_PROVIDED;
  const map: Record<string, string> = {
    cash: "DINHEIRO",
    money: "DINHEIRO",
    pix: "PIX",
    card: "CARTAO",
    credit: "CARTAO CREDITO",
    debit: "CARTAO DEBITO",
  };
  return map[m.toLowerCase()] ?? m.toUpperCase();
}

function buildAddressLines(addr?: DeliveryAddressData | null): string[] {
  if (!addr) return [];
  const lines: string[] = [];
  const street = (addr.street ?? "").trim();
  const number = (addr.number ?? "").trim();
  if (street || number) {
    lines.push([street, number].filter(Boolean).join(", ") || NOT_PROVIDED);
  } else {
    lines.push(NOT_PROVIDED);
  }
  const complement = (addr.complement ?? "").trim();
  if (complement) lines.push(complement);
  return lines;
}

/**
 * Monta a sequência canônica de blocos do cupom.
 * Respeita visibleSections, headerText, footerText e docType.
 */
export function createReceiptLayoutModel(
  input: BuildLayoutInput,
  cfg: PrintConfig
): ReceiptLayout {
  const v = cfg.visibleSections;
  const blocks: LayoutBlock[] = [];
  const now = new Date();
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("pt-BR");

  // SENHA tem layout próprio (recibo de caixa) — trata antes de qualquer outro bloco.
  if (input.docType === "SENHA") {
    return buildSenhaLayout(input, cfg, { date, time });
  }

  // DELIVERY tem layout próprio — separado de mesa.
  if (input.docType === "DELIVERY") {
    return buildDeliveryLayout(input, cfg, { date, time });
  }

  // 1. Título
  if (v.title && cfg.headerText) {
    blocks.push({ kind: "title", text: cfg.headerText });
    blocks.push({ kind: "sep", bold: true });
  }

  // 2. Banner do tipo de documento (exceto PEDIDO normal)
  if (input.docType === "ACRESCIMO") {
    blocks.push({ kind: "banner", text: "*** ACRESCIMO ***" });
    blocks.push({ kind: "sep", bold: true });
  } else if (input.docType === "CONTA") {
    blocks.push({ kind: "banner", text: "*** CONTA ***" });
    blocks.push({ kind: "sep", bold: true });
  }

  // 4. Info (mesa / garçom / data) — só faz sentido para dine_in / sem service_type
  const isDineIn = !input.serviceType || input.serviceType === "dine_in";
  if (input.tableName && isDineIn) {
    blocks.push({ kind: "info", label: "Mesa", value: input.tableName });
  } else if (input.tableName && !isDineIn) {
    // pickup/balcão: mostra como "PEDIDO" em vez de "MESA"
    blocks.push({ kind: "info", label: "Pedido", value: input.tableName });
  }
  if (v.waiter && input.waiterName && isDineIn) {
    blocks.push({ kind: "info", label: "Garcom", value: input.waiterName });
  }
  // Cliente / telefone para pickup/balcão
  if (!isDineIn && input.customerName) {
    blocks.push({ kind: "info", label: "Cliente", value: safe(input.customerName) });
  }
  if (!isDineIn && input.customerPhone) {
    blocks.push({ kind: "info", label: "Telefone", value: safe(input.customerPhone) });
  }
  if (v.date) {
    blocks.push({ kind: "info", label: "Data", value: `${date} ${time}` });
  }
  blocks.push({ kind: "sep" });

  // 5. Itens
  input.items.forEach((it) => {
    blocks.push({
      kind: "item",
      name: it.product_name,
      quantity: it.quantity,
      subtotal: it.product_price * it.quantity,
      note: v.notes ? it.note ?? null : null,
    });
  });
  blocks.push({ kind: "sep", bold: true });

  // 6. Total
  const totalLabel =
    input.docType === "ACRESCIMO" ? "SUBTOTAL" : input.docType === "CONTA" ? "TOTAL" : "TOTAL";
  blocks.push({
    kind: "total",
    label: totalLabel,
    value: `R$ ${(input.total ?? 0).toFixed(2)}`,
  });

  // 7. Linha de quantidade (apenas pedido normal)
  if (input.docType === "PEDIDO") {
    const totalQty = input.items.reduce((s, i) => s + i.quantity, 0);
    blocks.push({ kind: "sep" });
    blocks.push({ kind: "qtyLine", text: `Qtd itens: ${totalQty}` });
  } else {
    blocks.push({ kind: "sep" });
  }

  // 8. Rodapé
  if (v.footer && cfg.footerText) {
    blocks.push({ kind: "footer", text: cfg.footerText });
  }

  // 9. Marca de corte (visual, só usada no HTML)
  blocks.push({ kind: "cutMark" });

  return { blocks, docType: input.docType };
}

/** Layout do cupom DELIVERY — modelo dedicado (não confundir com mesa). */
function buildDeliveryLayout(
  input: BuildLayoutInput,
  cfg: PrintConfig,
  ctx: { date: string; time: string }
): ReceiptLayout {
  const v = cfg.visibleSections;
  const blocks: LayoutBlock[] = [];

  // 1. Título do estabelecimento
  if (v.title && cfg.headerText) {
    blocks.push({ kind: "title", text: cfg.headerText });
    blocks.push({ kind: "sep", bold: true });
  }

  // 2. Banner DELIVERY em destaque (não imprime "MESA", não imprime "GARCOM")
  blocks.push({ kind: "banner", text: "*** DELIVERY ***" });
  blocks.push({ kind: "sep", bold: true });

  // 3. Identificação do pedido
  const shortId = input.orderShortId
    ? `#${input.orderShortId.replace(/^#/, "").toUpperCase()}`
    : input.orderId
    ? `#${input.orderId.replace(/-/g, "").slice(-6).toUpperCase()}`
    : NOT_PROVIDED;
  blocks.push({ kind: "info", label: "Pedido", value: shortId });
  if (v.date) {
    blocks.push({ kind: "info", label: "Data", value: `${ctx.date} ${ctx.time}` });
  }

  // 4. Dados do cliente (obrigatórios em delivery)
  blocks.push({ kind: "sep" });
  blocks.push({ kind: "info", label: "Cliente", value: safe(input.customerName) });
  blocks.push({ kind: "info", label: "Telefone", value: safe(input.customerPhone) });

  // 5. Endereço — bloco multilinha
  const addrLines = buildAddressLines(input.deliveryAddress);
  blocks.push({ kind: "info", label: "Endereco", value: "" });
  if (addrLines.length === 0) {
    blocks.push({ kind: "addressBlock", lines: [NOT_PROVIDED] });
  } else {
    blocks.push({ kind: "addressBlock", lines: addrLines });
  }
  blocks.push({
    kind: "info",
    label: "Bairro",
    value: safe(input.deliveryAddress?.neighborhood),
  });
  const ref = (input.deliveryAddress?.reference ?? "").trim();
  if (ref) {
    blocks.push({ kind: "info", label: "Referencia", value: ref });
  }

  // 6. Observação geral, se houver
  if (input.generalNote && input.generalNote.trim() && v.notes) {
    blocks.push({ kind: "sep" });
    blocks.push({ kind: "noteBlock", label: "OBS DO PEDIDO", text: input.generalNote.trim() });
  }

  // 7. Itens
  blocks.push({ kind: "sep", bold: true });
  blocks.push({ kind: "banner", text: "ITENS" });
  blocks.push({ kind: "sep" });
  input.items.forEach((it) => {
    blocks.push({
      kind: "item",
      name: it.product_name,
      quantity: it.quantity,
      subtotal: it.product_price * it.quantity,
      note: v.notes ? it.note ?? null : null,
    });
  });

  // 8. Resumo financeiro: subtotal + taxa - desconto = total
  const computedSubtotal =
    input.subtotal ?? input.items.reduce((s, i) => s + i.product_price * i.quantity, 0);
  const fee = Number(input.deliveryFee ?? 0);
  const discount = Number(input.discount ?? 0);
  const total = input.total ?? computedSubtotal + fee - discount;

  blocks.push({ kind: "sep", bold: true });
  blocks.push({ kind: "banner", text: "RESUMO" });
  blocks.push({ kind: "sep" });
  blocks.push({ kind: "summaryRow", label: "SUBTOTAL", value: moneyBr(computedSubtotal) });
  if (fee > 0) {
    blocks.push({ kind: "summaryRow", label: "TAXA ENTREGA", value: moneyBr(fee) });
  }
  if (discount > 0) {
    blocks.push({ kind: "summaryRow", label: "DESCONTO", value: `- ${moneyBr(discount)}` });
  }
  blocks.push({ kind: "summaryRow", label: "TOTAL", value: moneyBr(total), bold: true });

  // 9. Pagamento
  blocks.push({ kind: "sep" });
  blocks.push({ kind: "info", label: "Pagamento", value: paymentLabel(input.paymentMethod) });
  if (input.paymentMethod && input.paymentMethod.toLowerCase() === "cash") {
    if (input.changeFor && input.changeFor > 0) {
      blocks.push({ kind: "info", label: "Troco para", value: moneyBr(input.changeFor) });
    } else {
      blocks.push({ kind: "info", label: "Troco para", value: "NAO PRECISA" });
    }
  }

  // 10. Quantidade total de itens
  const totalQty = input.items.reduce((s, i) => s + i.quantity, 0);
  blocks.push({ kind: "sep" });
  blocks.push({ kind: "qtyLine", text: `Qtd itens: ${totalQty}` });

  // 11. Rodapé
  if (v.footer && cfg.footerText) {
    blocks.push({ kind: "footer", text: cfg.footerText });
  }

  blocks.push({ kind: "cutMark" });
  return { blocks, docType: "DELIVERY" };
}

/** Layout do cupom SENHA (BALCÃO) — estilo recibo de caixa. */
function buildSenhaLayout(
  input: BuildLayoutInput,
  cfg: PrintConfig,
  ctx: { date: string; time: string }
): ReceiptLayout {
  const v = cfg.visibleSections;
  const blocks: LayoutBlock[] = [];
  const senhaNum = (input.senha || "").replace(/^#/, "");

  blocks.push({ kind: "senhaTitle", text: `SENHA: ${senhaNum}` });
  if (v.title && cfg.headerText) {
    blocks.push({ kind: "title", text: cfg.headerText });
  }
  blocks.push({ kind: "sep", bold: true });

  if (v.date) {
    blocks.push({ kind: "info", label: "Data", value: `${ctx.date} ${ctx.time}` });
  }
  if (input.orderId) {
    const venda = input.orderId.replace(/-/g, "").slice(-6).toUpperCase();
    blocks.push({ kind: "info", label: "Venda", value: venda });
  }
  blocks.push({ kind: "info", label: "Vendedor", value: "BALCAO" });
  if (input.waiterName) {
    blocks.push({ kind: "info", label: "Caixa", value: input.waiterName });
  }
  blocks.push({
    kind: "info",
    label: "Cliente",
    value: input.customerName || "CONSUMIDOR FINAL",
  });

  blocks.push({ kind: "sep", bold: true });
  blocks.push({ kind: "itemTableHeader" });
  blocks.push({ kind: "sep", bold: true });
  input.items.forEach((it) =>
    blocks.push({
      kind: "itemTableRow",
      quantity: it.quantity,
      name: it.product_name,
      unit: it.product_price,
      subtotal: it.product_price * it.quantity,
    })
  );
  blocks.push({ kind: "sep" });
  blocks.push({
    kind: "itemTableTotal",
    value: `R$ ${(input.total ?? 0).toFixed(2)}`,
  });
  blocks.push({ kind: "sep", bold: true });
  if (v.footer && cfg.footerText) blocks.push({ kind: "footer", text: cfg.footerText });
  blocks.push({ kind: "cutMark" });
  return { blocks, docType: "SENHA" };
}
