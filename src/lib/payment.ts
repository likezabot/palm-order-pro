/**
 * Helpers de pagamento para POS.
 * Pagamento real é executado via RPC `pay_order`; estes utilitários
 * normalizam labels e calculam troco.
 */

export type PaymentMethod = "cash" | "pix" | "card" | "credit" | "debit" | "none";

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  cash: "Dinheiro",
  pix: "PIX",
  card: "Cartão",
  credit: "Crédito",
  debit: "Débito",
  none: "Não informado",
};

/** Retorna label legível em pt-BR para um método de pagamento (ou fallback). */
export function getPaymentLabel(method: string | null | undefined): string {
  if (!method) return PAYMENT_LABELS.none;
  return PAYMENT_LABELS[method as PaymentMethod] ?? method;
}

/** Calcula troco. Retorna 0 se não for dinheiro ou se valor pago < total. */
export function calculateChange(
  method: PaymentMethod | string,
  total: number,
  amountPaid: number,
): number {
  if (method !== "cash") return 0;
  const change = amountPaid - total;
  return change > 0 ? Number(change.toFixed(2)) : 0;
}

/**
 * Valida um pagamento antes de submeter.
 * - PIX/cartão: amountPaid deve ser igual ao total (com tolerância de 1 centavo)
 * - Dinheiro: amountPaid deve ser >= total
 * - Total deve ser > 0
 */
export interface PaymentValidationResult {
  valid: boolean;
  reason?: "invalid_total" | "insufficient_amount" | "amount_mismatch" | "invalid_method";
}

const VALID_METHODS: PaymentMethod[] = ["cash", "pix", "card", "credit", "debit"];

export function validatePayment(
  method: string,
  total: number,
  amountPaid: number,
): PaymentValidationResult {
  if (!VALID_METHODS.includes(method as PaymentMethod)) {
    return { valid: false, reason: "invalid_method" };
  }
  if (!Number.isFinite(total) || total <= 0) {
    return { valid: false, reason: "invalid_total" };
  }
  if (method === "cash") {
    if (amountPaid + 0.001 < total) {
      return { valid: false, reason: "insufficient_amount" };
    }
    return { valid: true };
  }
  // Eletrônicos: deve bater exatamente (tolerância de 1 centavo)
  if (Math.abs(amountPaid - total) > 0.01) {
    return { valid: false, reason: "amount_mismatch" };
  }
  return { valid: true };
}
