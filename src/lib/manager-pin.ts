/**
 * Cache do PIN de gerente em sessionStorage (limpa ao fechar aba).
 * Usado por todas as operações administrativas que chamam RPCs SECURITY DEFINER.
 */
const KEY = "manager_pin";

export function getManagerPin(): string | null {
  try {
    return sessionStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setManagerPin(pin: string) {
  try {
    sessionStorage.setItem(KEY, pin);
  } catch { /* noop */ }
}

export function clearManagerPin() {
  try {
    sessionStorage.removeItem(KEY);
  } catch { /* noop */ }
}

/**
 * Solicita o PIN ao gerente (prompt nativo). Retorna null se cancelar.
 * Cacheia em sessionStorage para o resto da sessão.
 */
export async function requireManagerPin(reason = "Operação administrativa"): Promise<string | null> {
  const cached = getManagerPin();
  if (cached) return cached;
  const pin = window.prompt(`${reason}\n\nDigite o PIN de gerente:`);
  if (!pin) return null;
  setManagerPin(pin.trim());
  return pin.trim();
}

/**
 * Wrapper para RPC que precisa de PIN. Se o PIN estiver errado, limpa o cache
 * e tenta novamente uma vez.
 */
export async function withPin<T>(
  fn: (pin: string) => Promise<T>,
  reason?: string,
): Promise<T | null> {
  const pin = await requireManagerPin(reason);
  if (!pin) return null;
  try {
    return await fn(pin);
  } catch (err: any) {
    const msg = String(err?.message || err || "");
    if (msg.includes("invalid_pin") || msg.includes("pin") || msg.includes("PIN")) {
      clearManagerPin();
      const retry = await requireManagerPin(`${reason ?? ""} — PIN incorreto, tente novamente`);
      if (!retry) return null;
      return await fn(retry);
    }
    throw err;
  }
}
