import { describe, it, expect } from "vitest";
import { createReceiptLayoutModel } from "@/lib/receipt-layout";
import { DEFAULT_CONFIG } from "@/lib/print-config";

const baseItems = [
  { product_name: "Espeto", quantity: 2, product_price: 10 },
  { product_name: "Cerveja", quantity: 1, product_price: 8, note: "gelada" },
];

describe("createReceiptLayoutModel — fluxo crítico impressão (fonte única)", () => {
  it("PEDIDO normal inclui título, mesa, itens, total e contagem", () => {
    const { blocks } = createReceiptLayoutModel(
      { docType: "PEDIDO", tableName: "Mesa 5", waiterName: "Ana", items: baseItems, total: 28 },
      DEFAULT_CONFIG,
    );
    const kinds = blocks.map((b) => b.kind);
    expect(kinds).toContain("title");
    expect(kinds).toContain("total");
    expect(kinds).toContain("qtyLine"); // só PEDIDO tem
    const total = blocks.find((b) => b.kind === "total");
    expect((total as any).value).toBe("R$ 28.00");
  });

  it("ACRESCIMO mostra banner *** ACRESCIMO *** e label SUBTOTAL", () => {
    const { blocks } = createReceiptLayoutModel(
      { docType: "ACRESCIMO", tableName: "Mesa 5", items: baseItems, total: 28 },
      DEFAULT_CONFIG,
    );
    expect(blocks.some((b) => b.kind === "banner" && (b as any).text.includes("ACRESCIMO"))).toBe(true);
    const total = blocks.find((b) => b.kind === "total");
    expect((total as any).label).toBe("SUBTOTAL");
    expect(blocks.some((b) => b.kind === "qtyLine")).toBe(false); // não tem em acréscimo
  });

  it("CONTA mostra banner *** CONTA *** e label TOTAL", () => {
    const { blocks } = createReceiptLayoutModel(
      { docType: "CONTA", tableName: "Mesa 5", items: baseItems, total: 28 },
      DEFAULT_CONFIG,
    );
    expect(blocks.some((b) => b.kind === "banner" && (b as any).text.includes("CONTA"))).toBe(true);
  });

  it("SENHA usa layout estilo recibo (senhaTitle + itemTable) e sem total/qtyLine", () => {
    const { blocks } = createReceiptLayoutModel(
      { docType: "SENHA", senha: "042", items: baseItems },
      DEFAULT_CONFIG,
    );
    expect(blocks[0].kind).toBe("senhaTitle");
    expect(blocks.some((b) => b.kind === "itemTableHeader")).toBe(true);
    expect(blocks.some((b) => b.kind === "itemTableRow")).toBe(true);
    expect(blocks.some((b) => b.kind === "total")).toBe(false);
    expect(blocks.some((b) => b.kind === "qtyLine")).toBe(false);
  });

  it("respeita visibleSections — oculta título/garçom/data/footer/notas", () => {
    const cfg = {
      ...DEFAULT_CONFIG,
      visibleSections: { title: false, waiter: false, date: false, notes: false, footer: false, showOrderNumber: true },
    };
    const { blocks } = createReceiptLayoutModel(
      { docType: "PEDIDO", tableName: "Mesa 5", waiterName: "Ana", items: baseItems, total: 28 },
      cfg,
    );
    expect(blocks.some((b) => b.kind === "title")).toBe(false);
    // footer do usuário oculto, mas fingerprints PRINT_ENGINE/APP_BUILD permanecem (sempre)
    expect(blocks.some((b) => b.kind === "footer" && (b as any).text === DEFAULT_CONFIG.footerText)).toBe(false);
    // mesa ainda aparece
    expect(blocks.some((b) => b.kind === "info" && (b as any).label === "Mesa")).toBe(true);
    // garçom não
    expect(blocks.some((b) => b.kind === "info" && (b as any).label === "Garcom")).toBe(false);
    // notas zeradas nos itens
    const items = blocks.filter((b) => b.kind === "item");
    items.forEach((it: any) => expect(it.note).toBeNull());
  });
});
