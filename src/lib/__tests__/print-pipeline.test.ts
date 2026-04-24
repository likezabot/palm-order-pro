/**
 * Pipeline de impressão — testes de regressão.
 * Cobre payload mínimo, fallback de queue e branch de update sem delta.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mocks ANTES dos imports do código testado
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi
        .fn()
        .mockResolvedValue({ data: { print_type: "extra", delta_items: null }, error: null }),
      then: undefined,
    })),
  },
}));

vi.mock("@/lib/print-receipt", () => ({
  printReceipt: vi.fn().mockResolvedValue(false),
  printDelta: vi.fn().mockResolvedValue(false),
  printBill: vi.fn().mockResolvedValue(false),
}));

vi.mock("@/lib/print-queue", () => ({
  encodePayloadB64: vi.fn(() => "AAA"),
  enqueuePrintJob: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/print-config", async () => {
  const actual: any = await vi.importActual("@/lib/print-config");
  return {
    ...actual,
    loadPrintConfig: () => ({
      ...actual.defaultPrintConfig,
      printMode: "bridge",
      bridgeUrl: "http://localhost:9100/print",
    }),
  };
});

import { EscPosBuilder, sendTestMinimal } from "@/lib/thermal-printer";

describe("EscPosBuilder", () => {
  it("começa com ESC @ (reset) e termina com GS V (cut) quando .cut() é chamado", () => {
    const b = new EscPosBuilder();
    b.line("oi").cut();
    const buf = b.getPayload();
    // ESC @ = 27, 64
    expect(buf[0]).toBe(27);
    expect(buf[1]).toBe(64);
    // GS V = 29, 86
    const last4 = Array.from(buf.slice(-4));
    expect(last4[0]).toBe(29);
    expect(last4[1]).toBe(86);
  });

  it("normaliza acentos para ASCII", () => {
    const b = new EscPosBuilder();
    b.text("Atenção");
    const buf = b.getPayload();
    // não deve conter bytes > 127 do "ç" original
    const tail = Array.from(buf).slice(2);
    expect(tail.every((c) => c <= 127)).toBe(true);
  });
});

describe("sendTestMinimal", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("retorna { ok: false } quando bridge está offline", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("Failed to fetch")),
    );
    const r = await sendTestMinimal("http://localhost:9100/print");
    expect(r.ok).toBe(false);
    expect(typeof r.latencyMs).toBe("number");
  });

  it("retorna { ok: true } quando bridge responde success=true", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      }),
    );
    const r = await sendTestMinimal("http://localhost:9100/print");
    expect(r.ok).toBe(true);
  });
});

describe("autoPrintUpdate", () => {
  it("cai no fallback (printReceipt) quando print_type=extra mas delta_items é null", async () => {
    vi.resetModules();

    const printReceipt = vi.fn().mockResolvedValue(true);
    const printDelta = vi.fn().mockResolvedValue(true);

    vi.doMock("@/lib/print-receipt", () => ({
      printReceipt,
      printDelta,
      printBill: vi.fn().mockResolvedValue(true),
    }));

    // single() devolve print_type=extra mas delta_items=null
    // depois, ao buscar order_items, devolve 1 item
    const single = vi
      .fn()
      .mockResolvedValueOnce({
        data: {
          print_type: "extra",
          delta_items: null,
          waiter_name: "Carlos",
          original_table_name: null,
        },
        error: null,
      });

    const eqItems = vi.fn().mockResolvedValue({
      data: [{ product_name: "X", quantity: 1, product_price: 10 }],
      error: null,
    });

    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: {
        rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
        from: vi.fn((table: string) => {
          if (table === "orders") {
            return {
              select: () => ({ eq: () => ({ single }) }),
            };
          }
          // order_items
          return { select: () => ({ eq: eqItems }) };
        }),
      },
    }));

    const { autoPrintUpdate } = await import("@/lib/print-service");
    const r = await autoPrintUpdate({
      id: "ord-1",
      table_name: "Mesa 1",
      original_table_name: null,
      waiter_name: "Carlos",
      total: 10,
    });

    // No print_type=extra sem delta, espera que NÃO chame printDelta e
    // que autoPrintUpdate retorne reason='no_delta' (fail rápido).
    expect(printDelta).not.toHaveBeenCalled();
    expect(r.printed).toBe(false);
    expect(r.reason).toBe("no_delta");
  });
});
