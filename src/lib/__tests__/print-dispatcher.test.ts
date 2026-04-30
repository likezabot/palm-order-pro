import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock config to avoid DB hit
vi.mock("@/lib/print-config", () => ({
  ensureFreshPrintConfig: vi.fn().mockResolvedValue({
    paperWidth: "80mm",
    printSize: "grande",
    headerText: "TESTE PLANO B",
    footerText: "Obrigado",
    printMode: "bridge",
    bridgeUrl: "http://localhost:3001/print",
    layoutPreset: "classico",
    fontSizes: {},
    visibleSections: { title: true, waiter: true, date: true, notes: true, footer: true },
    contentAlign: "center",
    printSenhaEnabled: true,
    configSource: "db",
    configUpdatedAt: new Date().toISOString(),
  }),
  loadPrintConfig: vi.fn().mockReturnValue({
    printMode: "bridge",
    bridgeUrl: "http://localhost:3001/print",
  }),
}));

const printDelivery = vi.fn().mockResolvedValue(true);
const printReceipt = vi.fn().mockResolvedValue(true);
const printDelta = vi.fn().mockResolvedValue(true);
const printBill = vi.fn().mockResolvedValue(true);

vi.mock("@/lib/print-receipt", () => ({
  printDelivery: (...a: any[]) => printDelivery(...a),
  printReceipt: (...a: any[]) => printReceipt(...a),
  printDelta: (...a: any[]) => printDelta(...a),
  printBill: (...a: any[]) => printBill(...a),
}));

vi.mock("@/lib/thermal-printer", () => ({
  buildEscPosReceipt: vi.fn().mockReturnValue(new Uint8Array()),
  buildEscPosDelta: vi.fn().mockReturnValue(new Uint8Array()),
  buildEscPosBill: vi.fn().mockReturnValue(new Uint8Array()),
  buildEscPosDelivery: vi.fn().mockReturnValue(new Uint8Array()),
  checkBridgeStatus: vi.fn().mockResolvedValue({ online: true, printer_connected: true }),
}));

vi.mock("@/lib/print-queue", () => ({
  encodePayloadB64: vi.fn().mockReturnValue(""),
  enqueuePrintJob: vi.fn().mockResolvedValue(undefined),
}));

function mockSupabase(orderRow: any, items: any[]) {
  const single = vi.fn().mockResolvedValue({ data: orderRow, error: null });
  const eqItems = vi.fn().mockResolvedValue({ data: items, error: null });
  return {
    from: vi.fn((table: string) => {
      if (table === "orders") return { select: () => ({ eq: () => ({ single }) }) };
      return { select: () => ({ eq: eqItems }) };
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };
}

describe("printOrderByServiceType — dispatcher único", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("delivery NUNCA usa layout de mesa — sempre printDelivery", async () => {
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: mockSupabase(
        {
          id: "o1",
          table_name: "Delivery #123",
          service_type: "delivery",
          delivery_address: { street: "Rua A", number: "10", neighborhood: "Centro" },
          delivery_fee: 5,
          customer_name_snapshot: "João",
          customer_phone_snapshot: "11999",
          payment_method: "pix",
          total: 35,
        },
        [{ product_name: "X", quantity: 1, product_price: 30 }],
      ),
    }));
    const { printOrderByServiceType } = await import("@/lib/print-dispatcher");
    const r = await printOrderByServiceType("o1", "full");
    expect(printDelivery).toHaveBeenCalled();
    expect(printReceipt).not.toHaveBeenCalled();
    expect(r.layoutUsed).toBe("delivery");
    expect(r.serviceType).toBe("delivery");
  });

  it("pickup usa receipt SEM bloco MESA (tableValue vazio)", async () => {
    vi.resetModules();
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: mockSupabase(
        { id: "o2", table_name: "Retirada #5", service_type: "pickup", total: 20 },
        [{ product_name: "Y", quantity: 1, product_price: 20 }],
      ),
    }));
    const { printOrderByServiceType } = await import("@/lib/print-dispatcher");
    const r = await printOrderByServiceType("o2", "full");
    expect(printDelivery).not.toHaveBeenCalled();
    expect(printReceipt).toHaveBeenCalled();
    const callArgs = printReceipt.mock.calls[0];
    expect(callArgs[0]).toBe(""); // tableValue vazio para pickup
    expect(r.layoutUsed).toBe("pickup");
  });

  it("dine_in usa receipt COM nome de mesa", async () => {
    vi.resetModules();
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: mockSupabase(
        { id: "o3", table_name: "Mesa 4", service_type: "dine_in", waiter_name: "Ana", total: 50 },
        [{ product_name: "Z", quantity: 2, product_price: 25 }],
      ),
    }));
    const { printOrderByServiceType } = await import("@/lib/print-dispatcher");
    const r = await printOrderByServiceType("o3", "full");
    expect(printReceipt).toHaveBeenCalled();
    const callArgs = printReceipt.mock.calls[0];
    expect(callArgs[0]).toContain("Mesa 4");
    expect(callArgs[1]).toBe("Ana"); // waiter, nunca "N/A"
    expect(r.layoutUsed).toBe("dine_in_full");
  });

  it("waiter vazio NUNCA vira N/A", async () => {
    vi.resetModules();
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: mockSupabase(
        { id: "o4", table_name: "Mesa 1", service_type: "dine_in", waiter_name: null, total: 10 },
        [{ product_name: "A", quantity: 1, product_price: 10 }],
      ),
    }));
    const { printOrderByServiceType } = await import("@/lib/print-dispatcher");
    await printOrderByServiceType("o4", "full");
    const callArgs = printReceipt.mock.calls[0];
    expect(callArgs[1]).toBe(""); // string vazia, layout omite linha
  });

  it("delivery injeta fingerprint com source repassado", async () => {
    vi.resetModules();
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: mockSupabase(
        {
          id: "o5",
          table_name: "Delivery #9",
          service_type: "delivery",
          delivery_address: { street: "R", number: "1", neighborhood: "C" },
          delivery_fee: 5,
          customer_name_snapshot: "X",
          customer_phone_snapshot: "1",
          payment_method: "pix",
          total: 35,
        },
        [{ product_name: "X", quantity: 1, product_price: 30 }],
      ),
    }));
    const { printOrderByServiceType } = await import("@/lib/print-dispatcher");
    await printOrderByServiceType("o5", "full", "manual");
    const input = printDelivery.mock.calls[0][0];
    expect(input.fingerprint).toBeTruthy();
    expect(input.fingerprint.printPath).toBe("dispatcher.delivery");
    expect(input.fingerprint.source).toBe("manual");
    expect(input.serviceType).toBe("delivery");
  });

  it("pickup injeta fingerprint com SERVICE pickup e tableValue vazio", async () => {
    vi.resetModules();
    vi.doMock("@/integrations/supabase/client", () => ({
      supabase: mockSupabase(
        { id: "o6", table_name: "Retirada #5", service_type: "pickup", total: 20 },
        [{ product_name: "Y", quantity: 1, product_price: 20 }],
      ),
    }));
    const { printOrderByServiceType } = await import("@/lib/print-dispatcher");
    await printOrderByServiceType("o6", "full", "reprint");
    const callArgs = printReceipt.mock.calls[0];
    expect(callArgs[0]).toBe(""); // sem MESA
    const extras = callArgs[4];
    expect(extras.serviceType).toBe("pickup");
    expect(extras.fingerprint.source).toBe("reprint");
    expect(extras.fingerprint.printPath).toContain("pickup");
  });
});
