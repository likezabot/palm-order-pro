import { describe, it, expect } from "vitest";
import { createReceiptLayoutModel } from "@/lib/receipt-layout";
import { DEFAULT_CONFIG } from "@/lib/print-config";

describe("receipt-layout — cupom SENHA estilo recibo de caixa", () => {
  const items = [
    { product_name: "COCA COLA ZERO 500ML", quantity: 2, product_price: 10 },
    { product_name: "STROGONOFF CARNE", quantity: 1, product_price: 40 },
    { product_name: "STROGONOFF CAMARAO", quantity: 1, product_price: 45 },
  ];

  it("monta blocos esperados em ordem para SENHA", () => {
    const { blocks } = createReceiptLayoutModel(
      {
        docType: "SENHA",
        senha: "#146",
        items,
        total: 105,
        waiterName: "Carlos",
        orderId: "aaaaaaaa-bbbb-cccc-dddd-1234ef114162",
      },
      DEFAULT_CONFIG,
    );

    const kinds = blocks.map((b) => b.kind);
    expect(kinds[0]).toBe("senhaTitle");
    expect(kinds).toContain("itemTableHeader");
    expect(kinds).toContain("itemTableRow");
    expect(kinds).toContain("itemTableTotal");
    expect(kinds[kinds.length - 1]).toBe("cutMark");
  });

  it("senhaTitle remove o # do número", () => {
    const { blocks } = createReceiptLayoutModel(
      { docType: "SENHA", senha: "#146", items, total: 105 },
      DEFAULT_CONFIG,
    );
    const t = blocks.find((b) => b.kind === "senhaTitle");
    expect(t && t.kind === "senhaTitle" && t.text).toBe("SENHA: 146");
  });

  it("inclui linhas Vendedor / Caixa / Cliente", () => {
    const { blocks } = createReceiptLayoutModel(
      {
        docType: "SENHA",
        senha: "#1",
        items,
        total: 105,
        waiterName: "Carlos",
      },
      DEFAULT_CONFIG,
    );
    const infos = blocks.filter((b) => b.kind === "info") as any[];
    const labels = infos.map((i) => i.label);
    expect(labels).toContain("Vendedor");
    expect(labels).toContain("Caixa");
    expect(labels).toContain("Cliente");
    const cliente = infos.find((i) => i.label === "Cliente");
    expect(cliente.value).toBe("CONSUMIDOR FINAL");
  });

  it("Venda usa últimos 6 caracteres hex do orderId", () => {
    const { blocks } = createReceiptLayoutModel(
      {
        docType: "SENHA",
        senha: "#1",
        items,
        total: 105,
        orderId: "aaaaaaaa-bbbb-cccc-dddd-1234ef114162",
      },
      DEFAULT_CONFIG,
    );
    const venda = (blocks.filter((b) => b.kind === "info") as any[]).find(
      (i) => i.label === "Venda",
    );
    expect(venda.value).toBe("114162");
  });

  it("itemTableRow contém preço unit e subtotal", () => {
    const { blocks } = createReceiptLayoutModel(
      { docType: "SENHA", senha: "#1", items, total: 105 },
      DEFAULT_CONFIG,
    );
    const rows = blocks.filter((b) => b.kind === "itemTableRow") as any[];
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      quantity: 2,
      name: "COCA COLA ZERO 500ML",
      unit: 10,
      subtotal: 20,
    });
  });

  it("itemTableTotal recebe valor formatado em R$", () => {
    const { blocks } = createReceiptLayoutModel(
      { docType: "SENHA", senha: "#1", items, total: 105 },
      DEFAULT_CONFIG,
    );
    const t = blocks.find((b) => b.kind === "itemTableTotal") as any;
    expect(t.value).toBe("R$ 105.00");
  });
});
