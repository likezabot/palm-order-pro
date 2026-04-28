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
  /** Linha "- Label: valor" alinhada à esquerda (sub-item de PAGAMENTO). */
  | { kind: "kvLine"; label: string; value: string; bold?: boolean };

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

  const shortId = input.orderShortId || input.tableName || input.orderId?.slice(-6).toUpperCase() || "---";
  blocks.push({ kind: "banner", text: `PEDIDO #${shortId.replace(/^#/, "")}` });

  let typeText = "MESA";
  if (input.serviceType === "pickup" || input.serviceType === "balcao" || input.serviceType === "balcão") {
    typeText = "RETIRADA";
  } else if (input.serviceType === "delivery") {
    typeText = "ENTREGA";
  }
  blocks.push({ kind: "banner", text: `TIPO: ${typeText}` });
  blocks.push({ kind: "info", label: "DATA", value: `${date} ${time}` });
  blocks.push({ kind: "sep", bold: true });

  // --- CLIENTE ---
  let hasClientInfo = false;
  if (!isBlank(input.customerName)) {
    blocks.push({ kind: "info", label: "Cliente", value: input.customerName!.toUpperCase() });
    hasClientInfo = true;
  }
  if (!isBlank(input.customerPhone)) {
    blocks.push({ kind: "info", label: "Telefone", value: input.customerPhone! });
    hasClientInfo = true;
  }
  if (hasClientInfo) blocks.push({ kind: "sep" });

  // --- ITENS ---
  input.items.forEach((it) => {
    blocks.push({
      kind: "item",
      name: it.product_name.toUpperCase(),
      quantity: it.quantity,
      subtotal: it.product_price * it.quantity,
      note: v.notes ? it.note ?? null : null,
    });
  });
  blocks.push({ kind: "sep", bold: true });

  // --- TOTAL E PAGAMENTO ---
  blocks.push({
    kind: "total",
    label: "TOTAL",
    value: moneyBr(input.total ?? 0),
  });
  
  if (!isBlank(input.paymentMethod)) {
    blocks.push({ kind: "info", label: "PAGAMENTO", value: paymentLabel(input.paymentMethod) });
  }
  blocks.push({ kind: "sep" });

  // --- OPCIONAL (OBSERVAÇÃO) ---
  if (input.generalNote && input.generalNote.trim() && v.notes) {
    blocks.push({ kind: "noteBlock", label: "OBSERVACAO", text: input.generalNote.trim().toUpperCase() });
    blocks.push({ kind: "sep" });
  }

  if (v.footer && cfg.footerText) {
    blocks.push({ kind: "footer", text: cfg.footerText });
  }
  pushFingerprint(blocks, input);
  blocks.push({ kind: "cutMark" });

  return { blocks, docType: input.docType };
}

/** Layout do cupom DELIVERY — modelo dedicado (não confundir com mesa). */
function buildDeliveryLayout(
  input: BuildLayoutInput,
  cfg: PrintConfig,
  ctx: { date: string; time: string }
): ReceiptLayout {
  const blocks: LayoutBlock[] = [];

  // 1. Cabeçalho Compacto
  if (cfg.headerText) {
    blocks.push({ kind: "title", text: cfg.headerText.toUpperCase() });
  }

  const shortId = input.orderShortId || input.orderId?.slice(-6).toUpperCase() || "---";
  const isPickup = input.serviceType === "pickup" || input.serviceType === "balcao" || input.serviceType === "balcão";
  const typeText = isPickup ? "RETIRADA" : "DELIVERY";
  
  blocks.push({ kind: "banner", text: `${typeText} #${shortId.replace(/^#/, "")}` });
  blocks.push({ kind: "info", label: "DATA", value: `${ctx.date} ${ctx.time}` });
  blocks.push({ kind: "sep" });

  // 2. Cliente
  blocks.push({ kind: "banner", text: "CLIENTE" });
  blocks.push({ kind: "info", label: "", value: safe(input.customerName).toUpperCase() });
  if (!isBlank(input.customerPhone)) {
    blocks.push({ kind: "info", label: "Tel", value: input.customerPhone! });
  }

  // 3. Entrega (se não for pickup)
  if (!isPickup) {
    blocks.push({ kind: "banner", text: "ENTREGA" });
    const addrLines = buildAddressLines(input.deliveryAddress);
    if (addrLines.length === 0) {
      blocks.push({ kind: "addressBlock", lines: [NOT_PROVIDED] });
    } else {
      blocks.push({ kind: "addressBlock", lines: addrLines.map(l => l.toUpperCase()) });
    }
    
    const neighborhood = (input.deliveryAddress?.neighborhood ?? "").trim();
    if (neighborhood) {
      blocks.push({ kind: "info", label: "Bairro", value: neighborhood.toUpperCase() });
    }
    
    const ref = (input.deliveryAddress?.reference ?? "").trim();
    if (ref) {
      blocks.push({ kind: "info", label: "Ref", value: ref.toUpperCase() });
    }
  }
  blocks.push({ kind: "sep" });

  // 4. Pagamento
  if (!isBlank(input.paymentMethod)) {
    blocks.push({ kind: "banner", text: "PAGAMENTO" });
    blocks.push({ kind: "info", label: "", value: paymentLabel(input.paymentMethod) });
    if (input.changeFor && input.changeFor > 0) {
      blocks.push({ kind: "info", label: "Troco p/", value: moneyBr(input.changeFor) });
    }
    blocks.push({ kind: "sep" });
  }

  // 5. Itens
  blocks.push({ kind: "banner", text: "ITENS" });
  input.items.forEach((it) => {
    blocks.push({
      kind: "item",
      name: it.product_name.toUpperCase(),
      quantity: it.quantity,
      subtotal: it.product_price * it.quantity,
      note: (cfg.visibleSections.notes) ? it.note ?? null : null,
    });
  });

  if (!isPickup && input.deliveryFee && input.deliveryFee > 0) {
    blocks.push({ kind: "summaryRow", label: "TAXA ENTREGA", value: moneyBr(input.deliveryFee) });
  }
  if (input.discount && input.discount > 0) {
    blocks.push({ kind: "summaryRow", label: "DESCONTO", value: "-" + moneyBr(input.discount) });
  }

  blocks.push({ kind: "sep", bold: true });

  // 6. Total
  const total = input.total ?? (input.subtotal ?? 0) + Number(input.deliveryFee ?? 0) - Number(input.discount ?? 0);
  blocks.push({
    kind: "total",
    label: "TOTAL",
    value: moneyBr(total),
  });
  blocks.push({ kind: "sep" });

  // 7. Observação Geral
  if (input.generalNote && input.generalNote.trim() && cfg.visibleSections.notes) {
    blocks.push({ kind: "noteBlock", label: "OBS", text: input.generalNote.trim().toUpperCase() });
    blocks.push({ kind: "sep" });
  }

  blocks.push({ kind: "footer", text: "Obrigado pela preferencia!" });
  pushFingerprint(blocks, input);
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

  // --- TOPO ---
  if (cfg.headerText) {
    blocks.push({ kind: "title", text: cfg.headerText.toUpperCase() });
  }
  blocks.push({ kind: "banner", text: `PEDIDO #${senhaNum}` });
  blocks.push({ kind: "banner", text: "TIPO: RETIRADA" });
  blocks.push({ kind: "info", label: "DATA", value: `${ctx.date} ${ctx.time}` });
  blocks.push({ kind: "sep", bold: true });

  // --- CLIENTE ---
  if (!isBlank(input.customerName)) {
    blocks.push({ kind: "info", label: "Cliente", value: input.customerName!.toUpperCase() });
    blocks.push({ kind: "sep" });
  }

  // --- ITENS ---
  input.items.forEach((it) =>
    blocks.push({
      kind: "item",
      name: it.product_name.toUpperCase(),
      quantity: it.quantity,
      subtotal: it.product_price * it.quantity,
      note: v.notes ? it.note ?? null : null,
    })
  );
  blocks.push({ kind: "sep", bold: true });

  // --- TOTAL E PAGAMENTO ---
  blocks.push({
    kind: "total",
    label: "TOTAL",
    value: moneyBr(input.total ?? 0),
  });
  blocks.push({ kind: "sep" });

  if (v.footer && cfg.footerText) blocks.push({ kind: "footer", text: cfg.footerText });
  pushFingerprint(blocks, input);
  blocks.push({ kind: "cutMark" });
  return { blocks, docType: "SENHA" };
}
