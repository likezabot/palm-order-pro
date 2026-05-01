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
  | { kind: "image"; url: string; align?: "left" | "center" | "right" }
  | { kind: "title"; text: string }
  | { kind: "banner"; text: string } // *** ACRESCIMO ***, *** CONTA ***, DELIVERY
  | { kind: "sep"; bold?: boolean; style?: "line" | "dashes" | "stars" | "none" }
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
  | { kind: "rawLine"; text: string; muted?: boolean; align?: "left" | "center" | "right" }
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
  // REMOVIDO por solicitação do cliente: Bloco de debug/fingerprint ocultado.
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
 * Injeta o cabeçalho padrão (Logo, Nome, Endereço, Contato, CNPJ).
 */
function pushEstablishmentHeader(blocks: LayoutBlock[], cfg: PrintConfig) {
  if (cfg.logoUrl) {
    blocks.push({ kind: "image", url: cfg.logoUrl, align: "center" });
  }

  const establishment = cfg.headerText?.trim() || "PLANO B ESPETARIA";
  blocks.push({ kind: "title", text: establishment.toUpperCase() });

  if (cfg.addressLine1 || cfg.addressLine2 || cfg.phone || cfg.cnpj) {
    const lines: string[] = [];
    if (cfg.addressLine1) lines.push(cfg.addressLine1.toUpperCase());
    if (cfg.addressLine2) lines.push(cfg.addressLine2.toUpperCase());
    if (cfg.phone) lines.push(`TEL: ${cfg.phone}`);
    if (cfg.cnpj) lines.push(`CNPJ: ${cfg.cnpj}`);
    
    blocks.push({ kind: "addressBlock", lines });
  }

  blocks.push({ kind: "sep", bold: true, style: cfg.separatorStyle });
}

/**
 * Monta a sequência canônica de blocos do cupom.
 * Respeita visibleSections, headerText, footerText e docType.
 */
export function createReceiptLayoutModel(
  input: BuildLayoutInput,
  cfg: PrintConfig
): ReceiptLayout {
  const now = new Date();
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  const ctx = { date, time };

  if (input.docType === "SENHA") {
    return buildSenhaLayout(input, cfg, ctx);
  }

  if (input.docType === "DELIVERY") {
    return buildDeliveryLayout(input, cfg, ctx);
  }

  if (input.docType === "ACRESCIMO") {
    return buildAcrescimoLayout(input, cfg, ctx);
  }

  // --- TIPO 1: MESA / DINE-IN (Default) ---
  const blocks: LayoutBlock[] = [];
  
  pushEstablishmentHeader(blocks, cfg);

  // Mesa em destaque
  if (input.tableName) {
    blocks.push({ kind: "banner", text: input.tableName.toUpperCase() });
    blocks.push({ kind: "sep", style: cfg.separatorStyle });
  }

  // Info básica
  const orderNum = input.orderShortId || input.orderId?.slice(-4).toUpperCase() || "---";
  if (cfg.visibleSections?.showOrderNumber !== false) {
    blocks.push({ kind: "kvLine", label: "PEDIDO", value: `#${orderNum}` });
  }
  blocks.push({ kind: "kvLine", label: "DATA", value: `${date} ${time}` });
  
  if (!isBlank(input.waiterName)) {
    blocks.push({ kind: "kvLine", label: "GARCOM", value: input.waiterName!.toUpperCase() });
  }
  blocks.push({ kind: "sep", style: cfg.separatorStyle });

  // Itens
  blocks.push({ kind: "sectionHeader", text: "ITENS DO PEDIDO" });
  input.items.forEach((it) => {
    blocks.push({
      kind: "bulletItem",
      name: it.product_name.toUpperCase(),
      quantity: it.quantity,
      subtotal: it.product_price * it.quantity,
      note: it.note ?? null,
    });
  });
  blocks.push({ kind: "sep", style: cfg.separatorStyle });

  // TOTAL em destaque (bloco grande)
  blocks.push({ kind: "total", label: "TOTAL", value: moneyBr(input.total ?? 0) });
  if (!isBlank(input.paymentMethod)) {
    blocks.push({ kind: "kvLine", label: "PAGAMENTO", value: paymentLabel(input.paymentMethod) });
  }

  // Observação
  if (input.generalNote && input.generalNote.trim()) {
    blocks.push({ kind: "sep", style: cfg.separatorStyle });
    blocks.push({ kind: "noteBlock", label: "OBSERVACAO", text: input.generalNote.trim().toUpperCase() });
  }

  blocks.push({ kind: "sep", bold: true, style: cfg.separatorStyle });
  blocks.push({ kind: "cutMark" });

  return { blocks, docType: input.docType };
}

/** TIPO 4: ACRESCIMO / ADICIONAL */
function buildAcrescimoLayout(
  input: BuildLayoutInput,
  cfg: PrintConfig,
  ctx: { date: string; time: string }
): ReceiptLayout {
  const blocks: LayoutBlock[] = [];
  
  pushEstablishmentHeader(blocks, cfg);
  blocks.push({ kind: "banner", text: "ACRESCIMO" });
  blocks.push({ kind: "sep", style: cfg.separatorStyle });

  if (input.tableName) {
    blocks.push({ kind: "kvLine", label: "MESA", value: input.tableName.toUpperCase(), bold: true });
  }
  const orderNum = input.orderShortId || input.orderId?.slice(-4).toUpperCase() || "---";
  if (cfg.visibleSections?.showOrderNumber !== false) {
    blocks.push({ kind: "kvLine", label: "PEDIDO", value: `#${orderNum}` });
  }
  blocks.push({ kind: "kvLine", label: "HORARIO", value: ctx.time });
  blocks.push({ kind: "sep", style: cfg.separatorStyle });

  blocks.push({ kind: "sectionHeader", text: "NOVOS ITENS" });
  input.items.forEach((it) => {
    blocks.push({
      kind: "bulletItem",
      name: it.product_name.toUpperCase(),
      quantity: it.quantity,
      subtotal: it.product_price * it.quantity,
      note: it.note ?? null,
    });
  });
  blocks.push({ kind: "sep", style: cfg.separatorStyle });

  const subtotal = input.items.reduce((acc, it) => acc + it.product_price * it.quantity, 0);
  blocks.push({ kind: "total", label: "SUBTOTAL ACRESC.", value: moneyBr(subtotal) });
  
  blocks.push({ kind: "sep", bold: true, style: cfg.separatorStyle });
  blocks.push({ kind: "cutMark" });

  return { blocks, docType: "ACRESCIMO" };
}

/** TIPO 3: DELIVERY */
function buildDeliveryLayout(
  input: BuildLayoutInput,
  cfg: PrintConfig,
  ctx: { date: string; time: string }
): ReceiptLayout {
  const blocks: LayoutBlock[] = [];
  const establishment = cfg.headerText?.trim() || "PLANO B ESPETARIA";

  // Cabeçalho
  blocks.push({ kind: "title", text: establishment.toUpperCase() });
  blocks.push({ kind: "sep", bold: true });
  blocks.push({ kind: "banner", text: "DELIVERY" });
  blocks.push({ kind: "sep" });

  // Cliente e Entrega
  blocks.push({ kind: "kvLine", label: "CLIENTE", value: (input.customerName || "---").toUpperCase() });
  if (input.customerPhone) {
    blocks.push({ kind: "kvLine", label: "TELEFONE", value: input.customerPhone });
  }
  
  const addr = input.deliveryAddress;
  if (addr) {
    const streetLine = [addr.street, addr.number].filter(Boolean).join(", ");
    blocks.push({ kind: "kvLine", label: "ENDERECO", value: (streetLine || "---").toUpperCase() });
    if (addr.neighborhood) {
      blocks.push({ kind: "kvLine", label: "BAIRRO", value: addr.neighborhood.toUpperCase() });
    }
    if (addr.complement) {
      blocks.push({ kind: "kvLine", label: "COMPL.", value: addr.complement.toUpperCase() });
    }
    if (addr.reference) {
      blocks.push({ kind: "kvLine", label: "REF.", value: addr.reference.toUpperCase() });
    }
  }
  
  blocks.push({ kind: "kvLine", label: "DATA", value: `${ctx.date} ${ctx.time}` });
  blocks.push({ kind: "sep" });

  // Itens
  blocks.push({ kind: "sectionHeader", text: "ITENS DO PEDIDO" });
  input.items.forEach((it) => {
    blocks.push({
      kind: "bulletItem",
      name: it.product_name.toUpperCase(),
      quantity: it.quantity,
      subtotal: it.product_price * it.quantity,
      note: it.note ?? null,
    });
  });
  blocks.push({ kind: "sep" });

  // Financeiro
  const deliveryFee = input.deliveryFee ?? 0;
  const total = input.total ?? 0;
  const subtotal = input.subtotal ?? (total - deliveryFee);

  blocks.push({ kind: "kvLine", label: "SUBTOTAL", value: moneyBr(subtotal) });
  blocks.push({ kind: "kvLine", label: "TAXA ENTREGA", value: moneyBr(deliveryFee) });
  blocks.push({ kind: "total", label: "TOTAL", value: moneyBr(total) });
  
  if (!isBlank(input.paymentMethod)) {
    blocks.push({ kind: "kvLine", label: "PAGAMENTO", value: paymentLabel(input.paymentMethod) });
  }

  // Observação
  if (input.generalNote && input.generalNote.trim()) {
    blocks.push({ kind: "sep" });
    blocks.push({ kind: "noteBlock", label: "OBSERVACOES", text: input.generalNote.trim().toUpperCase() });
  }

  // Rodapé Opcional para Delivery
  if (cfg.footerText) {
    blocks.push({ kind: "sep" });
    blocks.push({ kind: "footer", text: cfg.footerText });
  }

  blocks.push({ kind: "sep", bold: true });
  blocks.push({ kind: "cutMark" });

  return { blocks, docType: "DELIVERY" };
}

/** TIPO 2: BALCAO / RETIRADA (com SENHA) */
function buildSenhaLayout(
  input: BuildLayoutInput,
  cfg: PrintConfig,
  ctx: { date: string; time: string }
): ReceiptLayout {
  const blocks: LayoutBlock[] = [];
  const establishment = cfg.headerText?.trim() || "PLANO B ESPETARIA";

  // Cabeçalho
  blocks.push({ kind: "title", text: establishment.toUpperCase() });
  blocks.push({ kind: "sep", bold: true });

  // SENHA em destaque MAXIMO (numero gigante)
  const senhaNum = input.senha || input.orderShortId || input.orderId?.slice(-4).toUpperCase() || "---";
  blocks.push({ kind: "senhaTitle", text: "SENHA" });
  blocks.push({ kind: "senha", text: senhaNum });
  blocks.push({ kind: "sep", bold: true });
  blocks.push({ kind: "banner", text: "BALCAO / RETIRADA" });
  blocks.push({ kind: "sep" });

  // Identificação
  if (!isBlank(input.customerName)) {
    blocks.push({ kind: "kvLine", label: "CLIENTE", value: input.customerName!.toUpperCase() });
  }
  if (!isBlank(input.customerPhone)) {
    blocks.push({ kind: "kvLine", label: "TEL", value: input.customerPhone! });
  }
  blocks.push({ kind: "kvLine", label: "DATA", value: `${ctx.date} ${ctx.time}` });
  blocks.push({ kind: "sep" });

  // Itens
  blocks.push({ kind: "sectionHeader", text: "ITENS DO PEDIDO" });
  input.items.forEach((it) => {
    blocks.push({
      kind: "bulletItem",
      name: it.product_name.toUpperCase(),
      quantity: it.quantity,
      subtotal: it.product_price * it.quantity,
      note: it.note ?? null,
    });
  });
  blocks.push({ kind: "sep" });

  // Totais
  blocks.push({ kind: "total", label: "TOTAL", value: moneyBr(input.total ?? 0) });
  if (!isBlank(input.paymentMethod)) {
    blocks.push({ kind: "kvLine", label: "PAGAMENTO", value: paymentLabel(input.paymentMethod) });
  }

  // Rodapé instrução
  blocks.push({ kind: "sep", bold: true });
  blocks.push({ kind: "banner", text: "RETIRE NO BALCAO" });
  blocks.push({ kind: "sep", bold: true });
  blocks.push({ kind: "cutMark" });

  return { blocks, docType: "SENHA" };
}
