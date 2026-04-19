import { describe, it, expect } from "vitest";
import { getSenha, filterTodayBalcao } from "@/lib/senha";

const NOW = new Date("2026-04-19T15:00:00Z");
const TODAY = (h: number, m = 0) =>
  new Date(`2026-04-19T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00Z`).toISOString();
const YESTERDAY = (h: number) =>
  new Date(`2026-04-18T${String(h).padStart(2, "0")}:00:00Z`).toISOString();

describe("senha do BALCÃO", () => {
  it("formata como #001 (3 dígitos com zero à esquerda)", () => {
    const orders = [
      { id: "a", table_name: "BALCÃO", created_at: TODAY(10) },
      { id: "b", table_name: "BALCÃO", created_at: TODAY(11) },
    ];
    expect(getSenha("a", orders, NOW)).toBe("#001");
    expect(getSenha("b", orders, NOW)).toBe("#002");
  });

  it("ignora pedidos de outras mesas (Mesa 1, Mesa 2…)", () => {
    const orders = [
      { id: "m1", table_name: "1", created_at: TODAY(9) },
      { id: "b1", table_name: "BALCÃO", created_at: TODAY(10) },
      { id: "m2", table_name: "5", created_at: TODAY(10, 30) },
      { id: "b2", table_name: "BALCÃO", created_at: TODAY(11) },
    ];
    expect(getSenha("b1", orders, NOW)).toBe("#001");
    expect(getSenha("b2", orders, NOW)).toBe("#002");
  });

  it("ignora pedidos BALCÃO de dias anteriores", () => {
    const orders = [
      { id: "old", table_name: "BALCÃO", created_at: YESTERDAY(20) },
      { id: "new", table_name: "BALCÃO", created_at: TODAY(8) },
    ];
    const today = filterTodayBalcao(orders, NOW);
    expect(today).toHaveLength(1);
    expect(getSenha("new", orders, NOW)).toBe("#001");
  });

  it("formata #100 corretamente (sem padding extra)", () => {
    // Espalha 100 pedidos ao longo do dia para evitar timestamps duplicados.
    const orders = Array.from({ length: 100 }, (_, i) => {
      const totalMin = i * 5; // 0, 5, 10, ... minutos a partir de 00:00
      const h = Math.floor(totalMin / 60);
      const m = totalMin % 60;
      return {
        id: `order-${i}`,
        table_name: "BALCÃO",
        created_at: TODAY(h, m),
      };
    });
    expect(getSenha("order-99", orders, NOW)).toBe("#100");
  });

  it("retorna #000 se o pedido não estiver na lista", () => {
    expect(getSenha("inexistente", [], NOW)).toBe("#000");
  });
});
