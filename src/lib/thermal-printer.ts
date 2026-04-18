/**
 * ESC/POS Thermal Printing Service
 *
 * Renderiza ESC/POS a partir do MESMO modelo de layout usado pelo preview HTML
 * (`createReceiptLayoutModel`). Garante que preview e papel real fiquem iguais.
 */

import { type PrintConfig, getFontSizes } from "./print-config";
import {
  createReceiptLayoutModel,
  type LayoutBlock,
  type ReceiptItem,
} from "./receipt-layout";

// ESC/POS Commands
const ESC = 27;
const GS = 29;
const LF = 10;

export class EscPosBuilder {
  private buffer: number[] = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.buffer.push(ESC, 64); // ESC @
    return this;
  }

  align(pos: "left" | "center" | "right") {
    const val = pos === "center" ? 1 : pos === "right" ? 2 : 0;
    this.buffer.push(ESC, 97, val);
    return this;
  }

  bold(on: boolean) {
    this.buffer.push(ESC, 69, on ? 1 : 0);
    return this;
  }

  size(doubleWidth: boolean, doubleHeight: boolean) {
    let val = 0;
    if (doubleWidth) val |= 0x20;
    if (doubleHeight) val |= 0x10;
    this.buffer.push(ESC, 33, val);
    return this;
  }

  text(t: string) {
    const normalized = t
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^\x20-\x7E\n\r]/g, "?");
    for (let i = 0; i < normalized.length; i++) {
      this.buffer.push(normalized.charCodeAt(i));
    }
    return this;
  }

  line(t: string = "") {
    this.text(t);
    this.buffer.push(LF);
    return this;
  }

  hr(paperWidth: "58mm" | "80mm", char: string = "-") {
    const len = paperWidth === "58mm" ? 32 : 48;
    this.line(char.repeat(len));
    return this;
  }

  feed(n: number = 1) {
    for (let i = 0; i < n; i++) this.buffer.push(LF);
    return this;
  }

  cut() {
    this.buffer.push(GS, 86, 65, 3);
    return this;
  }

  /** Reset completo de estilo entre blocos para evitar “vazamento”. */
  resetStyle() {
    this.bold(false).size(false, false).align("left");
    return this;
  }

  getPayload(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

// ============================================================
// Bridge status / send
// ============================================================

export async function checkBridgeStatus(
  url: string
): Promise<{ online: boolean; printer_connected: boolean; error?: string }> {
  const healthUrl = url.replace(/\/print$/, "/health");
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 1500);

    const response = await fetch(healthUrl, { signal: controller.signal, cache: "no-cache" });
    clearTimeout(id);

    if (!response.ok)
      return { online: false, printer_connected: false, error: `HTTP ${response.status}` };

    const data = await response.json();
    return {
      online: true,
      printer_connected: !!data.printer_connected,
      error: data.printer_connected ? undefined : "Impressora USB nao detectada na ponte",
    };
  } catch {
    return {
      online: false,
      printer_connected: false,
      error: "Ponte local indisponivel (lp-bridge em localhost:9100)",
    };
  }
}

export async function sendToBridge(payload: Uint8Array, url: string): Promise<boolean> {
  const ts = new Date().toLocaleTimeString();
  console.log(`[thermal-bridge ${ts}] Enviando payload (${payload.length} bytes)`);
  const base64 = btoa(String.fromCharCode(...payload));

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload: base64,
        format: "escpos",
        source: "Plano B Espetaria PDV",
        timestamp: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const result = await response.json().catch(() => ({ error: "?" }));
      console.error(`[thermal-bridge] HTTP ${response.status}: ${result.error}`);
      return false;
    }

    const result = await response.json();
    if (result.success) {
      console.log("[thermal-bridge] Cupom enviado para a impressora.");
      return true;
    }
    console.error(`[thermal-bridge] Falha: ${result.error}`);
    return false;
  } catch (e: any) {
    console.error("[thermal-bridge] Falha de conexao:", e.message);
    return false;
  }
}

// ============================================================
// Renderer ESC/POS a partir do layout model
// ============================================================

function paperColumns(paper: "58mm" | "80mm"): number {
  return paper === "58mm" ? 32 : 48;
}

/**
 * Mapeia overrides de fontSizes (px) -> intensidade no ESC/POS (double width/height).
 * O ESC/POS não tem fontes contínuas; usamos thresholds estáveis.
 */
function isLarge(px: number | undefined, baselinePx: number): boolean {
  if (px == null) return false;
  return px >= baselinePx + 4;
}

export function renderLayout(blocks: LayoutBlock[], cfg: PrintConfig): Uint8Array {
  const b = new EscPosBuilder();
  const cols = paperColumns(cfg.paperWidth);
  const f = getFontSizes(cfg);
  // baselines para decidir “grande”
  const titleLarge = isLarge(cfg.fontSizes?.title, f.title - 4) || f.title >= 18;
  const totalLarge = isLarge(cfg.fontSizes?.total, f.total - 4) || f.total >= 18;
  const itemsLarge = isLarge(cfg.fontSizes?.items, f.base);
  const headerLarge = isLarge(cfg.fontSizes?.header, f.base);
  const notesLarge = isLarge(cfg.fontSizes?.notes, f.note);

  for (const blk of blocks) {
    switch (blk.kind) {
      case "title": {
        b.resetStyle().align("center").bold(true).size(titleLarge, titleLarge).line(blk.text);
        b.resetStyle();
        break;
      }
      case "banner": {
        b.resetStyle().align("center").bold(true).size(true, true).line(blk.text);
        b.resetStyle();
        break;
      }
      case "sep": {
        b.resetStyle().align("center").line((blk.bold ? "=" : "-").repeat(cols));
        break;
      }
      case "info": {
        b.resetStyle().align("center").size(headerLarge, false);
        b.bold(true).text(`${blk.label.toUpperCase()}: `).bold(false).line(blk.value);
        b.resetStyle();
        break;
      }
      case "item": {
        b.resetStyle().align("center").size(itemsLarge, false);
        const qtyStr = `${blk.quantity}x `;
        const priceStr = blk.subtotal > 0 ? ` R$${blk.subtotal.toFixed(2)}` : "";
        const name = blk.name.toUpperCase();
        const effectiveCols = itemsLarge ? Math.floor(cols / 2) : cols;
        const maxName = Math.max(1, effectiveCols - qtyStr.length - priceStr.length);
        const displayName =
          name.length > maxName ? name.substring(0, maxName - 2) + ".." : name;
        b.bold(true).text(qtyStr).bold(false).text(displayName);
        if (priceStr) b.line(priceStr);
        else b.line("");
        b.resetStyle();

        if (blk.note) {
          b.size(notesLarge, false).align("center").line(`(${blk.note})`);
          b.resetStyle();
        }
        break;
      }
      case "total": {
        b.resetStyle().align("center").bold(true).size(totalLarge, totalLarge);
        b.line(`${blk.label}: ${blk.value}`);
        b.resetStyle();
        break;
      }
      case "qtyLine": {
        b.resetStyle().align("center").line(blk.text);
        b.resetStyle();
        break;
      }
      case "senha": {
        b.resetStyle().align("center").bold(true).size(true, true);
        b.line(blk.text);
        b.resetStyle();
        break;
      }
      case "footer": {
        b.resetStyle().align("center").line(blk.text);
        b.resetStyle();
        break;
      }
      case "cutMark": {
        // No ESC/POS o "cut mark" vira o feed + cut físico, não imprimimos os tracinhos.
        b.feed(3).cut();
        break;
      }
    }
  }

  return b.getPayload();
}

// ============================================================
// API pública (mantém assinaturas usadas pelo print-receipt.ts)
// ============================================================

export function buildEscPosReceipt(
  tableName: string,
  waiterName: string,
  items: ReceiptItem[],
  total: number,
  config: PrintConfig
): Uint8Array {
  const layout = createReceiptLayoutModel(
    { docType: "PEDIDO", tableName, waiterName, items, total },
    config
  );
  return renderLayout(layout.blocks, config);
}

export function buildEscPosDelta(
  tableName: string,
  waiterName: string,
  items: ReceiptItem[],
  config: PrintConfig
): Uint8Array {
  const total = items.reduce((s, i) => s + i.product_price * i.quantity, 0);
  const layout = createReceiptLayoutModel(
    { docType: "ACRESCIMO", tableName, waiterName, items, total },
    config
  );
  return renderLayout(layout.blocks, config);
}

export function buildEscPosBill(
  tableName: string,
  waiterName: string,
  items: ReceiptItem[],
  total: number,
  config: PrintConfig
): Uint8Array {
  const layout = createReceiptLayoutModel(
    { docType: "CONTA", tableName, waiterName, items, total },
    config
  );
  return renderLayout(layout.blocks, config);
}
