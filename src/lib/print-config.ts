/**
 * Configurações persistentes para impressão térmica.
 * Salva no banco (tabela settings) para compartilhar entre dispositivos.
 * Mantém cache em localStorage para acesso síncrono rápido.
 */

import { supabase } from "@/integrations/supabase/client";

export type PaperWidth = "58mm" | "80mm";
export type PrintSize = "normal" | "grande";

export interface PrintConfig {
  paperWidth: PaperWidth;
  printSize: PrintSize;
  headerText: string;
  footerText: string;
}

const STORAGE_KEY = "print_config";
const DB_KEY = "print_config";

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

/** Synchronous load from localStorage cache (used by print functions) */
export function loadPrintConfig(): PrintConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

/** Save to localStorage AND to database */
export function savePrintConfig(config: PrintConfig): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  savePrintConfigToDb(config);
}

/** Reset to defaults locally and in database */
export function resetPrintConfig(): PrintConfig {
  localStorage.removeItem(STORAGE_KEY);
  savePrintConfigToDb(DEFAULT_CONFIG);
  return { ...DEFAULT_CONFIG };
}

/** Load from database and update localStorage cache */
export async function syncPrintConfigFromDb(): Promise<PrintConfig> {
  try {
    const { data } = await supabase
      .from("settings")
      .select("value")
      .eq("key", DB_KEY)
      .single();

    if (data?.value) {
      const parsed = { ...DEFAULT_CONFIG, ...JSON.parse(data.value) };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      return parsed;
    }
  } catch {
    // DB not available, use local
  }
  return loadPrintConfig();
}

/** Fire-and-forget save to database */
function savePrintConfigToDb(config: PrintConfig): void {
  const value = JSON.stringify(config);
  supabase
    .from("settings")
    .upsert(
      { key: DB_KEY, value, updated_at: new Date().toISOString() },
      { onConflict: "key" }
    )
    .then(({ error }) => {
      if (error) console.warn("[print-config] Erro ao salvar no banco:", error);
    });
}
