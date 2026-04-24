/**
 * Configurações persistentes para impressão térmica.
 * Salva no banco (tabela settings) para compartilhar entre dispositivos.
 * Mantém cache em localStorage para acesso síncrono rápido.
 *
 * FONTE ÚNICA DE VERDADE: web e .exe (bridge) leem desta config.
 */

import { supabase } from "@/integrations/supabase/client";

export type PaperWidth = "58mm" | "80mm";
export type PrintSize = "normal" | "grande";
export type LayoutPreset = "mesa_simples" | "classico" | "conta_destacada";
export type ContentAlign = "left" | "center";

export interface FontSizesOverride {
  title?: number;   // cabeçalho do estabelecimento
  header?: number;  // bloco mesa/garçom/data
  items?: number;   // linhas de itens
  notes?: number;   // observações dos itens
  total?: number;   // bloco do total
}

export interface VisibleSections {
  title: boolean;     // header text (PLANO B ESPETARIA)
  waiter: boolean;    // linha do garçom
  date: boolean;      // linha de data/hora
  notes: boolean;     // observações dos itens
  footer: boolean;    // rodapé "Obrigado..."
}

export interface PrintConfig {
  paperWidth: PaperWidth;
  printSize: PrintSize;
  headerText: string;
  footerText: string;
  printMode: "browser" | "bridge";
  bridgeUrl: string;
  // ----- novo: editor visual unificado -----
  layoutPreset: LayoutPreset;
  fontSizes: FontSizesOverride;
  visibleSections: VisibleSections;
  /** Alinhamento do conteúdo (mesa/itens/total). Cabeçalho/rodapé são sempre centralizados. */
  contentAlign: ContentAlign;
  /** Imprime senha automaticamente quando finaliza pedido no BALCÃO. */
  printSenhaEnabled: boolean;
}

const STORAGE_KEY = "print_config";
const DB_KEY = "print_config";

/**
 * Campos que NÃO devem ser sincronizados pelo banco — são por dispositivo.
 * Ex.: o desktop usa http://localhost:9100/print e o celular usa http://IP:9100/print.
 * Se sincronizássemos isso, um dispositivo quebraria o outro.
 */
const LOCAL_ONLY_KEYS = ["bridgeUrl", "printMode"] as const;
type LocalOnlyKey = typeof LOCAL_ONLY_KEYS[number];

const DEFAULT_VISIBLE: VisibleSections = {
  title: true,
  waiter: true,
  date: true,
  notes: true,
  footer: true,
};

export const DEFAULT_CONFIG: PrintConfig = {
  paperWidth: "80mm",
  printSize: "grande",
  headerText: "PLANO B ESPETARIA",
  footerText: "Obrigado pela preferência!",
  printMode: "browser",
  bridgeUrl: "http://localhost:9100/print",
  layoutPreset: "classico",
  fontSizes: {},
  visibleSections: { ...DEFAULT_VISIBLE },
  contentAlign: "center",
  printSenhaEnabled: true,
};

/** Aplica preset e devolve overrides recomendados (usuário ainda pode ajustar). */
export function applyPreset(preset: LayoutPreset, base: PrintConfig): PrintConfig {
  const next: PrintConfig = { ...base, layoutPreset: preset };
  switch (preset) {
    case "mesa_simples":
      next.fontSizes = { title: 18, header: 14, items: 14, notes: 11, total: 18 };
      next.visibleSections = { title: true, waiter: false, date: false, notes: true, footer: false };
      break;
    case "classico":
      next.fontSizes = {}; // usa defaults do printSize
      next.visibleSections = { ...DEFAULT_VISIBLE };
      break;
    case "conta_destacada":
      next.fontSizes = { title: 22, header: 15, items: 15, notes: 12, total: 26 };
      next.visibleSections = { title: true, waiter: true, date: true, notes: true, footer: true };
      break;
  }
  return next;
}

/** Tamanhos base derivados do preset printSize (compat). */
function baseFontSizes(size: PrintSize) {
  if (size === "grande") {
    return { title: 20, base: 15, total: 19, senha: 80, note: 12, footer: 11, lineHeight: 1.5 };
  }
  return { title: 16, base: 13, total: 16, senha: 64, note: 10, footer: 9, lineHeight: 1.4 };
}

/** Tamanhos finais aplicando overrides do editor visual. */
export function getFontSizes(sizeOrCfg: PrintSize | PrintConfig) {
  const cfg: PrintConfig | null = typeof sizeOrCfg === "string" ? null : sizeOrCfg;
  const size: PrintSize = typeof sizeOrCfg === "string" ? sizeOrCfg : sizeOrCfg.printSize;
  const base = baseFontSizes(size);
  if (!cfg) return base;
  const o = cfg.fontSizes || {};
  return {
    ...base,
    title: o.title ?? base.title,
    base: o.items ?? base.base,
    total: o.total ?? base.total,
    note: o.notes ?? base.note,
    footer: base.footer,
    // header não tinha campo dedicado; mapeia em info-row via baseSize secundário
    headerInfo: o.header ?? base.base,
  } as ReturnType<typeof baseFontSizes> & { headerInfo: number };
}

/** Synchronous load from localStorage cache (used by print functions) */
export function loadPrintConfig(): PrintConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_CONFIG };
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
      fontSizes: { ...(parsed.fontSizes || {}) },
      visibleSections: { ...DEFAULT_VISIBLE, ...(parsed.visibleSections || {}) },
    };
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

/** Load from database and update localStorage cache.
 *  IMPORTANTE: bridgeUrl e printMode são LOCAIS por dispositivo, então
 *  sempre preservamos os valores que já estão no localStorage. */
export async function syncPrintConfigFromDb(): Promise<PrintConfig> {
  const local = loadPrintConfig();
  try {
    const { data } = await supabase
      .from("settings")
      .select("value")
      .eq("key", DB_KEY)
      .single();

    if (data?.value) {
      const parsed = JSON.parse(data.value);
      const merged: PrintConfig = {
        ...DEFAULT_CONFIG,
        ...parsed,
        fontSizes: { ...(parsed.fontSizes || {}) },
        visibleSections: { ...DEFAULT_VISIBLE, ...(parsed.visibleSections || {}) },
      };
      // preserva config local do dispositivo
      for (const k of LOCAL_ONLY_KEYS) {
        (merged as any)[k] = (local as any)[k] ?? (merged as any)[k];
      }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
      return merged;
    }
  } catch {
    // DB not available, use local
  }
  return local;
}

/** Fire-and-forget save to database — strip campos locais antes de subir. */
function savePrintConfigToDb(config: PrintConfig): void {
  const sanitized: any = { ...config };
  for (const k of LOCAL_ONLY_KEYS) delete sanitized[k];
  const value = JSON.stringify(sanitized);
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
