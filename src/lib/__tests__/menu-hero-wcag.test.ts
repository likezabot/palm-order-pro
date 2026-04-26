/**
 * WCAG AA contract test for MenuHero overlay algorithm.
 *
 * Garante que `overlayAlphaForWhiteText` produz uma opacidade que mantém
 * texto branco em ≥ 4.5:1 (AA) sobre uma lista representativa de fundos —
 * incluindo casos extremos (foto quase branca, brasa amarela brilhante,
 * cinza médio).
 *
 * Falha o CI se qualquer cenário cair abaixo de AA, exceto casos
 * comprovadamente impossíveis dentro do teto α=0.85 (que reservamos para
 * preservar o mood gastronômico da foto).
 */
import { describe, it, expect } from "vitest";
import {
  contrastRatio,
  composedLuminance,
  overlayAlphaForWhiteText,
  relativeLuminance,
} from "@/lib/wcag-contrast";

const WHITE_L = 1.0; // luminância do texto branco
const TARGET_AA = 4.5;
const MIN_ALPHA = 0.3;
const MAX_ALPHA = 0.85;

/**
 * Fotos de exemplo descritas pela cor RGB dominante (média).
 * O MenuHero amostra essa cor via canvas em produção; no teste usamos
 * direto para reprodutibilidade total (sem rede / sem canvas).
 */
const SAMPLE_PHOTOS: Array<{
  name: string;
  rgb: [number, number, number];
  /** Caso documentadamente impossível (foto pura branca, etc.) */
  expectFailAt: "AA" | null;
}> = [
  { name: "brasa escura", rgb: [40, 25, 15], expectFailAt: null },
  { name: "carne grelhada média", rgb: [110, 70, 50], expectFailAt: null },
  { name: "tábua de madeira", rgb: [150, 110, 75], expectFailAt: null },
  { name: "fundo neutro cinza", rgb: [128, 128, 128], expectFailAt: null },
  { name: "prato claro com salada", rgb: [190, 195, 170], expectFailAt: null },
  { name: "céu pastel suave", rgb: [220, 225, 235], expectFailAt: null },
  // Caso extremo — papel quase puro branco. Com α=MAX (0.85) o algoritmo
  // ainda atinge AA, mas valida que o teto é realmente acionado.
  { name: "papel branco (extremo)", rgb: [250, 250, 250], expectFailAt: null },
  // Caso extremo oposto — foto preta já passa folgado sem overlay.
  { name: "preto", rgb: [10, 10, 10], expectFailAt: null },
];

describe("MenuHero overlay — contrato WCAG AA", () => {
  for (const photo of SAMPLE_PHOTOS) {
    it(`mantém ≥ AA sobre "${photo.name}"`, () => {
      const [r, g, b] = photo.rgb;
      const bgL = relativeLuminance(r, g, b);
      const alpha = overlayAlphaForWhiteText(bgL, TARGET_AA, MIN_ALPHA, MAX_ALPHA);

      // alpha sempre dentro dos limites operacionais
      expect(alpha).toBeGreaterThanOrEqual(MIN_ALPHA);
      expect(alpha).toBeLessThanOrEqual(MAX_ALPHA);

      // Composição real: foto + overlay preto com α calculado
      const composedL = composedLuminance([r, g, b], [0, 0, 0], alpha);
      const ratio = contrastRatio(WHITE_L, composedL);

      if (photo.expectFailAt === "AA") {
        // Documentado: nem com overlay máximo passa — usamos como sentinela
        // para garantir que o algoritmo realmente atinge o teto.
        expect(alpha).toBeCloseTo(MAX_ALPHA, 5);
        // E garantimos que o ratio fica próximo de AA (≥ ~3.5:1) — texto
        // grande/bold ainda legível, mas justifica trocar a foto.
        expect(ratio).toBeGreaterThan(3.0);
      } else {
        expect(
          ratio,
          `Foto "${photo.name}" → ratio ${ratio.toFixed(2)} (esperado ≥ ${TARGET_AA})`,
        ).toBeGreaterThanOrEqual(TARGET_AA);
      }
    });
  }

  it("usa α = MIN quando o fundo já é escuro o suficiente", () => {
    const dark = relativeLuminance(15, 15, 15);
    const alpha = overlayAlphaForWhiteText(dark, TARGET_AA, MIN_ALPHA, MAX_ALPHA);
    expect(alpha).toBeCloseTo(MIN_ALPHA, 5);
  });

  it("nunca devolve NaN/Infinity, mesmo em entradas degeneradas", () => {
    for (const L of [0, 0.0001, 0.5, 0.9999, 1]) {
      const a = overlayAlphaForWhiteText(L, TARGET_AA, MIN_ALPHA, MAX_ALPHA);
      expect(Number.isFinite(a)).toBe(true);
    }
  });
});
