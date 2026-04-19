import { describe, it, expect } from "vitest";
import {
  validatePayment,
  calculateChange,
  getPaymentLabel,
} from "@/lib/payment";

describe("payment validation & helpers", () => {
  describe("validatePayment", () => {
    it("aceita PIX/cartão quando valor pago bate com total", () => {
      expect(validatePayment("pix", 50, 50).valid).toBe(true);
      expect(validatePayment("card", 100, 100).valid).toBe(true);
      expect(validatePayment("debit", 25.5, 25.5).valid).toBe(true);
    });

    it("rejeita PIX/cartão com valor diferente do total", () => {
      const r = validatePayment("pix", 50, 49);
      expect(r.valid).toBe(false);
      expect(r.reason).toBe("amount_mismatch");
    });

    it("aceita dinheiro com valor >= total (gera troco)", () => {
      expect(validatePayment("cash", 30, 50).valid).toBe(true);
      expect(validatePayment("cash", 30, 30).valid).toBe(true);
    });

    it("rejeita dinheiro com valor insuficiente", () => {
      const r = validatePayment("cash", 30, 25);
      expect(r.valid).toBe(false);
      expect(r.reason).toBe("insufficient_amount");
    });

    it("rejeita método inválido e total <= 0", () => {
      expect(validatePayment("bitcoin", 10, 10).reason).toBe("invalid_method");
      expect(validatePayment("cash", 0, 0).reason).toBe("invalid_total");
      expect(validatePayment("pix", -5, -5).reason).toBe("invalid_total");
    });
  });

  describe("calculateChange", () => {
    it("calcula troco apenas em dinheiro", () => {
      expect(calculateChange("cash", 30, 50)).toBe(20);
      expect(calculateChange("pix", 30, 50)).toBe(0);
      expect(calculateChange("card", 30, 50)).toBe(0);
    });

    it("retorna 0 quando valor pago < total", () => {
      expect(calculateChange("cash", 50, 30)).toBe(0);
    });

    it("arredonda corretamente em centavos", () => {
      expect(calculateChange("cash", 10.33, 20)).toBeCloseTo(9.67, 2);
    });
  });

  describe("getPaymentLabel", () => {
    it("traduz métodos conhecidos", () => {
      expect(getPaymentLabel("cash")).toBe("Dinheiro");
      expect(getPaymentLabel("pix")).toBe("PIX");
      expect(getPaymentLabel("card")).toBe("Cartão");
    });

    it("retorna fallback para null/desconhecido", () => {
      expect(getPaymentLabel(null)).toBe("Não informado");
      expect(getPaymentLabel(undefined)).toBe("Não informado");
      expect(getPaymentLabel("custom")).toBe("custom");
    });
  });
});
