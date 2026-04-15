/**
 * Configurações persistentes para impressão térmica.
 * Salva em localStorage para acesso síncrono rápido.
 */

export interface PrintConfig {
  paperWidth: "58mm" | "80mm";
  baseFontSize: number;    // px
  titleFontSize: number;   // px
  senhaFontSize: number;   // px
  totalFontSize: number;   // px
  noteFontSize: number;    // px
  footerFontSize: number;  // px
  lineSpacing: number;     // line-height multiplier
  receiptPadding: number;  // mm
  showEstablishment: boolean;
  showWaiter: boolean;
  showTable: boolean;
  showDateTime: boolean;
  showNotes: boolean;
  showFooter: boolean;
  showCutLine: boolean;
  headerText: string;
  footerText: string;
}

const STORAGE_KEY = "print_config";

export const DEFAULT_CONFIG: PrintConfig = {
  paperWidth: "80mm",
  baseFontSize: 14,
  titleFontSize: 18,
  senhaFontSize: 72,
  totalFontSize: 17,
  noteFontSize: 11,
  footerFontSize: 10,
  lineSpacing: 1.4,
  receiptPadding: 3,
  showEstablishment: true,
  showWaiter: true,
  showTable: true,
  showDateTime: true,
  showNotes: true,
  showFooter: true,
  showCutLine: true,
  headerText: "PLANO B ESPETARIA",
  footerText: "Obrigado pela preferência!",
};

export function loadPrintConfig(): PrintConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function savePrintConfig(config: PrintConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
}

export function resetPrintConfig(): PrintConfig {
  localStorage.removeItem(STORAGE_KEY);
  return { ...DEFAULT_CONFIG };
}
