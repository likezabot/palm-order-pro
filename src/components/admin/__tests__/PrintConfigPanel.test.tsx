/**
 * Testes do painel Admin de configuração de impressão.
 *
 * Garantias críticas:
 *  - Carrega config do banco no mount (syncPrintConfigFromDb)
 *  - Salvar dispara savePrintConfig (que chama RPC admin_save_print_config)
 *  - Sincronizar dispara syncPrintConfigFromDb
 *  - Preview de delivery NÃO mostra "MESA" / "GARCOM"
 *  - Preview de retirada NÃO mostra "MESA"
 *  - visibleSections altera preview
 *  - header/footer alterados aparecem no preview
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";

// ----- mocks de print-config (banco / RPCs) -----
const syncMock = vi.fn();
const saveMock = vi.fn();
const resetMock = vi.fn();

vi.mock("@/lib/print-config", async () => {
  const actual: any = await vi.importActual("@/lib/print-config");
  return {
    ...actual,
    syncPrintConfigFromDb: (...a: any[]) => syncMock(...a),
    savePrintConfig: (...a: any[]) => saveMock(...a),
    resetPrintConfig: (...a: any[]) => resetMock(...a),
  };
});

// ----- mocks de impressão real -----
vi.mock("@/lib/print-receipt", async () => {
  const actual: any = await vi.importActual("@/lib/print-receipt");
  return {
    ...actual,
    printReceipt: vi.fn().mockResolvedValue(true),
    printSenha: vi.fn().mockResolvedValue(true),
    printDelivery: vi.fn().mockResolvedValue(true),
    printBill: vi.fn().mockResolvedValue(true),
  };
});

// ----- mock bridge health -----
vi.mock("@/lib/thermal-printer", async () => {
  const actual: any = await vi.importActual("@/lib/thermal-printer");
  return {
    ...actual,
    checkBridgeStatus: vi.fn().mockResolvedValue({
      online: true,
      printer_connected: true,
      bridge_version: "test",
    }),
  };
});

// ----- mock supabase -----
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    from: () => ({ select: () => ({ eq: () => ({ single: () => ({ data: null }) }) }) }),
  },
}));

import PrintConfigPanel from "@/components/admin/PrintConfigPanel";
import { DEFAULT_CONFIG } from "@/lib/print-config";

const baseCfg = {
  ...DEFAULT_CONFIG,
  headerText: "TESTE PLANO B",
  footerText: "Volte sempre!",
  configSource: "db" as const,
  configUpdatedAt: new Date().toISOString(),
};

beforeEach(() => {
  localStorage.clear();
  syncMock.mockReset();
  saveMock.mockReset();
  resetMock.mockReset();
  syncMock.mockResolvedValue(baseCfg);
  resetMock.mockReturnValue(baseCfg);
});

function getPreviewIframe(): HTMLIFrameElement {
  // só existe um iframe de preview de cada vez
  return document.querySelector<HTMLIFrameElement>("iframe[title^='Preview']")!;
}

function getPreviewSrcDoc(): string {
  const f = getPreviewIframe();
  return f?.getAttribute("srcdoc") ?? "";
}

describe("PrintConfigPanel — fluxo de configuração via banco", () => {
  it("carrega config do banco no mount (syncPrintConfigFromDb)", async () => {
    render(<PrintConfigPanel />);
    await waitFor(() => expect(syncMock).toHaveBeenCalledTimes(1));
    // header do banco deve aparecer no input
    await waitFor(() => {
      const input = screen.getByLabelText(/cabeçalho do talão/i) as HTMLInputElement;
      expect(input.value).toBe("TESTE PLANO B");
    });
  });

  it("'Sincronizar' chama syncPrintConfigFromDb novamente", async () => {
    render(<PrintConfigPanel />);
    await waitFor(() => expect(syncMock).toHaveBeenCalled());
    syncMock.mockClear();
    syncMock.mockResolvedValue(baseCfg);

    fireEvent.click(screen.getByRole("button", { name: /sincronizar/i }));
    await waitFor(() => expect(syncMock).toHaveBeenCalledTimes(1));
  });

  it("alterar largura dispara savePrintConfig (que vai pra RPC admin_save_print_config)", async () => {
    render(<PrintConfigPanel />);
    await waitFor(() => expect(syncMock).toHaveBeenCalled());

    // clica no botão 58mm
    fireEvent.click(screen.getByRole("button", { name: "58mm" }));
    await waitFor(() => expect(saveMock).toHaveBeenCalled());
    const lastCall = saveMock.mock.calls.at(-1)?.[0];
    expect(lastCall?.paperWidth).toBe("58mm");
  });
});

describe("PrintConfigPanel — previews refletem service_type", () => {
  it("preview de delivery NÃO mostra MESA nem GARCOM e mostra endereço/telefone", async () => {
    render(<PrintConfigPanel />);
    await waitFor(() => expect(syncMock).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("tab", { name: /delivery/i }));
    await waitFor(() => {
      const html = getPreviewSrcDoc();
      expect(html).toContain("Maria Souza");
    });
    const html = getPreviewSrcDoc();
    expect(html).toContain("DELIVERY");
    expect(html).not.toMatch(/<span class="info-label">Mesa:/i);
    expect(html).not.toMatch(/<span class="info-label">Garcom:/i);
    expect(html).toContain("Centro"); // bairro
  });

  it("preview de retirada NÃO mostra MESA", async () => {
    render(<PrintConfigPanel />);
    await waitFor(() => expect(syncMock).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("tab", { name: /retirada/i }));
    await waitFor(() => {
      const html = getPreviewSrcDoc();
      expect(html).toContain("João Pereira");
    });
    const html = getPreviewSrcDoc();
    expect(html).toMatch(/RETIRADA/i);
    expect(html).not.toMatch(/<span class="info-label">Mesa:/i);
  });

  it("preview de mesa MOSTRA mesa e garçom", async () => {
    render(<PrintConfigPanel />);
    await waitFor(() => expect(syncMock).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("tab", { name: /mesa/i }));
    await waitFor(() => {
      const html = getPreviewSrcDoc();
      expect(html).toContain("Mesa 5");
      expect(html).toContain("Carlos");
    });
  });
});

describe("PrintConfigPanel — visibleSections e textos refletem no preview", () => {
  it("ocultar rodapé remove footerText do preview", async () => {
    render(<PrintConfigPanel />);
    await waitFor(() => expect(syncMock).toHaveBeenCalled());

    // estado inicial: footer visível
    await waitFor(() => {
      expect(getPreviewSrcDoc()).toContain("Volte sempre!");
    });

    // toggle off
    fireEvent.click(screen.getByLabelText(/exibir rodapé/i));
    await waitFor(() => {
      expect(getPreviewSrcDoc()).not.toContain("Volte sempre!");
    });
  });

  it("alterar header (no blur) atualiza o preview", async () => {
    render(<PrintConfigPanel />);
    await waitFor(() => expect(syncMock).toHaveBeenCalled());

    const input = screen.getByLabelText(/cabeçalho do talão/i) as HTMLInputElement;
    fireEvent.change(input, { target: { value: "NOVO HEADER X" } });
    // preview já usa o estado local antes mesmo do blur
    await waitFor(() => {
      expect(getPreviewSrcDoc()).toContain("NOVO HEADER X");
    });

    // blur dispara persistência
    fireEvent.blur(input);
    await waitFor(() => {
      const lastCall = saveMock.mock.calls.at(-1)?.[0];
      expect(lastCall?.headerText).toBe("NOVO HEADER X");
    });
  });
});
