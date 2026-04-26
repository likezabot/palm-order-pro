/**
 * Controle de acesso por PIN compartilhado da equipe.
 * O PIN destrava TODAS as rotas internas (/home, /palm, /kitchen, /pdv,
 * /admin, /print-station, /instalar/*, /atualizar).
 *
 * Estratégia:
 *  - PIN padrão: "2580" (pode ser sobrescrito via localStorage `staff_pin_override`)
 *  - Quando o usuário acerta o PIN uma vez, salvamos um token em localStorage
 *    e o aparelho fica destravado pra sempre (até o usuário limpar o cache
 *    ou clicar em "Sair" / "Trocar aparelho").
 *  - É proteção *de UI* — não substitui RLS no banco. Serve pra evitar que
 *    clientes que recebem o link do cardápio descubram /admin digitando.
 */

const STORAGE_KEY = "staff_access_unlocked";
const OVERRIDE_KEY = "staff_pin_override";
const DEFAULT_PIN = "112233";

export function getExpectedPin(): string {
  try {
    const override = localStorage.getItem(OVERRIDE_KEY);
    if (override && override.trim().length >= 4) return override.trim();
  } catch {
    /* ignora erros de localStorage (ex: modo privado) */
  }
  return DEFAULT_PIN;
}

export function isStaffUnlocked(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function unlockStaff(pin: string): boolean {
  if (pin.trim() !== getExpectedPin()) return false;
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignora */
  }
  return true;
}

export function lockStaff() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignora */
  }
}
