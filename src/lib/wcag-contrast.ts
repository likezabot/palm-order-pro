/**
 * Utilitários de contraste WCAG 2.1.
 *
 * Usados pelo MenuHero para amostrar a luminância média de uma foto de fundo
 * e calcular a opacidade mínima de overlay escuro necessária para garantir
 * que o texto branco fique pelo menos AA (≥ 4.5:1) sobre a composição.
 *
 * Referência: https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
 */

/** Luminância relativa de um canal sRGB normalizado [0..1]. */
function channelLuminance(c: number): number {
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/** Luminância relativa WCAG de uma cor sRGB (componentes 0..255). */
export function relativeLuminance(r: number, g: number, b: number): number {
  const R = channelLuminance(r / 255);
  const G = channelLuminance(g / 255);
  const B = channelLuminance(b / 255);
  return 0.2126 * R + 0.7152 * G + 0.0722 * B;
}

/** Razão de contraste WCAG entre duas luminâncias. */
export function contrastRatio(L1: number, L2: number): number {
  const a = Math.max(L1, L2);
  const b = Math.min(L1, L2);
  return (a + 0.05) / (b + 0.05);
}

/**
 * Compõe (alpha-blend) uma cor de overlay sobre uma cor base.
 * Retorna a luminância resultante.
 */
export function composedLuminance(
  baseRGB: [number, number, number],
  overlayRGB: [number, number, number],
  overlayAlpha: number,
): number {
  const [br, bg, bb] = baseRGB;
  const [or, og, ob] = overlayRGB;
  const a = Math.max(0, Math.min(1, overlayAlpha));
  const r = or * a + br * (1 - a);
  const g = og * a + bg * (1 - a);
  const b = ob * a + bb * (1 - a);
  return relativeLuminance(r, g, b);
}

/**
 * Amostra a luminância média de uma imagem (downscale 16x16 em offscreen canvas).
 * Tolerante a falhas (CORS / load): retorna `null` quando não é possível ler os pixels.
 */
export async function sampleImageLuminance(
  url: string,
  signal?: AbortSignal,
): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") return resolve(null);
    const img = new Image();
    img.crossOrigin = "anonymous";
    let done = false;
    const finish = (v: number | null) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    signal?.addEventListener("abort", () => finish(null));
    img.onload = () => {
      try {
        const SIZE = 16;
        const canvas = document.createElement("canvas");
        canvas.width = SIZE;
        canvas.height = SIZE;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return finish(null);
        ctx.drawImage(img, 0, 0, SIZE, SIZE);
        const { data } = ctx.getImageData(0, 0, SIZE, SIZE);
        let sum = 0;
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
          sum += relativeLuminance(data[i], data[i + 1], data[i + 2]);
          n += 1;
        }
        finish(n > 0 ? sum / n : null);
      } catch {
        // CORS bloqueado — falha silenciosa; o overlay padrão (forte) é usado.
        finish(null);
      }
    };
    img.onerror = () => finish(null);
    img.src = url;
  });
}

/**
 * Dada a luminância média do fundo, calcula a menor opacidade de overlay
 * preto necessária para que texto branco atinja a razão de contraste alvo
 * (4.5 = AA texto pequeno, 7.0 = AAA).
 *
 * Faz busca binária entre [minAlpha..1.0]. Retorna no máximo 1.0 e no mínimo
 * `minAlpha` para preservar o mood gastronômico mesmo em fotos escuras.
 */
export function overlayAlphaForWhiteText(
  backgroundLuminance: number,
  targetRatio = 4.5,
  minAlpha = 0.25,
  maxAlpha = 0.85,
): number {
  // Texto branco tem luminância 1.0
  const whiteL = 1.0;
  // Aproxima fundo como cinza com a luminância dada (suficiente para overlay preto)
  const grayChannel = inverseLuminance(backgroundLuminance);
  const baseRGB: [number, number, number] = [grayChannel, grayChannel, grayChannel];
  const overlayRGB: [number, number, number] = [0, 0, 0];

  // Verifica se já passa sem overlay extra
  const currentL = relativeLuminance(grayChannel, grayChannel, grayChannel);
  if (contrastRatio(whiteL, currentL) >= targetRatio) return minAlpha;

  // Verifica se nem o teto consegue atingir o alvo → devolve o teto
  // (e quem chamar pode logar warn). Isso evita que a busca binária
  // retorne um valor intermediário enganoso quando nenhuma α passa.
  const ceilingL = composedLuminance(baseRGB, overlayRGB, maxAlpha);
  if (contrastRatio(whiteL, ceilingL) < targetRatio) return maxAlpha;

  // Busca binária com margem de segurança (0.15) para compensar
  // aproximação cinza-equivalente ↔ cor real e flutuação de pixels da foto.
  const safeTarget = targetRatio + 0.15;
  let lo = minAlpha;
  let hi = maxAlpha;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    const L = composedLuminance(baseRGB, overlayRGB, mid);
    const ratio = contrastRatio(whiteL, L);
    if (ratio >= safeTarget) hi = mid;
    else lo = mid;
  }
  return Math.min(maxAlpha, Math.max(minAlpha, hi));
}

/** Inverte aproximadamente a fórmula de luminância para um canal cinza 0..255. */
function inverseLuminance(L: number): number {
  // L = f(c/255) onde f é a curva sRGB. Resolvemos para c.
  // Branqueia o caso degenerado.
  const target = Math.max(0, Math.min(1, L));
  // f^-1
  const linear =
    target <= 0.0031308 ? target * 12.92 : 1.055 * Math.pow(target, 1 / 2.4) - 0.055;
  return Math.round(Math.max(0, Math.min(1, linear)) * 255);
}
