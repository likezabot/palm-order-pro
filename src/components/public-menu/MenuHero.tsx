import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { type Restaurant } from "@/lib/public-menu";
import { cn } from "@/lib/utils";
import {
  contrastRatio,
  overlayAlphaForWhiteText,
  sampleImageLuminance,
} from "@/lib/wcag-contrast";
import {
  getCachedOverlayAlpha,
  setCachedOverlayAlpha,
} from "@/lib/hero-overlay-cache";

type Props = {
  restaurant: Restaurant;
  rightSlot?: React.ReactNode;
  title?: string | null;
  subtitle?: string | null;
  alignment?: "left" | "center";
  showLogo?: boolean;
  showOverlay?: boolean;
};

/**
 * Hero do cardápio público.
 *
 * Acessibilidade / contraste:
 * - Quando há foto de fundo, aplicamos uma pilha de overlays:
 *   1) tom de marca leve (mood gastronômico)
 *   2) escurecimento base (~55% no centro, mais forte embaixo)
 *   3) vinheta sutil nas bordas
 *   Isso garante que o título branco tenha contraste WCAG AA (≥ 4.5:1)
 *   sobre praticamente qualquer foto, clara ou escura.
 * - O título usa text-shadow para reforçar legibilidade quando a foto
 *   tem áreas brilhantes localizadas (ex.: fogo, brasa).
 * - Sem foto, caímos num gradiente de marca (foreground escuro nativo
 *   da paleta pública), também de alto contraste.
 */
export default function MenuHero({
  restaurant,
  rightSlot,
  title,
  subtitle,
  alignment = "center",
  showLogo = true,
  showOverlay = true,
}: Props) {
  const prep = restaurant.default_prep_minutes ?? 0;
  const deliveryTotal = prep + ((restaurant as any).delivery_prep_buffer ?? 0);
  const displayTitle = title?.trim() || restaurant.name;
  const displaySub = subtitle?.trim() || restaurant.description || "";
  const isCenter = alignment === "center";
  const hasHero = !!restaurant.hero_url;

  // --- Overlay adaptativo WCAG ---
  // 1) Lemos cache síncrono (localStorage) no init → evita "flash" e poupa
  //    rede em internet instável.
  // 2) Se não houver cache, amostramos a foto, calculamos α e gravamos.
  // 3) Default 0.55 (forte) só aparece quando não há hero ou cache nem
  //    amostragem responderam ainda.
  const [overlayAlpha, setOverlayAlpha] = useState<number>(() => {
    if (!hasHero) return 0.55;
    const cached = getCachedOverlayAlpha(restaurant.hero_url!);
    return cached ?? 0.55;
  });

  useEffect(() => {
    if (!hasHero) return;
    const url = restaurant.hero_url!;

    // Cache hit → nada a fazer (já aplicado no init).
    if (getCachedOverlayAlpha(url) != null) return;

    const ctrl = new AbortController();
    sampleImageLuminance(url, ctrl.signal).then((L) => {
      if (L == null) return; // CORS/erro: mantém default forte
      // alvo AA = 4.5:1; min 0.30 p/ preservar mood; max 0.85
      const alpha = overlayAlphaForWhiteText(L, 4.5, 0.3, 0.85);
      setOverlayAlpha(alpha);
      setCachedOverlayAlpha(url, alpha);

      // Verificação automática de acessibilidade (apenas em dev)
      if (import.meta.env.DEV) {
        const composedL = Math.max(0, L * (1 - alpha));
        const ratio = contrastRatio(1.0, composedL);
        const grade = ratio >= 7 ? "AAA" : ratio >= 4.5 ? "AA" : "FAIL";
        // eslint-disable-next-line no-console
        console.info(
          `[MenuHero/WCAG] bgLuminance=${L.toFixed(3)} α=${alpha.toFixed(2)} ratio=${ratio.toFixed(2)} → ${grade}`,
        );
        if (grade === "FAIL") {
          // eslint-disable-next-line no-console
          console.warn(
            "[MenuHero/WCAG] Contraste abaixo de AA mesmo com overlay máximo — considere trocar a foto.",
          );
        }
      }
    });
    return () => ctrl.abort();
  }, [hasHero, restaurant.hero_url]);

  // Sombra densa de texto = legibilidade adicional sobre fotos com brilho local.
  const titleShadow = hasHero
    ? { textShadow: "0 2px 12px rgba(0,0,0,0.55), 0 1px 2px rgba(0,0,0,0.45)" }
    : undefined;
  const subShadow = hasHero
    ? { textShadow: "0 1px 6px rgba(0,0,0,0.55)" }
    : undefined;

  return (
    <header className="relative">
      {/* Container do hero com altura generosa para destaque visual */}
      <div className="relative h-56 w-full overflow-hidden sm:h-72">
        {/* Camada 1 — imagem ou gradiente de marca */}
        <div
          className={cn(
            "absolute inset-0",
            !hasHero && "bg-gradient-to-br from-primary via-accent/40 to-primary/70",
          )}
          style={
            hasHero
              ? {
                  backgroundImage: `url(${restaurant.hero_url})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : undefined
          }
          aria-hidden
        />

        {/* Camada 2 — escurecimento adaptativo (garante WCAG AA p/ texto branco) */}
        {hasHero && showOverlay && (
          <>
            {/* tom quente sutil (mood gastronômico) */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "linear-gradient(135deg, hsl(14 78% 35% / 0.25) 0%, transparent 50%, hsl(15 26% 10% / 0.35) 100%)",
              }}
              aria-hidden
            />
            {/* escurecimento base p/ contraste de texto — α dinâmico WCAG AA */}
            <div
              className="pointer-events-none absolute inset-0 transition-opacity duration-500"
              style={{
                background: `linear-gradient(to bottom, rgba(0,0,0,${(overlayAlpha * 0.85).toFixed(3)}) 0%, rgba(0,0,0,${(overlayAlpha * 0.65).toFixed(3)}) 40%, rgba(0,0,0,${Math.min(0.95, overlayAlpha * 1.15).toFixed(3)}) 100%)`,
              }}
              aria-hidden
            />
            {/* vinheta */}
            <div
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  "radial-gradient(ellipse at center, transparent 55%, rgba(0,0,0,0.35) 100%)",
              }}
              aria-hidden
            />
          </>
        )}

        {/* Camada 3 — fade orgânico que une o hero ao conteúdo */}
        <div
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-background via-background/70 to-transparent"
          aria-hidden
        />

        {/* Conteúdo sobre o hero — título + subtítulo flutuando */}
        <div className="relative z-10 mx-auto flex h-full max-w-3xl items-end px-4 pb-16">
          <div className={cn("min-w-0 flex-1", isCenter && "text-center")}>
            <h1
              className="truncate text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl"
              style={titleShadow}
            >
              {displayTitle}
            </h1>
            {displaySub && (
              <p
                className="mt-1 line-clamp-1 text-sm font-medium text-white/95 sm:text-base"
                style={subShadow}
              >
                {displaySub}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Faixa de identidade — logo + info-chips, integrada ao conteúdo */}
      <div className="mx-auto max-w-3xl px-4">
        <div
          className={cn(
            "-mt-10 flex items-center gap-3",
            isCenter && "sm:justify-center sm:text-center",
          )}
        >
          {showLogo && (
            <div
              className={cn(
                "relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-card sm:h-24 sm:w-24",
                "ring-4 ring-background",
              )}
              style={{
                boxShadow:
                  "0 10px 30px -10px hsl(var(--primary) / 0.45), 0 4px 12px rgba(0,0,0,0.15)",
              }}
            >
              {restaurant.logo_url ? (
                <img
                  src={restaurant.logo_url}
                  alt={`Logo de ${restaurant.name}`}
                  className="h-full w-full object-cover"
                  loading="eager"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-primary to-primary/70 text-2xl font-black text-primary-foreground">
                  {restaurant.name.charAt(0)}
                </div>
              )}
            </div>
          )}

          {/* Slot direito (ex.: badge "aberto") em layout left */}
          {rightSlot && !isCenter && (
            <div className="ml-auto shrink-0 self-end pb-1">{rightSlot}</div>
          )}
        </div>

        {/* Linha de informações — sempre logo abaixo do logo, com bom contraste */}
        {(prep > 0 || rightSlot) && (
          <div
            className={cn(
              "mt-3 flex flex-wrap items-center gap-2 text-xs",
              isCenter && "sm:justify-center",
            )}
          >
            {prep > 0 && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 font-medium text-foreground/80">
                <Clock size={12} aria-hidden /> ~{prep} min
              </span>
            )}
            {deliveryTotal > prep && (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 font-medium text-foreground/80">
                <Clock size={12} aria-hidden /> entrega ~{deliveryTotal} min
              </span>
            )}
            {rightSlot && isCenter && <div>{rightSlot}</div>}
          </div>
        )}
      </div>
    </header>
  );
}
