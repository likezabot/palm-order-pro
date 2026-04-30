/**
 * Fonte ÚNICA de verdade do layout do cupom.
 *
 * Tanto `print-receipt.ts` (preview/HTML) quanto `thermal-printer.ts` (ESC/POS)
 * leem desta função para montar a mesma sequência de blocos.
 *
 * Mudou aqui = muda no preview e no papel real, sem divergência.
 */

import type { PrintConfig } from "./print-config";
import { APP_BUILD, PRINT_ENGINE_FOOTER } from "./print-engine";

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
  | { kind: "cutMark" }
  /** Cabeçalho de seção alinhado à esquerda (ex.: "ITENS", "PAGAMENTO"). */
  | { kind: "sectionHeader"; text: string }
  /** Linha solta esquerda sem label (ex.: hash do pedido). */
  | { kind: "rawLine"; text: string; muted?: boolean }
  /** Item em formato bullet: "• {qtd} x {nome} - R$ {preço}". */
  | { kind: "bulletItem"; quantity: number; name: string; subtotal: number; note?: string | null }
  /** Linha "Label: valor" alinhada à esquerda. Quando dash=true, vira "- Label: valor" (PAGAMENTO). */
  | { kind: "kvLine"; label: string; value: string; bold?: boolean; dash?: boolean };

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
  /**
   * Fingerprint de rastreamento — adicionado ao rodapé de TODO cupom real
   * para provar qual caminho/instância gerou o papel. Se um pedido real sai
   * sem esse bloco, ele não passou pelo motor novo.
   */
  fingerprint?: {
    printPath: string;       // ex.: "dispatcher.delivery", "dispatcher.dine_in_full"
    source?: string | null;  // "auto" | "manual" | "reprint" | "queue"
  } | null;
}

const NOT_PROVIDED = "NAO INFORMADO";

function safe(v: string | null | undefined): string {
  if (v == null) return NOT_PROVIDED;
  const s = String(v).trim();
  if (!s) return NOT_PROVIDED;
  if (/^(n\/?a|undefined|null)$/i.test(s)) return NOT_PROVIDED;
  return s;
}

/**
 * Detecta valores "vazios" para campos opcionais (waiter, customer).
 * Diferente de `safe()`: aqui retornamos true para omitir o bloco completamente,
 * em vez de imprimir "NAO INFORMADO".
 */
function isBlank(v: string | null | undefined): boolean {
  if (v == null) return true;
  const s = String(v).trim();
  if (!s) return true;
  return /^(n\/?a|undefined|null|---|—|-)$/i.test(s);
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

/**
 * Adiciona o bloco de fingerprint obrigatório no rodapé.
 * Inclui: PRINT_ENGINE, APP_BUILD, PRINT_PATH, ORDER_ID, SERVICE_TYPE.
 * Se o papel real não mostrar essas linhas → não passou por este motor.
 */
function pushFingerprint(blocks: LayoutBlock[], input: BuildLayoutInput) {
  const fp = input.fingerprint;
  const src = fp?.source ? ` [${fp.source}]` : "";
  const oid = input.orderId ? input.orderId.slice(0, 8) : "";
  
  // Linhas compactas
  blocks.push({ kind: "footer", text: `ENGINE: ${PRINT_ENGINE_FOOTER.replace("PRINT_ENGINE: ", "")}` });
  blocks.push({ kind: "footer", text: `APP: ${APP_BUILD.slice(0, 16)}` });
  
  let pathSvc = `PATH: ${fp?.printPath || "unknown"}${src}`;
  if (input.serviceType) pathSvc += ` SVC: ${input.serviceType}`;
  blocks.push({ kind: "footer", text: pathSvc });
  
  if (oid) blocks.push({ kind: "footer", text: `ORDER: ${oid}` });
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
  const date = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

  if (input.docType === "SENHA") {
    return buildSenhaLayout(input, cfg, { date, time });
  }

  if (input.docType === "DELIVERY") {
    return buildDeliveryLayout(input, cfg, { date, time });
  }

  // --- TOPO ---
  if (cfg.headerText) {
    blocks.push({ kind: "title", text: cfg.headerText.toUpperCase() });
  }
  blocks.push({ kind: "sep" });

  // Tipo de serviço (banner grande centralizado) + data/hora simples
  let typeText = "MESA";
  if (input.serviceType === "pickup" || input.serviceType === "balcao" || input.serviceType === "balcão") {
    typeText = "RETIRADA";
  } else if (input.serviceType === "delivery") {
    typeText = "ENTREGA";
  }
  blocks.push({ kind: "banner", text: typeText });
  blocks.push({ kind: "rawLine", text: `${date} ${time}` });
  blocks.push({ kind: "sep" });

  // --- PEDIDO / CLIENTE (esquerda, formato "Label: valor") ---
  const shortId = (input.orderShortId || input.tableName || input.orderId?.slice(-6).toUpperCase() || "---").replace(/^#/, "");
  blocks.push({ kind: "kvLine", label: "Pedido", value: `#${shortId}` });
  if (!isBlank(input.customerName)) {
    blocks.push({ kind: "kvLine", label: "Cliente", value: input.customerName!.trim() });
  }
  if (!isBlank(input.customerPhone)) {
    blocks.push({ kind: "kvLine", label: "Telefone", value: input.customerPhone! });
  }
  if (input.orderId) {
    blocks.push({ kind: "rawLine", text: input.orderId.replace(/-/g, "").slice(0, 24), muted: true });
  }
  blocks.push({ kind: "sep" });

  // --- ITENS ---
  blocks.push({ kind: "sectionHeader", text: "ITENS" });
  input.items.forEach((it) => {
    blocks.push({
      kind: "bulletItem",
      name: it.product_name,
      quantity: it.quantity,
      subtotal: it.product_price * it.quantity,
      note: v.notes ? it.note ?? null : null,
    });
  });
  blocks.push({ kind: "sep" });

  // --- PAGAMENTO ---
  blocks.push({ kind: "sectionHeader", text: "PAGAMENTO" });
  if (!isBlank(input.paymentMethod)) {
    blocks.push({ kind: "kvLine", label: "Forma", value: paymentLabel(input.paymentMethod) , dash: true });
  }
  blocks.push({ kind: "kvLine", label: "Total", value: moneyBr(input.total ?? 0), bold: true, dash: true });

  // --- OPCIONAL (OBSERVAÇÃO) ---
  if (input.generalNote && input.generalNote.trim() && v.notes) {
    blocks.push({ kind: "sep" });
    blocks.push({ kind: "noteBlock", label: "OBSERVACAO", text: input.generalNote.trim() });
  }

  if (v.footer && cfg.footerText) {
    blocks.push({ kind: "footer", text: cfg.footerText });
  }
  pushFingerprint(blocks, input);
  blocks.push({ kind: "cutMark" });

  return { blocks, docType: input.docType };
}

/** Layout do cupom DELIVERY — mesmo padrão visual de retirada. */
function buildDeliveryLayout(
  input: BuildLayoutInput,
  cfg: PrintConfig,
  ctx: { date: string; time: string }
): ReceiptLayout {
  const blocks: LayoutBlock[] = [];

  // 1-3. Cabeçalho
  blocks.push({ kind: "sep", bold: true });
  blocks.push({ kind: "title", text: cfg.headerText || "PLANO B ESPETARIA" });
  blocks.push({ kind: "sep", bold: true });

  // 4-6. Identificação
  const shortId = (input.orderShortId || input.orderId?.slice(-6).toUpperCase() || "---").replace(/^#/, "");
  blocks.push({ kind: "kvLine", label: "PEDIDO", value: `#${shortId}` });
  blocks.push({ kind: "rawLine", text: "TIPO: DELIVERY" });
  blocks.push({ kind: "rawLine", text: "" });

  // 7-9. Cliente
  blocks.push({ kind: "kvLine", label: "CLIENTE", value: safe(input.customerName) });
  if (!isBlank(input.customerPhone)) {
    blocks.push({ kind: "kvLine", label: "TEL", value: input.customerPhone! });
  }
  blocks.push({ kind: "rawLine", text: "" });

  // 10-13. Endereço
  blocks.push({ kind: "rawLine", text: "ENDERECO:" });
  const addr = input.deliveryAddress;
  let fullAddr = "—";
  if (addr) {
    const parts = [];
    if (addr.street) parts.push(addr.street);
    if (addr.number) parts.push(addr.number);
    let line1 = parts.join(", ");
    if (addr.neighborhood) line1 += ` - ${addr.neighborhood}`;
    fullAddr = line1 || "—";
  }
  blocks.push({ kind: "rawLine", text: fullAddr.toUpperCase() });
  
  if (addr?.reference) {
    blocks.push({ kind: "kvLine", label: "REF", value: addr.reference.toUpperCase() });
  }
  blocks.push({ kind: "rawLine", text: "" });

  // 14-16. Seção de Itens
  blocks.push({ kind: "sep", bold: false });
  blocks.push({ kind: "sectionHeader", text: "ITENS" });
  blocks.push({ kind: "sep", bold: false });

  // 17-19. Itens Loop
  input.items.forEach((it) => {
    blocks.push({
      kind: "bulletItem",
      name: it.product_name.toUpperCase(),
      quantity: it.quantity,
      subtotal: it.product_price * it.quantity,
    });
    if (it.note) {
      blocks.push({ kind: "noteBlock", label: "OBS", text: it.note });
    }
  });
  blocks.push({ kind: "rawLine", text: "" });

  // 20-21. Observação Geral
  if (input.generalNote && input.generalNote.trim()) {
    blocks.push({ kind: "kvLine", label: "OBS", value: input.generalNote.trim().toUpperCase() });
    blocks.push({ kind: "rawLine", text: "" });
  }

  // 22-25. Financeiro
  blocks.push({ kind: "sep", bold: false });
  const subtotal = input.subtotal ?? (input.total ?? 0) - (input.deliveryFee ?? 0) + (input.discount ?? 0);
  blocks.push({ kind: "kvLine", label: "SUBTOTAL", value: moneyBr(subtotal) });
  blocks.push({ kind: "kvLine", label: "ENTREGA", value: moneyBr(input.deliveryFee ?? 0) });
  blocks.push({ kind: "kvLine", label: "TOTAL", value: moneyBr(input.total ?? 0), bold: true });
  blocks.push({ kind: "rawLine", text: "" });

  // 26-29. Status e Pagamento
  blocks.push({ kind: "kvLine", label: "PAGAMENTO", value: paymentLabel(input.paymentMethod) });
  blocks.push({ kind: "rawLine", text: "STATUS: AGUARDANDO" });
  blocks.push({ kind: "sep", bold: false });

  // 30. Hora
  blocks.push({ kind: "kvLine", label: "HORA", value: ctx.time });

  // 31-32. Rodapé Final
  blocks.push({ kind: "sep", bold: true });
  blocks.push({ kind: "cutMark" });

  return { blocks, docType: "DELIVERY" };
}

function buildSenhaLayout(
  input: BuildLayoutInput,
  cfg: PrintConfig,
  ctx: { date: string; time: string }
): ReceiptLayout {
  const blocks: LayoutBlock[] = [];

  // 1-3. Cabeçalho
  blocks.push({ kind: "sep", bold: true });
  blocks.push({ kind: "title", text: cfg.headerText || "PLANO B ESPETARIA" });
  blocks.push({ kind: "sep", bold: true });
  blocks.push({ kind: "rawLine", text: "" });

  // 4-6. Senha
  const senhaNum = (input.senha || input.orderShortId || input.orderId?.slice(-4) || "---").replace(/^#/, "");
  blocks.push({ kind: "senha", text: `SENHA: ${senhaNum}` });
  blocks.push({ kind: "rawLine", text: "" });

  // 7-9. Info Pedido
  const orderId = (input.orderShortId || input.orderId?.slice(-6) || "---").replace(/^#/, "");
  blocks.push({ kind: "kvLine", label: "PEDIDO", value: `#${orderId}` });
  blocks.push({ kind: "rawLine", text: "TIPO: BALCAO / RETIRADA" });
  blocks.push({ kind: "rawLine", text: "" });

  // 10-12. Cliente
  blocks.push({ kind: "kvLine", label: "CLIENTE", value: safe(input.customerName) });
  if (!isBlank(input.customerPhone)) {
    blocks.push({ kind: "kvLine", label: "TEL", value: input.customerPhone! });
  }
  blocks.push({ kind: "rawLine", text: "" });

  // 13-15. Seção de Itens
  blocks.push({ kind: "sep", bold: false });
  blocks.push({ kind: "sectionHeader", text: "ITENS" });
  blocks.push({ kind: "sep", bold: false });

  // 16-18. Itens Loop
  input.items.forEach((it) => {
    blocks.push({
      kind: "bulletItem",
      name: it.product_name.toUpperCase(),
      quantity: it.quantity,
      subtotal: it.product_price * it.quantity,
    });
    if (it.note) {
      blocks.push({ kind: "noteBlock", label: "OBS", text: it.note });
    }
  });
  blocks.push({ kind: "rawLine", text: "" });

  // 19-21. Financeiro
  blocks.push({ kind: "sep", bold: false });
  blocks.push({ kind: "kvLine", label: "TOTAL", value: moneyBr(input.total ?? 0), bold: true });
  blocks.push({ kind: "kvLine", label: "PAGAMENTO", value: paymentLabel(input.paymentMethod) });
  blocks.push({ kind: "rawLine", text: "" });

  // 22-24. Status
  blocks.push({ kind: "rawLine", text: "STATUS: PRONTO PARA RETIRADA" });
  blocks.push({ kind: "sep", bold: false });
  blocks.push({ kind: "kvLine", label: "HORA", value: ctx.time });
  blocks.push({ kind: "rawLine", text: "" });

  // 27-29. Rodapé
  blocks.push({ kind: "footer", text: "APRESENTAR ESTA SENHA NO BALCAO" });
  blocks.push({ kind: "sep", bold: true });
  blocks.push({ kind: "cutMark" });

  return { blocks, docType: "SENHA" };
}
