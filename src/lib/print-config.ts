/**
 * Configurações persistentes para impressão térmica.
 * Simplificado: apenas largura do papel e tamanho (normal/grande).
 */

export type PaperWidth = "58mm" | "80mm";
export type PrintSize = "normal" | "grande";

export interface PrintConfig {
  paperWidth: PaperWidth;
  printSize: PrintSize;
  headerText: string;
  footerText: string;
}

const STORAGE_KEY = "print_config";

export const DEFAULT_CONFIG: PrintConfig = {
  paperWidth: "80mm",
  printSize: "grande",
  headerText: "PLANO B ESPETARIA",
  footerText: "Obrigado pela preferência!",
};

/** Font sizes derived from printSize preset */
export function getFontSizes(size: PrintSize) {
  if (size === "grande") {
    return {
      title: 20,
      base: 15,
      total: 19,
      senha: 80,
      note: 12,
      footer: 11,
      lineHeight: 1.5,
    };
  }
  return {
    title: 16,
    base: 13,
    total: 16,
    senha: 64,
    note: 10,
    footer: 9,
    lineHeight: 1.4,
  };
}

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
