import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Sirene forte para nova entrega online: 3 bipes alto-baixo, repetidos a cada 6s
 * enquanto `active` for true. Para automaticamente quando `active` vira false.
 *
 * Retorna:
 *  - needsUnlock: true quando o navegador bloqueou o AudioContext (autoplay policy)
 *    e precisamos de um clique do usuário para liberar.
 *  - unlock(): chame em resposta a um clique para liberar o áudio.
 *  - mute(): silencia o ciclo atual até o próximo `active` virar true novamente
 *    (ex.: nova entrega chegando) — útil para “silenciar este alerta”.
 */
export function useSiren(active: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const intervalRef = useRef<number | null>(null);
  const mutedRef = useRef(false);
  const [needsUnlock, setNeedsUnlock] = useState(false);

  const ensureCtx = useCallback(() => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      try {
        const Ctor = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
        ctxRef.current = new Ctor();
      } catch {
        return null;
      }
    }
    return ctxRef.current;
  }, []);

  const blast = useCallback(() => {
    if (mutedRef.current) return;
    const ctx = ensureCtx();
    if (!ctx) return;

    // Se o contexto está suspenso (autoplay bloqueado), sinaliza pedido de unlock.
    if (ctx.state === "suspended") {
      setNeedsUnlock(true);
      ctx.resume().catch(() => {});
      return;
    }
    setNeedsUnlock(false);

    const now = ctx.currentTime;
    const beep = (start: number, freq: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "square";
      osc.frequency.setValueAtTime(freq, now + start);
      gain.gain.setValueAtTime(0.0001, now + start);
      gain.gain.exponentialRampToValueAtTime(0.35, now + start + 0.02);
      gain.gain.setValueAtTime(0.35, now + start + dur - 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now + start);
      osc.stop(now + start + dur + 0.02);
    };

    beep(0.0, 880, 0.28);
    beep(0.32, 540, 0.28);
    beep(0.64, 880, 0.28);
    beep(0.96, 540, 0.28);
    beep(1.28, 880, 0.28);
  }, [ensureCtx]);

  // Desbloqueia o AudioContext em resposta a um clique do usuário.
  const unlock = useCallback(async () => {
    const ctx = ensureCtx();
    if (!ctx) return;
    try {
      await ctx.resume();
    } catch {
      /* ignore */
    }
    // Bipe curto silencioso só para “destravar” na maioria dos navegadores.
    try {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      gain.gain.value = 0.0001;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.05);
    } catch {
      /* ignore */
    }
    setNeedsUnlock(ctx.state !== "running");
    if (ctx.state === "running" && active) {
      mutedRef.current = false;
      blast();
    }
  }, [active, blast, ensureCtx]);

  // Silencia o ciclo atual (até o próximo active=true após active=false).
  const mute = useCallback(() => {
    mutedRef.current = true;
    if (intervalRef.current !== null) {
      window.clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!active) {
      mutedRef.current = false; // reseta quando não há mais alertas
      if (intervalRef.current !== null) {
        window.clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    if (mutedRef.current) return;
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

  return { needsUnlock, unlock, mute };
}
