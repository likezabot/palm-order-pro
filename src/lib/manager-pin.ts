/**
 * PIN de gerente DESABILITADO.
 * As funções continuam exportadas para compatibilidade com o código existente,
 * mas nunca pedem PIN ao usuário e enviam string vazia para o servidor
 * (as RPCs no banco aceitam qualquer valor agora).
 */

export function getManagerPin(): string | null {
  return "";
}

export function setManagerPin(_pin: string) {
  /* noop */
}

export function clearManagerPin() {
  /* noop */
}

export async function requireManagerPin(_reason = "Operação administrativa"): Promise<string | null> {
  return "";
}

export async function withPin<T>(
  fn: (pin: string) => Promise<T>,
  _reason?: string,
): Promise<T | null> {
  return await fn("");
}
