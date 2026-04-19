import { describe, it, expect, beforeEach } from "vitest";
import {
  applyPreset,
  getFontSizes,
  loadPrintConfig,
  DEFAULT_CONFIG,
} from "@/lib/print-config";

describe("print-config — fluxo crítico configuração de impressão", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("loadPrintConfig retorna defaults quando localStorage vazio", () => {
    const cfg = loadPrintConfig();
    expect(cfg.paperWidth).toBe(DEFAULT_CONFIG.paperWidth);
    expect(cfg.headerText).toBe("PLANO B ESPETARIA");
    expect(cfg.visibleSections.title).toBe(true);
  });

  it("loadPrintConfig faz merge com defaults quando localStorage tem parcial", () => {
    localStorage.setItem(
      "print_config",
      JSON.stringify({ headerText: "OUTRO", visibleSections: { title: false } }),
    );
    const cfg = loadPrintConfig();
    expect(cfg.headerText).toBe("OUTRO");
    expect(cfg.visibleSections.title).toBe(false);
    // demais seções preservam default
    expect(cfg.visibleSections.waiter).toBe(true);
  });

  it("loadPrintConfig é resiliente a JSON corrompido", () => {
    localStorage.setItem("print_config", "{lixo");
    expect(() => loadPrintConfig()).not.toThrow();
    expect(loadPrintConfig().headerText).toBe(DEFAULT_CONFIG.headerText);
  });

  it("applyPreset mesa_simples oculta garçom/data/footer", () => {
    const cfg = applyPreset("mesa_simples", DEFAULT_CONFIG);
    expect(cfg.visibleSections.waiter).toBe(false);
    expect(cfg.visibleSections.date).toBe(false);
    expect(cfg.visibleSections.footer).toBe(false);
    expect(cfg.visibleSections.title).toBe(true);
  });

  it("getFontSizes aplica overrides do editor visual", () => {
    const cfg = { ...DEFAULT_CONFIG, fontSizes: { title: 99, items: 22, total: 30, notes: 14 } };
    const sizes = getFontSizes(cfg);
    expect(sizes.title).toBe(99);
    expect(sizes.base).toBe(22); // items
    expect(sizes.total).toBe(30);
    expect(sizes.note).toBe(14);
  });

  it("getFontSizes('grande') usa preset sem overrides", () => {
    const sizes = getFontSizes("grande");
    expect(sizes.title).toBe(20);
    expect(sizes.base).toBe(15);
  });
});
