import { describe, it, expect } from "vitest";
import { createReceiptLayoutModel } from "@/lib/receipt-layout";
import {
  buildEscPosReceipt,
  buildEscPosBill,
  buildEscPosDelta,
  buildEscPosDelivery,
  type DeliveryPayloadInput,
} from "@/lib/thermal-printer";
import { DEFAULT_CONFIG, type PrintConfig } from "@/lib/print-config";

/**
 * Decoder ESC/POS textual: extrai apenas os bytes ASCII imprimíveis e quebras de linha,
 * descartando comandos (ESC=27 + 1-3 bytes, GS=29 + 1-3 bytes).
 */
function decodeEscPosText(payload: Uint8Array): string {
  let out = "";
  let i = 0;
  while (i < payload.length) {
    const b = payload[i];
    if (b === 27) {
      // ESC + 1 byte de cmd + 1-2 bytes de arg (variável). Pulamos 3 no geral.
      const cmd = payload[i + 1];
      // ESC ! n -> 3 bytes; ESC E n -> 3 bytes; ESC a n -> 3 bytes; ESC @ -> 2 bytes
      if (cmd === 64) {
        i += 2;
      } else {
        i += 3;
      }
      continue;
    }
    if (b === 29) {
      // GS V m -> 3; GS L nL nH -> 4; assumimos 3
      const cmd = payload[i + 1];
      if (cmd === 86) i += 4;
      else if (cmd === 76) i += 4;
      else i += 3;
      continue;
    }
    if (b === 10) {
      out += "\n";
    } else if (b >= 0x20 && b <= 0x7e) {
      out += String.fromCharCode(b);
    }
    i++;
  }
  return out;
}

const sampleItems = [
  { product_name: "Espeto Picanha", quantity: 2, product_price: 15 },
  { product_name: "Refrigerante", quantity: 1, product_price: 8 },
];

describe("Admin template REFLETE no payload ESC/POS real", () => {
  it("headerText configurado no Admin aparece no ESC/POS (mesa)", () => {
    const cfg: PrintConfig = { ...DEFAULT_CONFIG, headerText: "RESTAURANTE TESTE 123" };
    const payload = buildEscPosReceipt("Mesa 1", "Ana", sampleItems, 38, cfg);
    expect(decodeEscPosText(payload)).toContain("RESTAURANTE TESTE 123");
  });

  it("footerText configurado no Admin aparece no ESC/POS (mesa)", () => {
    const cfg: PrintConfig = { ...DEFAULT_CONFIG, footerText: "Volte sempre amigo!" };
    const payload = buildEscPosReceipt("Mesa 1", "Ana", sampleItems, 38, cfg);
    expect(decodeEscPosText(payload)).toContain("Volte sempre amigo!");
  });

  it("visibleSections.footer=false REMOVE rodapé do ESC/POS", () => {
    const cfg: PrintConfig = {
      ...DEFAULT_CONFIG,
      footerText: "RODAPE SECRETO",
      visibleSections: { ...DEFAULT_CONFIG.visibleSections, footer: false },
    };
    const payload = buildEscPosReceipt("Mesa 1", "Ana", sampleItems, 38, cfg);
    expect(decodeEscPosText(payload)).not.toContain("RODAPE SECRETO");
  });

  it("visibleSections.waiter=false REMOVE garçom do ESC/POS", () => {
    const cfg: PrintConfig = {
      ...DEFAULT_CONFIG,
      visibleSections: { ...DEFAULT_CONFIG.visibleSections, waiter: false },
    };
    const payload = buildEscPosReceipt("Mesa 1", "Ana Maria", sampleItems, 38, cfg);
    const text = decodeEscPosText(payload);
    expect(text).not.toContain("Ana Maria");
    expect(text.toUpperCase()).not.toContain("GARCOM");
  });

  it("visibleSections.title=false REMOVE cabeçalho do ESC/POS", () => {
    const cfg: PrintConfig = {
      ...DEFAULT_CONFIG,
      headerText: "PLANO B HEADER",
      visibleSections: { ...DEFAULT_CONFIG.visibleSections, title: false },
    };
    const payload = buildEscPosReceipt("Mesa 1", "Ana", sampleItems, 38, cfg);
    expect(decodeEscPosText(payload)).not.toContain("PLANO B HEADER");
  });

  it("paperWidth 58mm gera linhas mais curtas que 80mm (separadores)", () => {
    const cfg58: PrintConfig = { ...DEFAULT_CONFIG, paperWidth: "58mm" };
    const cfg80: PrintConfig = { ...DEFAULT_CONFIG, paperWidth: "80mm" };
    const t58 = decodeEscPosText(buildEscPosReceipt("Mesa 1", "Ana", sampleItems, 38, cfg58));
    const t80 = decodeEscPosText(buildEscPosReceipt("Mesa 1", "Ana", sampleItems, 38, cfg80));
    // Encontra a linha mais longa de cada um
    const longest = (s: string) => s.split("\n").reduce((m, l) => Math.max(m, l.length), 0);
    expect(longest(t58)).toBeLessThan(longest(t80));
  });

  it("Admin reflete em CONTA (printBill)", () => {
    const cfg: PrintConfig = { ...DEFAULT_CONFIG, headerText: "BAR XYZ", footerText: "Tchau!" };
    const text = decodeEscPosText(buildEscPosBill("Mesa 2", "Bia", sampleItems, 38, cfg));
    expect(text).toContain("BAR XYZ");
    expect(text).toContain("Tchau!");
  });

  it("Admin reflete em ACRESCIMO (printDelta)", () => {
    const cfg: PrintConfig = { ...DEFAULT_CONFIG, headerText: "BAR XYZ", footerText: "Tchau!" };
    const text = decodeEscPosText(buildEscPosDelta("Mesa 2", "Bia", sampleItems, cfg));
    expect(text).toContain("BAR XYZ");
    expect(text).toContain("Tchau!");
  });

  it("Admin reflete em DELIVERY", () => {
    const cfg: PrintConfig = { ...DEFAULT_CONFIG, headerText: "DELIVERY HEADER" };
    const input: DeliveryPayloadInput = {
      items: sampleItems,
      customerName: "Joao",
      customerPhone: "67999999999",
      deliveryAddress: { street: "Rua A", number: "123", neighborhood: "Centro" },
      deliveryFee: 5,
      total: 43,
      paymentMethod: "pix",
    };
    const text = decodeEscPosText(buildEscPosDelivery(input, cfg));
    expect(text).toContain("DELIVERY HEADER");
    expect(text).toContain("DELIVERY"); // banner
    expect(text).toContain("Joao");
  });

  it("Admin reflete em SENHA via createReceiptLayoutModel", () => {
    const cfg: PrintConfig = { ...DEFAULT_CONFIG, headerText: "SENHA HEADER" };
    const { blocks } = createReceiptLayoutModel(
      { docType: "SENHA", senha: "042", items: sampleItems },
      cfg,
    );
    const titleBlock = blocks.find((b) => b.kind === "title");
    expect(titleBlock).toBeDefined();
    expect((titleBlock as any).text).toBe("SENHA HEADER");
  });
});

describe("Eliminação de N/A — paths legados", () => {
  it("waiterName='N/A' NÃO é impresso (omitido como vazio)", () => {
    const text = decodeEscPosText(
      buildEscPosReceipt("Mesa 1", "N/A", sampleItems, 38, DEFAULT_CONFIG),
    );
    expect(text).not.toContain("N/A");
    expect(text.toUpperCase()).not.toMatch(/GARCOM:\s*N\/A/);
  });

  it("waiterName vazio NÃO imprime linha de Garcom", () => {
    const text = decodeEscPosText(
      buildEscPosReceipt("Mesa 1", "", sampleItems, 38, DEFAULT_CONFIG),
    );
    expect(text.toUpperCase()).not.toContain("GARCOM:");
  });

  it("waiterName='---' NÃO imprime linha de Garcom", () => {
    const text = decodeEscPosText(
      buildEscPosReceipt("Mesa 1", "---", sampleItems, 38, DEFAULT_CONFIG),
    );
    expect(text.toUpperCase()).not.toMatch(/GARCOM:\s*---/);
    expect(text.toUpperCase()).not.toContain("GARCOM:");
  });

  it("waiterName válido APARECE normalmente", () => {
    const text = decodeEscPosText(
      buildEscPosReceipt("Mesa 1", "Carlos Silva", sampleItems, 38, DEFAULT_CONFIG),
    );
    expect(text).toContain("Carlos Silva");
  });
});

describe("Pickup / Balcão — sem MESA, sem GARCOM N/A", () => {
  it("pickup imprime banner RETIRADA e não imprime 'Mesa:'", () => {
    const text = decodeEscPosText(
      buildEscPosReceipt("Pedido #42", "", sampleItems, 38, DEFAULT_CONFIG, {
        serviceType: "pickup",
        customerName: "Maria",
        customerPhone: "67988887777",
      }),
    );
    expect(text.toUpperCase()).toContain("RETIRADA");
    expect(text.toUpperCase()).not.toMatch(/^MESA:/m);
    expect(text).not.toContain("N/A");
    expect(text).toContain("Maria");
    expect(text).toContain("67988887777");
  });

  it("pickup sem customerName não imprime linha vazia de Cliente", () => {
    const text = decodeEscPosText(
      buildEscPosReceipt("Pedido #42", "", sampleItems, 38, DEFAULT_CONFIG, {
        serviceType: "pickup",
      }),
    );
    expect(text.toUpperCase()).toContain("RETIRADA");
    // Sem cliente, a linha "Cliente:" não deve aparecer
    expect(text.match(/Cliente:/i)).toBeNull();
  });

  it("dine_in (sem serviceType) continua imprimindo Mesa normalmente", () => {
    const text = decodeEscPosText(
      buildEscPosReceipt("Mesa 5", "Ana", sampleItems, 38, DEFAULT_CONFIG),
    );
    expect(text).toContain("Mesa");
    expect(text).toContain("Ana");
  });
});

describe("Cálculo do total no DELIVERY", () => {
  it("subtotal + taxa - desconto = total impresso", () => {
    const input: DeliveryPayloadInput = {
      items: sampleItems, // 2*15 + 1*8 = 38
      deliveryFee: 5,
      discount: 3,
      paymentMethod: "pix",
      // total não passado — deve ser computado: 38 + 5 - 3 = 40
    };
    const text = decodeEscPosText(buildEscPosDelivery(input, DEFAULT_CONFIG));
    expect(text).toContain("SUBTOTAL");
    expect(text).toContain("TAXA ENTREGA");
    expect(text).toContain("DESCONTO");
    expect(text).toContain("TOTAL");
    expect(text).toContain("40,00");
  });

  it("delivery sem taxa não imprime linha TAXA ENTREGA", () => {
    const input: DeliveryPayloadInput = {
      items: sampleItems,
      deliveryFee: 0,
      paymentMethod: "pix",
    };
    const text = decodeEscPosText(buildEscPosDelivery(input, DEFAULT_CONFIG));
    expect(text).not.toContain("TAXA ENTREGA");
  });

  it("delivery sem dados imprime NAO INFORMADO em vez de N/A", () => {
    const input: DeliveryPayloadInput = {
      items: sampleItems,
      paymentMethod: null,
    };
    const text = decodeEscPosText(buildEscPosDelivery(input, DEFAULT_CONFIG));
    expect(text).toContain("NAO INFORMADO");
    expect(text).not.toContain("N/A");
  });
});
