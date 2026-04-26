/**
 * Cache do α de overlay calculado por URL de imagem (hero do cardápio).
 *
 * Por que: amostrar a luminância da imagem custa um download + decode + draw
 * em canvas. Em internet instável (3G, hotspot), isso atrasa o ajuste do
 * contraste e gera “flash” visual quando o overlay é recalculado.
 *
 * Estratégia: localStorage (síncrono, instantâneo no primeiro paint), namespace
 * próprio, TTL de 30 dias, versionamento para invalidar em mudanças do algoritmo,
 * limite de 50 entradas (LRU simples por timestamp).
 *
 * Não usamos IndexedDB porque o ganho aqui é justamente leitura síncrona no
 * primeiro render — IDB é assíncrono e perderíamos o benefício.
 */

const STORAGE_KEY = "pb:hero-overlay-cache:v1";
const TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 dias
const MAX_ENTRIES = 50;

type Entry = { alpha: number; ts: number };
type CacheShape = Record<string, Entry>;

function safeParse(raw: string | null): CacheShape {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? (obj as CacheShape) : {};
  } catch {
    return {};
  }
}

function readAll(): CacheShape {
  if (typeof window === "undefined") return {};
  try {
    return safeParse(window.localStorage.getItem(STORAGE_KEY));
  } catch {
    return {};
  }
}

function writeAll(cache: CacheShape) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // quota / modo privado: silenciar
  }
}

/** Lê o α cacheado para uma URL. Retorna null se ausente ou expirado. */
export function getCachedOverlayAlpha(url: string): number | null {
  if (!url) return null;
  const cache = readAll();
  const entry = cache[url];
  if (!entry) return null;
  if (Date.now() - entry.ts > TTL_MS) return null;
  if (typeof entry.alpha !== "number" || !Number.isFinite(entry.alpha)) return null;
  return entry.alpha;
}

/** Salva o α calculado para uma URL e aplica LRU se passar do limite. */
export function setCachedOverlayAlpha(url: string, alpha: number): void {
  if (!url || !Number.isFinite(alpha)) return;
  const cache = readAll();
  cache[url] = { alpha, ts: Date.now() };

  const keys = Object.keys(cache);
  if (keys.length > MAX_ENTRIES) {
    // remove os mais antigos até caber
    keys
      .sort((a, b) => (cache[a].ts ?? 0) - (cache[b].ts ?? 0))
      .slice(0, keys.length - MAX_ENTRIES)
      .forEach((k) => delete cache[k]);
  }
  writeAll(cache);
}

/** Limpa todo o cache (útil para testes/admin). */
export function clearOverlayAlphaCache(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
