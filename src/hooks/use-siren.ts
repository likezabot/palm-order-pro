import { useCallback, useEffect, useRef } from "react";

/**
 * Sirene forte para nova entrega online: 3 bipes alto-baixo, repetidos a cada 6s
 * enquanto `active` for true. Para automaticamente quando `active` vira false.
 *
 * Usa Web Audio. Se o navegador bloquear (autoplay policy), o usuário precisa
 * ter interagido com a página antes — comportamento padrão.
 */
export function useSiren(active: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<number | null>(null);

  const ensureCtx = useCallback(() => {
    if (!ctxRef.current) {
      try {
        const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
        ctxRef.current = new Ctor();
      } catch {
        return null;
      }
    }
    if (ctxRef.current?.state === "suspended") {
      ctxRef.current.resume().catch(() => {});
    }
    return ctxRef.current;
  }, []);

  const blast = useCallback(() => {
    const ctx = ensureCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    const beep = (start: number, freq: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(freq, now + start);
      // envelope para evitar click
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.35, now + start + 0.02);
      gain.gain.setValueAtTime(0.35, now + start + dur - 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.02);
    };

    // 3 ciclos alto-baixo (sirene)
    beep(0.0, 880, 0.28);
    beep(0.32, 540, 0.28);
    beep(0.64, 880, 0.28);
    beep(0.96, 540, 0.28);
    beep(1.28, 880, 0.28);
  }, [ensureCtx]);

  useEffect(() => {
    if (!active) {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    // Toca imediatamente e repete a cada 6 segundos
    blast();
    intervalRef.current = window.setInterval(() => {
      blast();
    }, 6000);
    return () => {
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [active, blast]);
}
