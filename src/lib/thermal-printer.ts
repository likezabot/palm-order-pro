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
import { debugLog } from "./debug-logger";

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

// Cache curto (5s) para reduzir o número de fetches a /health.
// Indexado por URL — se o usuário trocar a ponte, o cache não vaza.
const _bridgeStatusCache = new Map<
  string,
  { at: number; result: { online: boolean; printer_connected: boolean; error?: string } }
>();
const BRIDGE_STATUS_TTL_MS = 5_000;

export interface BridgeHealth {
  online: boolean;
  printer_connected: boolean;
  error?: string;
  latencyMs?: number;
  bridge_version?: string;
  printer_count?: number;
  printer_status?: string;
  queue_depth?: number;
  raw?: any;
}

function splitBridgeUrl(url: string) {
  const trimmed = url.trim();
  const match = trimmed.match(/^([^?#]*)(\?[^#]*)?(#.*)?$/);
  return {
    path: match?.[1] ?? trimmed,
    query: match?.[2] ?? "",
  };
}

function bridgeBase(url: string): string {
  const { path } = splitBridgeUrl(url);
  return path.replace(/\/(?:print|health)\/?$/, "").replace(/\/$/, "");
}

function bridgeHealthUrl(url: string): string {
  const { query } = splitBridgeUrl(url);
  return `${bridgeBase(url)}/health${query}`;
}

function bridgePrintUrl(url: string): string {
  const { query } = splitBridgeUrl(url);
  return `${bridgeBase(url)}/print${query}`;
}

export async function checkBridgeStatus(
  url: string
): Promise<BridgeHealth> {
  const cached = _bridgeStatusCache.get(url);
  if (cached && Date.now() - cached.at < BRIDGE_STATUS_TTL_MS) {
    return cached.result;
  }

  const healthUrl = bridgeHealthUrl(url);
  const t0 = performance.now();
  const cacheResult = (result: BridgeHealth) => {
    _bridgeStatusCache.set(url, { at: Date.now(), result });
    return result;
  };
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 1500);

    const response = await fetch(healthUrl, { signal: controller.signal, cache: "no-cache" });
    clearTimeout(id);
    const ms = Math.round(performance.now() - t0);

    if (!response.ok) {
      debugLog.warn("bridge", `health HTTP ${response.status} (${ms}ms)`, { url: healthUrl });
      return cacheResult({ online: false, printer_connected: false, error: `HTTP ${response.status}`, latencyMs: ms });
    }

    const data = await response.json();
    // Compat: bridge v1.x usa printer_connected, v2.2 usa printer_ok / printer_ready.
    const printerOk = !!(
      data.printer_connected ??
      data.printer_ok ??
      data.printer_ready ??
      (typeof data.printer_name === "string" && data.printer_name.length > 0)
    );
    debugLog[printerOk ? "success" : "warn"]("bridge", `health OK em ${ms}ms — printer=${printerOk}`, { url: healthUrl });
    return cacheResult({
      online: true,
      printer_connected: printerOk,
      error: printerOk ? undefined : "Impressora nao detectada na ponte",
      latencyMs: ms,
      bridge_version: data.bridge_version,
      printer_count: data.printer_count,
      printer_status: data.printer_status,
      queue_depth: data.queue_depth ?? data.queue_size,
      raw: data,
    });
  } catch (e: any) {
    const ms = Math.round(performance.now() - t0);
    debugLog.warn("bridge", `health falhou em ${ms}ms: ${e?.message ?? "indisponível"}`, { url: healthUrl });
    const shown = bridgeBase(healthUrl).replace(/^https?:\/\//, "");
    return cacheResult({
      online: false,
      printer_connected: false,
      error: `Ponte local indisponivel (lp-bridge em ${shown})`,
      latencyMs: ms,
    });
  }
}

// ============================================================
// Bridge admin: lista/seleciona impressora do Windows via spooler
// (bridge v2.1+). Falha silenciosa em bridges antigas.
// ============================================================

export interface BridgePrinterInfo {
  name: string;
  is_default?: boolean;
  status?: string;
}

export async function listBridgePrinters(
  url: string,
): Promise<{ ok: boolean; printers: BridgePrinterInfo[]; error?: string }> {
  try {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${bridgeBase(url)}/printers`, {
      signal: ctrl.signal,
      cache: "no-cache",
    });
    clearTimeout(id);
    if (!res.ok) return { ok: false, printers: [], error: `HTTP ${res.status}` };
    const data = await res.json();
    const source = Array.isArray(data) ? data : Array.isArray(data?.printers) ? data.printers : [];
    const list: BridgePrinterInfo[] = source.map((p: any) =>
          typeof p === "string" ? { name: p } : { name: p.name, is_default: p.is_default, status: p.status },
        );
    return { ok: true, printers: list };
  } catch (e: any) {
    return { ok: false, printers: [], error: e?.message ?? "indisponível" };
  }
}

export async function setBridgePrinter(
  url: string,
  printerName: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctrl = new AbortController();
    const id = setTimeout(() => ctrl.abort(), 4000);
    const res = await fetch(`${bridgeBase(url)}/config`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: ctrl.signal,
      body: JSON.stringify({ printer_name: printerName }),
    });
    clearTimeout(id);
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return { ok: false, error: j?.error ?? `HTTP ${res.status}` };
    }
    // invalida cache de health pra reler estado
    _bridgeStatusCache.clear();
    return { ok: true };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? "indisponível" };
  }
}

/**
 * Envia um payload mínimo de teste (ESC @ + linha + corte) direto pro bridge.
 * Útil para isolar problema: se isso não imprime, o problema é 100% bridge/USB,
 * não tem nada a ver com layout/payload do site.
 */
export async function sendTestMinimal(bridgeUrl: string): Promise<{ ok: boolean; latencyMs: number; error?: string }> {
  const b = new EscPosBuilder();
  b.reset()
    .align("center")
    .bold(true)
    .size(true, true)
    .line("TESTE PLANO B")
    .resetStyle()
    .feed(1)
    .line(new Date().toLocaleString("pt-BR"))
    .feed(3)
    .cut();
  const payload = b.getPayload();
  const t0 = performance.now();
  try {
    const ok = await sendToBridge(payload, bridgeUrl);
    return { ok, latencyMs: Math.round(performance.now() - t0) };
  } catch (e: any) {
    return { ok: false, latencyMs: Math.round(performance.now() - t0), error: e?.message ?? String(e) };
  }
}

export async function sendToBridge(payload: Uint8Array, url: string): Promise<boolean> {
  const t0 = performance.now();
  const printUrl = bridgePrintUrl(url);
  debugLog.info("print", `→ enviando ${payload.length} bytes para bridge`, { url: printUrl });
  const base64 = btoa(String.fromCharCode(...payload));

  try {
    const response = await fetch(printUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        payload: base64,
        format: "escpos",
        source: "Plano B Espetaria PDV",
        timestamp: new Date().toISOString(),
      }),
    });

    const ms = Math.round(performance.now() - t0);

    if (!response.ok) {
      const result = await response.json().catch(() => ({ error: "?" }));
      debugLog.error("print", `✗ bridge HTTP ${response.status} em ${ms}ms — ${result.error ?? "?"}`, { url: printUrl });
      return false;
    }

    const result = await response.json();
    if (result.success) {
      debugLog.success("print", `✓ cupom enviado em ${ms}ms (${payload.length} bytes)`);
      return true;
    }
    debugLog.error("print", `✗ bridge respondeu success=false em ${ms}ms: ${result.error ?? "?"}`);
    return false;
  } catch (e: any) {
    const ms = Math.round(performance.now() - t0);
    debugLog.error("print", `✗ falha de conexão em ${ms}ms: ${e?.message ?? e}`, { url: printUrl });
    return false;
  }
}

// ============================================================
// Renderer ESC/POS a partir do layout model
// ============================================================

function paperColumns(paper: "58mm" | "80mm"): number {
  // Largura útil em Font A (12x24): 80mm ≈ 42 cols, 58mm ≈ 32 cols.
  // Antes usávamos 48 em 80mm, o que estourava a linha em quase todas as impressoras.
  return paper === "58mm" ? 32 : 42;
}

/** Trunca/preenche string para o tamanho exato. */
function fitLeft(s: string, n: number): string {
  if (s.length > n) return s.substring(0, n);
  return s + " ".repeat(n - s.length);
}
function fitRight(s: string, n: number): string {
  if (s.length > n) return s.substring(s.length - n);
  return " ".repeat(n - s.length) + s;
}

/**
 * Tabela de itens — larguras dependentes do papel.
 *  80mm (42 cols): Qtd(3) Item(21) Unit(7) Total(8) + 3 espaços = 42
 *  58mm (32 cols): Qtd(2) Item(14) Unit(6) Total(7) + 3 espaços = 32
 * Valores R$ até 999.99 cabem em 6 chars; reservamos 1 a mais no Total para até 9999.99.
 */
function tableWidths(paper: "58mm" | "80mm") {
  if (paper === "58mm") return { QTY: 2, UNIT: 6, TOTAL: 7, GAPS: 3 };
  return { QTY: 3, UNIT: 7, TOTAL: 8, GAPS: 3 };
}

function formatTableRow(
  paper: "58mm" | "80mm",
  qty: string,
  name: string,
  unit: string,
  total: string,
): string {
  const cols = paperColumns(paper);
  const { QTY, UNIT, TOTAL, GAPS } = tableWidths(paper);
  const NAME = Math.max(4, cols - QTY - UNIT - TOTAL - GAPS);
  return (
    fitLeft(qty, QTY) + " " +
    fitLeft(name, NAME) + " " +
    fitRight(unit, UNIT) + " " +
    fitRight(total, TOTAL)
  );
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

  const align: "left" | "center" = cfg.contentAlign === "left" ? "left" : "center";

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
        b.resetStyle().align(align).line((blk.bold ? "=" : "-").repeat(cols));
        break;
      }
      case "info": {
        b.resetStyle().align(align).size(headerLarge, false);
        if (blk.value) {
          b.bold(true).text(`${blk.label.toUpperCase()}: `).bold(false).line(blk.value);
        } else {
          // Label sozinho (ex.: "ENDERECO:" antes de um addressBlock)
          b.bold(true).line(`${blk.label.toUpperCase()}:`).bold(false);
        }
        b.resetStyle();
        break;
      }
      case "addressBlock": {
        b.resetStyle().align(align).bold(true);
        for (const line of blk.lines) b.line(line);
        b.resetStyle();
        break;
      }
      case "noteBlock": {
        b.resetStyle().align(align).bold(true).line(`${blk.label.toUpperCase()}:`).bold(false);
        // quebra texto longo a cada `cols` chars
        const txt = blk.text;
        for (let i = 0; i < txt.length; i += cols) {
          b.line(txt.slice(i, i + cols));
        }
        b.resetStyle();
        break;
      }
      case "summaryRow": {
        b.resetStyle().align("left");
        if (blk.bold) b.bold(true).size(false, true);
        const label = blk.label.toUpperCase();
        const value = blk.value;
        const padN = Math.max(1, cols - label.length - value.length);
        b.line(label + " ".repeat(padN) + value);
        b.resetStyle();
        break;
      }
      case "item": {
        b.resetStyle().align(align).size(itemsLarge, false);
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
          b.size(notesLarge, false).align(align).line(`(${blk.note})`);
          b.resetStyle();
        }
        break;
      }
      case "total": {
        b.resetStyle().align(align).bold(true).size(totalLarge, totalLarge);
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
      case "senhaTitle": {
        b.resetStyle().align("center").bold(true).size(true, true);
        b.line(blk.text);
        b.resetStyle();
        break;
      }
      case "itemTableHeader": {
        b.resetStyle().align("left").bold(true);
        b.line(formatTableRow(cfg.paperWidth, "Qtd", "Item", "Unit", "Total"));
        b.resetStyle();
        break;
      }
      case "itemTableRow": {
        b.resetStyle().align("left");
        b.line(
          formatTableRow(
            cfg.paperWidth,
            String(blk.quantity),
            blk.name.toUpperCase(),
            blk.unit.toFixed(2),
            blk.subtotal.toFixed(2),
          ),
        );
        b.resetStyle();
        break;
      }
      case "itemTableTotal": {
        b.resetStyle().align("left").bold(true).size(false, true);
        const label = "TOTAL";
        const val = blk.value;
        const padN = Math.max(1, cols - label.length - val.length);
        b.line(label + " ".repeat(padN) + val);
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
