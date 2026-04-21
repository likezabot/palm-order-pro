/**
 * ID único por aba/PWA. Persiste em sessionStorage:
 * - mesma aba após reload → mesmo ID
 * - nova aba ou novo PWA → novo ID
 *
 * Útil para confirmar visualmente que cada cliente está assinando
 * um canal Realtime único (evita colisões de canal entre abas).
 */

const KEY = "plb:tab-id";

let cached: string | null = null;

export function getTabId(): string {
  if (cached) return cached;
  try {
    const existing = sessionStorage.getItem(KEY);
    if (existing) {
      cached = existing;
      return existing;
    }
    const id = crypto.randomUUID();
    sessionStorage.setItem(KEY, id);
    cached = id;
    return id;
  } catch {
    // Fallback se sessionStorage estiver bloqueado.
    if (!cached) cached = crypto.randomUUID();
    return cached;
  }
}

/** Versão curta (8 chars) para exibição na UI. */
export function getShortTabId(): string {
  return getTabId().slice(0, 8);
}
