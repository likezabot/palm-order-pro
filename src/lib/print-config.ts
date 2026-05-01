/**
 * Configurações persistentes para impressão térmica.
 * Salva no banco (tabela settings) para compartilhar entre dispositivos.
 * Mantém cache em localStorage para acesso síncrono rápido.
 *
 * FONTE ÚNICA DE VERDADE: web e .exe (bridge) leem desta config.
 */

import { supabase } from "@/integrations/supabase/client";

export type PaperWidth = "58mm" | "80mm";
export type PrintSize = "pequeno" | "normal" | "grande" | "extra";
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
  /** Mostrar a linha "PEDIDO #1234" */
  showOrderNumber: boolean;
}

export interface PerTypeConfig {
  copies?: number;
  autoPrint?: boolean;
  printerName?: string;
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
  /** Imprime cupom automaticamente quando um pedido novo chega. */
  autoPrintNewOrders: boolean;
  /** Imprime acréscimos automaticamente quando itens são adicionados a um pedido existente. */
  autoPrintAcrescimos: boolean;
  
  // ----- campos de auditoria (sem UI ainda) -----
  addressLine1?: string;    // Endereço linha 1
  addressLine2?: string;    // Endereço linha 2
  phone?: string;           // Telefone
  cnpj?: string;            // CNPJ
  logoUrl?: string;         // URL do logo no Supabase Storage
  copiesDefault?: number;   // Número de vias padrão (default: 1)
  separatorStyle?: "line" | "dashes" | "stars" | "none";
  perType?: {
    mesa?: PerTypeConfig;
    balcao?: PerTypeConfig;
    delivery?: PerTypeConfig;
  };

  /** Metadados de sincronização do cache local. */
  configUpdatedAt?: string;
  configSource?: "default" | "local" | "db";
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
const META_ONLY_KEYS = ["configUpdatedAt", "configSource"] as const;

type DbPrintConfigPayload = Omit<PrintConfig, LocalOnlyKey | (typeof META_ONLY_KEYS)[number]>;

const DEFAULT_VISIBLE: VisibleSections = {
  title: true,
  waiter: true,
  date: true,
  notes: true,
  footer: true,
  showOrderNumber: true,
};

export const DEFAULT_CONFIG: PrintConfig = {
  paperWidth: "80mm",
  printSize: "grande",
  headerText: "PLANO B ESPETARIA",
  footerText: "Obrigado pela preferência!",
  printMode: "browser",
  bridgeUrl: "http://localhost:9100",
  layoutPreset: "classico",
  fontSizes: {},
  visibleSections: { ...DEFAULT_VISIBLE },
  contentAlign: "center",
  printSenhaEnabled: true,
  autoPrintNewOrders: true,
  autoPrintAcrescimos: true,
  configSource: "default",
  // Novos campos default
  addressLine1: "",
  addressLine2: "",
  phone: "",
  cnpj: "",
  logoUrl: "",
  copiesDefault: 1,
  separatorStyle: "line",
  perType: {},
};

/** Aplica preset e devolve overrides recomendados (usuário ainda pode ajustar). */
export function applyPreset(preset: LayoutPreset, base: PrintConfig): PrintConfig {
  const next: PrintConfig = { ...base, layoutPreset: preset };
  switch (preset) {
    case "mesa_simples":
      next.fontSizes = { title: 18, header: 14, items: 14, notes: 11, total: 18 };
      next.visibleSections = { title: true, waiter: false, date: false, notes: true, footer: false, showOrderNumber: true };
      break;
    case "classico":
      next.fontSizes = {}; // usa defaults do printSize
      next.visibleSections = { ...DEFAULT_VISIBLE };
      break;
    case "conta_destacada":
      next.fontSizes = { title: 22, header: 15, items: 15, notes: 12, total: 26 };
      next.visibleSections = { title: true, waiter: true, date: true, notes: true, footer: true, showOrderNumber: true };
      break;
  }
  return next;
}

/** Tamanhos base derivados do preset printSize (compat). */
function baseFontSizes(size: PrintSize) {
  switch (size) {
    case "extra":
      return { title: 24, base: 17, total: 22, senha: 96, note: 14, footer: 12, lineHeight: 1.6 };
    case "grande":
      return { title: 20, base: 15, total: 19, senha: 80, note: 12, footer: 11, lineHeight: 1.5 };
    case "pequeno":
      return { title: 14, base: 11, total: 13, senha: 52, note: 9, footer: 8, lineHeight: 1.3 };
    default: // normal
      return { title: 16, base: 13, total: 16, senha: 64, note: 10, footer: 9, lineHeight: 1.4 };
  }
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
    headerInfo: o.header ?? base.base,
  } as ReturnType<typeof baseFontSizes> & { headerInfo: number };
}

function normalizeConfig(raw: Partial<PrintConfig>, source: PrintConfig["configSource"]): PrintConfig {
  const config: PrintConfig = {
    ...DEFAULT_CONFIG,
    ...raw,
    fontSizes: { ...(raw.fontSizes || {}) },
    visibleSections: { ...DEFAULT_VISIBLE, ...(raw.visibleSections || {}) },
    configSource: source,
  };

  // REQUISITO: Forçar modo bridge local se estiver rodando dentro do EXE desktop
  // Isso garante que mesmo após um sync do banco, os valores locais permaneçam corretos.
  const isDesktop = typeof window !== "undefined" && (window as any).desktopPrinter?.isDesktop?.() === true;
  if (isDesktop) {
    config.printMode = "bridge";
    // Lê a bridgeUrl dinâmica do preload (reflete a porta real do config.json)
    const preloadBridgeUrl = (window as any).desktopPrinter?.bridgeUrl;
    config.bridgeUrl = preloadBridgeUrl || "http://localhost:9100";
  }

  return config;
}

function persistLocal(config: PrintConfig): PrintConfig {
  const normalized = normalizeConfig(config, config.configSource ?? "local");
  localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  return normalized;
}

function stripDbOnly(config: PrintConfig): DbPrintConfigPayload {
  const sanitized: any = { ...config };
  for (const k of LOCAL_ONLY_KEYS) delete sanitized[k];
  for (const k of META_ONLY_KEYS) delete sanitized[k];
  return sanitized as DbPrintConfigPayload;
}

/** Synchronous load from localStorage cache (used by print functions) */
export function loadPrintConfig(): PrintConfig {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return normalizeConfig(DEFAULT_CONFIG, "default");
    const parsed = JSON.parse(raw);
    return normalizeConfig(parsed, parsed?.configSource ?? "local");
  } catch {
    return normalizeConfig(DEFAULT_CONFIG, "default");
  }
}

/** Save to localStorage AND to database */
export function savePrintConfig(config: PrintConfig): void {
  const stamped = normalizeConfig(
    {
      ...config,
      configUpdatedAt: new Date().toISOString(),
      configSource: "local",
    },
    "local",
  );
  persistLocal(stamped);
  void savePrintConfigToDb(stamped);
}

/** Reset to defaults locally and in database */
export function resetPrintConfig(): PrintConfig {
  localStorage.removeItem(STORAGE_KEY);
  const fresh = normalizeConfig(
    {
      ...DEFAULT_CONFIG,
      configUpdatedAt: new Date().toISOString(),
      configSource: "local",
    },
    "local",
  );
  persistLocal(fresh);
  void savePrintConfigToDb(fresh);
  return fresh;
}

/** Load from database and update localStorage cache.
 *  IMPORTANTE: bridgeUrl e printMode são LOCAIS por dispositivo, então
 *  sempre preservamos os valores que já estão no localStorage. */
export async function syncPrintConfigFromDb(): Promise<PrintConfig> {
  const local = loadPrintConfig();
  try {
    const { data, error } = await supabase.rpc("get_print_config");
    if (error) throw error;

    if (data) {
      const wrap = data as { value: any; updated_at: string };
      const parsed = typeof wrap.value === "string" ? JSON.parse(wrap.value) : wrap.value;
      const merged = normalizeConfig(
        {
          ...parsed,
          configUpdatedAt: wrap.updated_at ?? local.configUpdatedAt,
          configSource: "db",
        },
        "db",
      );
      for (const k of LOCAL_ONLY_KEYS) {
        (merged as any)[k] = (local as any)[k] ?? (merged as any)[k];
      }
      persistLocal(merged);
      return merged;
    }
  } catch (e) {
    console.warn("[print-config] sync from DB failed", e);
  }
  return local;
}

/**
 * Antes de imprimir, garante que o cache local não está mais velho que o banco.
 * Se o banco tiver versão mais nova, força sync e atualiza o cache imediatamente.
 */
export async function ensureFreshPrintConfig(): Promise<PrintConfig> {
  const local = loadPrintConfig();
  try {
    const { data } = await supabase.rpc("get_print_config");
    if (!data) return local;
    const wrap = data as { value: any; updated_at: string };
    const dbTs = wrap.updated_at ? Date.parse(wrap.updated_at) : 0;
    const localTs = local.configUpdatedAt ? Date.parse(local.configUpdatedAt) : 0;

    if (dbTs && (!localTs || dbTs > localTs)) {
      return await syncPrintConfigFromDb();
    }
  } catch {
    // segue com cache local
  }
  return local;
}

/**
 * Lê metadata do banco SEM mexer no localStorage. Usado pelo Admin para
 * mostrar diff entre o que está no banco vs o que está aplicado neste
 * dispositivo. Retorna null em caso de falha (banco offline / RPC erro).
 */
export async function fetchPrintConfigDbMeta(): Promise<{
  updatedAt: string | null;
  ok: boolean;
  error?: string;
} | null> {
  try {
    const { data, error } = await supabase.rpc("get_print_config");
    if (error) return { updatedAt: null, ok: false, error: error.message };
    if (!data) return { updatedAt: null, ok: true };
    const wrap = data as { value: any; updated_at: string };
    return { updatedAt: wrap.updated_at ?? null, ok: true };
  } catch (e: any) {
    return { updatedAt: null, ok: false, error: e?.message ?? String(e) };
  }
}

/** Fire-and-forget save to database via SECURITY DEFINER RPC. */
async function savePrintConfigToDb(config: PrintConfig): Promise<void> {
  const payload = stripDbOnly(config);
  const { error } = await supabase.rpc("admin_save_print_config", {
    p_config: payload as any,
  });
  if (error) console.warn("[print-config] Erro ao salvar no banco:", error);
}

