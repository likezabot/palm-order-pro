/**
 * Sistema de Impressão Térmica — Plano B Espetaria.
 *
 * Orquestrador: monta os blocos via receipt-layout, gera HTML via receipt-html
 * e despacha para o navegador (print-iframe) ou para a ponte ESC/POS (thermal-printer).
 */

import { loadPrintConfig, savePrintConfig, ensureFreshPrintConfig, type PaperWidth } from "./print-config";
import {
  buildEscPosReceipt,
  buildEscPosDelta,
  buildEscPosBill,
  buildEscPosDelivery,
  sendToBridge,
  renderLayout,
  type DeliveryPayloadInput,
  type ReceiptExtras,
} from "./thermal-printer";
import { createReceiptLayoutModel, type LayoutBlock } from "./receipt-layout";
import { buildHtmlFromLayout, buildHtmlFromBlocks } from "./receipt-html";
import { doPrint } from "./print-iframe";
import { logPrintEngine } from "./print-engine";

export type { PaperWidth };

async function getPrintConfigForOutput() {
  return await ensureFreshPrintConfig();
}

function logPrintCall(
  functionName: string,
  cfg: import("./print-config").PrintConfig,
  params: { orderId?: string | null; serviceType?: string | null; tableName?: string | null },
) {
  logPrintEngine({
    functionName,
    orderId: params.orderId ?? null,
    serviceType: params.serviceType ?? null,
    tableName: params.tableName ?? null,
    headerText: cfg.headerText,
    footerText: cfg.footerText,
    paperWidth: cfg.paperWidth,
    configMeta: {
      updatedAt: cfg.configUpdatedAt ?? null,
      source: cfg.configSource ?? null,
    },
  });
}

export function getPaperWidth(): PaperWidth {
  return loadPrintConfig().paperWidth;
}

export function setPaperWidth(width: PaperWidth) {
  const cfg = loadPrintConfig();
  cfg.paperWidth = width;
  savePrintConfig(cfg);
}

export interface SenhaOpts {
  waiterName?: string;
  orderId?: string;
  customerName?: string;
  total?: number;
  /** Bypassa o toggle printSenhaEnabled (usado pelo botão "Imprimir novamente"). */
  force?: boolean;
}

export function buildSenhaHtml(
  senha: string,
  items: { product_name: string; quantity: number; product_price?: number }[],
  configOverride?: import("./print-config").PrintConfig,
  opts: SenhaOpts = {},
): string {
  const cfg = configOverride || loadPrintConfig();
  const total =
    opts.total ?? items.reduce((s, i) => s + (i.product_price ?? 0) * i.quantity, 0);
  return buildHtmlFromLayout(
    "SENHA",
    "Senha",
    {
      items: items.map((i) => ({
        product_name: i.product_name,
        quantity: i.quantity,
        product_price: i.product_price ?? 0,
        note: null,
      })),
      senha,
      orderId: opts.orderId,
      waiterName: opts.waiterName,
      customerName: opts.customerName,
      total,
    },
    cfg,
  );
}

export function buildReceiptHtml(
  tableName: string,
  waiterName: string,
  items: { product_name: string; quantity: number; product_price: number; note?: string | null }[],
  total: number,
  configOverride?: import("./print-config").PrintConfig,
): string {
  const cfg = configOverride || loadPrintConfig();
  return buildHtmlFromLayout("PEDIDO", "Cupom", { tableName, waiterName, items, total }, cfg);
}

// ============================================================
// PUBLIC API
// ============================================================

export async function printSenha(
  senha: string,
  items: { product_name: string; quantity: number; product_price?: number }[],
  opts: SenhaOpts = {},
): Promise<boolean> {
  const cfg = await getPrintConfigForOutput();
  logPrintCall("printSenha", cfg, {
    orderId: opts.orderId ?? null,
    serviceType: "balcao",
  });

  // Respeita toggle (a menos que seja chamada manual com force=true)
  if (!opts.force && !cfg.printSenhaEnabled) {
    console.log("[print] Senha automática desativada nas configurações.");
    return false;
  }

  if (cfg.printMode === "bridge") {
    console.log("[print] Usando ponte térmica para senha");
    const total =
      opts.total ?? items.reduce((s, i) => s + (i.product_price ?? 0) * i.quantity, 0);
    const layout = createReceiptLayoutModel(
      {
        docType: "SENHA",
        items: items.map((i) => ({
          product_name: i.product_name,
          quantity: i.quantity,
          product_price: i.product_price ?? 0,
          note: null,
        })),
        senha,
        orderId: opts.orderId,
        waiterName: opts.waiterName,
        customerName: opts.customerName,
        total,
      },
      cfg,
    );
    return await sendToBridge(renderLayout(layout.blocks, cfg), cfg.bridgeUrl);
  }

  // No navegador/celular, não imprimir senha para evitar PDF
  console.log("[print] Senha ignorada no modo browser.");
  return false;
}

export async function printReceipt(
  tableName: string,
  waiterName: string,
  items: { product_name: string; quantity: number; product_price: number; note?: string | null }[],
  total: number,
  extras: ReceiptExtras = {},
) {
  const cfg = await getPrintConfigForOutput();
  logPrintCall("printReceipt", cfg, {
    serviceType: extras.serviceType ?? null,
    tableName,
    orderId: extras.orderId ?? null,
  });
  console.log(`[print] Preparando cupom para Mesa ${tableName}. Modo: ${cfg.printMode}`);

  if (cfg.printMode === "bridge") {
    const payload = buildEscPosReceipt(tableName, waiterName, items, total, cfg, extras);
    const success = await sendToBridge(payload, cfg.bridgeUrl, {
      printPath: extras.fingerprint?.printPath ?? "printReceipt",
      source: (extras.fingerprint?.source as any) ?? "unknown",
      orderId: extras.orderId ?? null,
      serviceType: extras.serviceType ?? null,
      tableName,
    });
    if (!success) {
      console.warn("[print] Falha na ponte térmica.");
      return false;
    }
    return true;
  }

  console.log("[print] Pedido ignorado no modo browser.");
  return false;
}

export async function printDelta(
  tableName: string,
  waiterName: string,
  deltaItems: { product_name: string; quantity: number; product_price: number; note?: string | null }[],
  extras: ReceiptExtras = {},
): Promise<boolean> {
  const cfg = await getPrintConfigForOutput();
  logPrintCall("printDelta", cfg, {
    serviceType: extras.serviceType ?? null,
    tableName,
    orderId: extras.orderId ?? null,
  });
  console.log(`[print] Preparando ACRÉSCIMO para Mesa ${tableName}. Modo: ${cfg.printMode}`);

  if (cfg.printMode === "bridge") {
    const payload = buildEscPosDelta(tableName, waiterName, deltaItems, cfg, extras);
    return await sendToBridge(payload, cfg.bridgeUrl, {
      printPath: extras.fingerprint?.printPath ?? "printDelta",
      source: (extras.fingerprint?.source as any) ?? "unknown",
      orderId: extras.orderId ?? null,
      serviceType: extras.serviceType ?? null,
      tableName,
    });
  }

  buildHtmlFromLayout(
    "ACRESCIMO",
    "Acréscimo",
    {
      tableName,
      waiterName,
      items: deltaItems,
      total: deltaItems.reduce((s, i) => s + i.product_price * i.quantity, 0),
      serviceType: extras.serviceType ?? undefined,
      customerName: extras.customerName ?? undefined,
      customerPhone: extras.customerPhone ?? undefined,
    },
    cfg,
  );

  console.log("[print] Acréscimo ignorado no modo browser.");
  return false;
}

export async function printBill(
  tableName: string,
  waiterName: string,
  items: { product_name: string; quantity: number; product_price: number; note?: string | null }[],
  total: number,
  extras: ReceiptExtras = {},
): Promise<boolean> {
  const cfg = await getPrintConfigForOutput();
  logPrintCall("printBill", cfg, {
    serviceType: extras.serviceType ?? null,
    tableName,
    orderId: extras.orderId ?? null,
  });
  console.log(`[print] Preparando CONTA para Mesa ${tableName}. Modo: ${cfg.printMode}`);

  if (cfg.printMode === "bridge") {
    const payload = buildEscPosBill(tableName, waiterName, items, total, cfg, extras);
    return await sendToBridge(payload, cfg.bridgeUrl, {
      printPath: extras.fingerprint?.printPath ?? "printBill",
      source: (extras.fingerprint?.source as any) ?? "unknown",
      orderId: extras.orderId ?? null,
      serviceType: extras.serviceType ?? null,
      tableName,
    });
  }

  buildHtmlFromLayout("CONTA", "Conta", {
    tableName,
    waiterName,
    items,
    total,
    serviceType: extras.serviceType ?? undefined,
    customerName: extras.customerName ?? undefined,
    customerPhone: extras.customerPhone ?? undefined,
  }, cfg);

  console.log("[print] Conta ignorada no modo browser.");
  return false;
}

export async function printCustomerReceipt(
  tableName: string,
  waiterName: string,
  items: { product_name: string; quantity: number; product_price: number; note?: string | null }[],
  total: number,
  paymentMethod: string,
  amountPaid: number,
  customerData?: { name?: string; document?: string } | null,
): Promise<boolean> {
  const cfg = await getPrintConfigForOutput();
  logPrintCall("printCustomerReceipt", cfg, {
    serviceType: "dine_in",
    tableName,
  });
  const COMPANY_CNPJ = "38.000.368/0001-22";
  const payLabel: Record<string, string> = { cash: "DINHEIRO", pix: "PIX", card: "CARTÃO" };
  const change = amountPaid - total;

  const layout = createReceiptLayoutModel(
    { docType: "CONTA", tableName, waiterName, items, total },
    cfg,
  );

  const extras: LayoutBlock[] = [];
  if (customerData?.name) extras.push({ kind: "info", label: "Cliente", value: customerData.name });
  if (customerData?.document) extras.push({ kind: "info", label: "CPF/CNPJ", value: customerData.document });
  if (customerData?.name || customerData?.document) extras.push({ kind: "sep" });
  extras.push({ kind: "info", label: "Pagamento", value: payLabel[paymentMethod] || paymentMethod });
  extras.push({ kind: "info", label: "Valor pago", value: `R$ ${amountPaid.toFixed(2)}` });
  if (paymentMethod === "cash" && change > 0) {
    extras.push({ kind: "info", label: "Troco", value: `R$ ${change.toFixed(2)}` });
  }

  const cutIdx = layout.blocks.findIndex((b) => b.kind === "cutMark");
  const insertAt = cutIdx === -1 ? layout.blocks.length : cutIdx;
  layout.blocks.splice(insertAt, 0, { kind: "sep" }, ...extras);

  const titleIdx = layout.blocks.findIndex((b) => b.kind === "title");
  if (titleIdx !== -1) {
    layout.blocks.splice(titleIdx + 1, 0, { kind: "info", label: "CNPJ", value: COMPANY_CNPJ });
  }

  buildHtmlFromBlocks("Comprovante", layout.blocks, cfg);

  if (cfg.printMode === "bridge") {
    const payload = renderLayout(layout.blocks, cfg);
    return await sendToBridge(payload, cfg.bridgeUrl);
  }

  console.log("[print] Comprovante do cliente ignorado no modo browser.");
  return false;
}

/**
 * Impressão de pedido DELIVERY — modelo dedicado.
 * Não usa "MESA"/"GARÇOM"; imprime cliente, telefone, endereço, bairro,
 * referência, itens, subtotal/taxa/desconto/total, pagamento e troco.
 */
export async function printDelivery(
  input: DeliveryPayloadInput,
): Promise<boolean> {
  const cfg = await getPrintConfigForOutput();
  logPrintCall("printDelivery", cfg, {
    orderId: input.orderId ?? null,
    serviceType: input.serviceType ?? "delivery",
    tableName: input.orderShortId ?? input.orderId ?? null,
  });
  console.log(`[print] Preparando DELIVERY pedido ${input.orderShortId ?? input.orderId ?? "?"}. Modo: ${cfg.printMode}`);

  if (cfg.printMode === "bridge") {
    const payload = buildEscPosDelivery(input, cfg);
    return await sendToBridge(payload, cfg.bridgeUrl, {
      printPath: input.fingerprint?.printPath ?? "printDelivery",
      source: (input.fingerprint?.source as any) ?? "unknown",
      orderId: input.orderId ?? null,
      serviceType: input.serviceType ?? "delivery",
      tableName: input.orderShortId ?? null,
    });
  }

  buildHtmlFromLayout(
    "DELIVERY",
    "Delivery",
    {
      items: input.items,
      total: input.total ?? undefined,
      subtotal: input.subtotal ?? undefined,
      deliveryFee: input.deliveryFee ?? undefined,
      discount: input.discount ?? undefined,
      orderId: input.orderId ?? undefined,
      orderShortId: input.orderShortId ?? undefined,
      customerName: input.customerName ?? undefined,
      customerPhone: input.customerPhone ?? undefined,
      deliveryAddress: input.deliveryAddress ?? undefined,
      paymentMethod: input.paymentMethod ?? undefined,
      changeFor: input.changeFor ?? undefined,
      generalNote: input.generalNote ?? undefined,
      serviceType: "delivery",
    },
    cfg,
  );
  console.log("[print] Delivery ignorado no modo browser.");
  return false;
}

export async function printTest() {
  const items = [
    { product_name: "Espeto Picanha", quantity: 2, product_price: 15.0, note: "Bem passado" },
    { product_name: "Refrigerante Lata", quantity: 1, product_price: 8.5, note: null },
    { product_name: "Cerveja Original", quantity: 3, product_price: 12.0, note: "Bem gelada" },
  ];
  const ok = await printReceipt("TESTE", "Admin", items, 78.5);
  if (!ok && loadPrintConfig().printMode !== "bridge") {
    console.warn("[print] Teste de impressão bloqueado no navegador.");
  }
  return ok;
}

// Re-export das funções extraídas para manter compatibilidade com qualquer
// import legado que dependa delas vindas do print-receipt.
export { doPrint } from "./print-iframe";
