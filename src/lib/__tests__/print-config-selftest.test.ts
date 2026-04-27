/**
 * Garante que a sincronização forçada (auto-teste do Admin) sempre
 * passa pelo banco antes de imprimir, e que o ESC/POS produzido contém
 * o headerText/footerText recém-salvos.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ---- Mock supabase: get_print_config retorna config "fresca" do banco ----
const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...a: any[]) => rpcMock(...a),
    from: () => ({ select: () => ({ eq: () => ({ single: () => ({ data: null }) }) }) }),
  },
}));

import {
  syncPrintConfigFromDb,
  fetchPrintConfigDbMeta,
  loadPrintConfig,
} from "@/lib/print-config";
import { buildEscPosReceipt } from "@/lib/thermal-printer";

beforeEach(() => {
  localStorage.clear();
  rpcMock.mockReset();
});

describe("auto-teste de config — sync força banco antes de imprimir", () => {
  it("syncPrintConfigFromDb aplica headerText do banco no localStorage", async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        value: {
          paperWidth: "80mm",
          printSize: "grande",
          headerText: "TESTE TALAO 123",
          footerText: "Volte sempre!",
          layoutPreset: "classico",
          fontSizes: {},
          visibleSections: { title: true, waiter: true, date: true, notes: true, footer: true },
          contentAlign: "center",
          printSenhaEnabled: true,
        },
        updated_at: "2026-04-27T12:00:00.000Z",
      },
      error: null,
    });

    const cfg = await syncPrintConfigFromDb();
    expect(cfg.headerText).toBe("TESTE TALAO 123");
    expect(cfg.configSource).toBe("db");

    // localStorage virou cache da config do banco
    const cached = loadPrintConfig();
    expect(cached.headerText).toBe("TESTE TALAO 123");
  });

  it("ESC/POS gerado a partir da config sincronizada contém o headerText novo", async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        value: {
          paperWidth: "80mm",
          printSize: "grande",
          headerText: "TESTE TALAO 123",
          footerText: "Obrigado!",
          layoutPreset: "classico",
          fontSizes: {},
          visibleSections: { title: true, waiter: true, date: true, notes: true, footer: true },
          contentAlign: "center",
          printSenhaEnabled: true,
        },
        updated_at: "2026-04-27T12:00:00.000Z",
      },
      error: null,
    });

    const cfg = await syncPrintConfigFromDb();
    const payload = buildEscPosReceipt(
      "Mesa 5",
      "Carlos",
      [{ product_name: "Espeto", quantity: 1, product_price: 10 }],
      10,
      cfg,
      { serviceType: "dine_in" },
    );
    // Decodifica bytes ASCII pra ver se header aparece no payload
    const text = new TextDecoder("latin1").decode(payload);
    expect(text).toContain("TESTE TALAO 123");
  });

  it("fetchPrintConfigDbMeta retorna ok=false quando RPC falha (sem mexer no localStorage)", async () => {
    rpcMock.mockResolvedValueOnce({
      data: null,
      error: { message: "boom" },
    });
    const meta = await fetchPrintConfigDbMeta();
    expect(meta?.ok).toBe(false);
    expect(meta?.error).toBe("boom");
    // localStorage permanece intocado
    expect(localStorage.getItem("print_config")).toBeNull();
  });

  it("fetchPrintConfigDbMeta retorna updatedAt quando banco responde", async () => {
    rpcMock.mockResolvedValueOnce({
      data: { value: {}, updated_at: "2026-04-27T13:00:00.000Z" },
      error: null,
    });
    const meta = await fetchPrintConfigDbMeta();
    expect(meta?.ok).toBe(true);
    expect(meta?.updatedAt).toBe("2026-04-27T13:00:00.000Z");
  });
});
