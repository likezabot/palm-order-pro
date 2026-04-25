import { useCallback, useEffect, useState } from "react";

const KEY = "pdv-seen-orders-v1";
const MAX = 500;

function load(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function persist(set: Set<string>) {
  try {
    const arr = Array.from(set).slice(-MAX);
    localStorage.setItem(KEY, JSON.stringify(arr));
  } catch {
    /* ignore */
  }
}

/**
 * Marca pedidos como "visualizados" no PDV (persistente em localStorage).
 * Usado para destacar entregas online novas até o operador clicar.
 */
export function useSeenOrders() {
  const [seen, setSeen] = useState<Set<string>>(() => load());

  const markSeen = useCallback((id: string) => {
    setSeen((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      persist(next);
      return next;
    });
  }, []);

  const isSeen = useCallback((id: string) => seen.has(id), [seen]);

  // Sincroniza entre abas
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === KEY) setSeen(load());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return { isSeen, markSeen };
}
