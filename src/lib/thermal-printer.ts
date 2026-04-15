/**
 * ESC/POS Thermal Printing Service
 * For direct communication with local thermal printers via an HTTP bridge.
 */

import { type PrintConfig } from "./print-config";

// ESC/POS Commands (Decimal values for easier Uint8Array construction)
const ESC = 27;
const GS = 29;
const LF = 10;

export class EscPosBuilder {
  private buffer: number[] = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.buffer.push(ESC, 64); // ESC @ (Initialize)
    return this;
  }

  align(pos: "left" | "center" | "right") {
    const val = pos === "center" ? 1 : pos === "right" ? 2 : 0;
    this.buffer.push(ESC, 97, val); // ESC a n
    return this;
  }

  bold(on: boolean) {
    this.buffer.push(ESC, 69, on ? 1 : 0); // ESC E n
    return this;
  }

  size(doubleWidth: boolean, doubleHeight: boolean) {
    let val = 0;
    if (doubleWidth) val |= 0x20;
    if (doubleHeight) val |= 0x10;
    this.buffer.push(ESC, 33, val); // ESC ! n
    return this;
  }

  text(t: string) {
    // Basic normalization for thermal printers
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

  feed(n: number = 3) {
    for (let i = 0; i < n; i++) this.buffer.push(LF);
    return this;
  }

  cut() {
    // Feed and cut (GS V 65 3)
    this.buffer.push(GS, 86, 65, 3);
    return this;
  }

  getPayload(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

/**
 * Checks if the bridge is online and if a printer is connected.
 */
export async function checkBridgeStatus(url: string): Promise<{ online: boolean; printer_connected: boolean; error?: string }> {
  const healthUrl = url.replace(/\/print$/, "/health");
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 2000); // 2s timeout
    
    const response = await fetch(healthUrl, { 
      signal: controller.signal,
      cache: 'no-cache'
    });
    clearTimeout(id);

    if (!response.ok) return { online: false, printer_connected: false, error: `HTTP ${response.status}` };
    
    const data = await response.json();
    return { 
      online: true, 
      printer_connected: !!data.printer_connected,
      error: data.printer_connected ? undefined : "Impressora USB não detectada na ponte"
    };
  } catch (e) {
    return { online: false, printer_connected: false, error: "Ponte local offline (localhost:9100)" };
  }
}

/**
 * Sends a raw payload to the local printing bridge.
 */
export async function sendToBridge(payload: Uint8Array, url: string): Promise<boolean> {
  const timestamp = new Date().toLocaleTimeString();
  console.log(`[thermal-bridge ${timestamp}] Enviando payload (${payload.length} bytes)`);
  
  // Convert binary to base64 for JSON transmission
  const base64 = btoa(String.fromCharCode(...payload));

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ 
        payload: base64,
        format: "escpos",
        source: "Plano B Espetaria PDV",
        timestamp: new Date().toISOString()
      }),
    });
    
    const result = await response.json();
    
    if (!response.ok) {
      console.error(`[thermal-bridge] Erro: ${result.error || response.statusText}`);
      return false;
    }

    if (result.success) {
      console.log("[thermal-bridge] Sucesso! Cupom enviado para a impressora.");
      return true;
    } else {
      console.error(`[thermal-bridge] Falha no serviço local: ${result.error}`);
      return false;
    }
  } catch (e) {
    console.error("[thermal-bridge] Falha de conexão. A ponte local está rodando?");
    return false;
  }
}

/**
 * Generates the full ESC/POS receipt for an order.
 */
export function buildEscPosReceipt(
  tableName: string,
  waiterName: string,
  items: { product_name: string; quantity: number; product_price: number; note?: string | null }[],
  total: number,
  config: PrintConfig
): Uint8Array {
  const b = new EscPosBuilder();
  const is80 = config.paperWidth === "80mm";
  const now = new Date();
  const time = now.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const date = now.toLocaleDateString("pt-BR");

  // Header
  b.align("center")
   .bold(true)
   .size(true, true)
   .line(config.headerText)
   .size(false, false)
   .bold(false)
   .feed(1);

  // Info
  b.align("left")
   .line(`MESA: ${tableName}`)
   .line(`GARCOM: ${waiterName}`)
   .line(`DATA: ${date} ${time}`)
   .hr(config.paperWidth, "-");

  // Items
  items.forEach((item) => {
    const qtyStr = `${item.quantity}x `.padEnd(4);
    const priceStr = `R$${(item.product_price * item.quantity).toFixed(2)}`;
    const name = item.product_name.toUpperCase();
    
    // Manual layout calculation
    const maxChars = is80 ? 48 : 32;
    const priceLen = priceStr.length;
    const nameSpace = maxChars - qtyStr.length - priceLen - 1;
    
    let displayName = name;
    if (name.length > nameSpace) {
      displayName = name.substring(0, nameSpace - 2) + "..";
    } else {
      displayName = name.padEnd(nameSpace);
    }
    
    b.bold(true).text(qtyStr).bold(false).text(displayName).text(" ").line(priceStr);
    
    if (item.note) {
      b.line(`  (${item.note})`);
    }
  });

  b.hr(config.paperWidth, "=");

  // Total
  b.align("right")
   .size(true, true)
   .bold(true)
   .line(`TOTAL: R$ ${total.toFixed(2)}`)
   .size(false, false)
   .bold(false);

  // Footer
  b.feed(1)
   .align("center")
   .line(config.footerText)
   .feed(4)
   .cut();

  return b.getPayload();
}
