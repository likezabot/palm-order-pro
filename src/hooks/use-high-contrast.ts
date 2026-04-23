import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "plano-b-high-contrast";

function readStored(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(STORAGE_KEY) === "1";
}

function apply(enabled: boolean) {
  const root = document.documentElement;
  if (enabled) root.classList.add("hc");
  else root.classList.remove("hc");
}

export function useHighContrast() {
  const [enabled, setEnabledState] = useState<boolean>(() => readStored());

  useEffect(() => {
    apply(enabled);
    try {
      localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
    } catch {
      // ignore
    }
  }, [enabled]);

  const setEnabled = useCallback((v: boolean) => setEnabledState(v), []);
  const toggle = useCallback(() => setEnabledState((p) => !p), []);

  return { enabled, setEnabled, toggle };
}
