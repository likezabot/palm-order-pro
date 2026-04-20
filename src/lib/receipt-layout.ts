/**
 * Fonte ÚNICA de verdade do layout do cupom.
 *
 * Tanto `print-receipt.ts` (preview/HTML) quanto `thermal-printer.ts` (ESC/POS)
 * leem desta função para montar a mesma sequência de blocos.
 *
 * Mudou aqui = muda no preview e no papel real, sem divergência.
 */

import type { PrintConfig } from "./print-config";

export type DocType = "PEDIDO" | "ACRESCIMO" | "CONTA" | "SENHA";

export interface ReceiptItem {
  product_name: string;
  quantity: number;
  product_price: number;
  note?: string | null;
}

export type LayoutBlock =
  | { kind: "title"; text: string }
  | { kind: "banner"; text: string } // *** ACRESCIMO ***, *** CONTA ***
  | { kind: "sep"; bold?: boolean }
  | { kind: "info"; label: string; value: string }
  | { kind: "item"; name: string; quantity: number; subtotal: number; note?: string | null }
  | { kind: "total"; label: string; value: string }
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

  // 3. Senha (cupom de balcão) — layout estilo recibo de caixa
  if (input.docType === "SENHA") {
    // Número da senha sem "#" (ex: "146")
    const senhaNum = (input.senha || "").replace(/^#/, "");
    blocks.push({ kind: "senhaTitle", text: `SENHA: ${senhaNum}` });
    if (v.title && cfg.headerText) {
      blocks.push({ kind: "title", text: cfg.headerText });
    }
    blocks.push({ kind: "sep", bold: true });

    if (v.date) {
      blocks.push({ kind: "info", label: "Data", value: `${date} ${time}` });
    }
    if (input.orderId) {
      // Últimos 6 caracteres do uuid (sem hífen) p/ caber em uma linha
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
    return { blocks, docType: input.docType };
  }

  // 4. Info (mesa / garçom / data)
  if (input.tableName) {
    blocks.push({ kind: "info", label: "Mesa", value: input.tableName });
  }
  if (v.waiter && input.waiterName) {
    blocks.push({ kind: "info", label: "Garcom", value: input.waiterName });
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
