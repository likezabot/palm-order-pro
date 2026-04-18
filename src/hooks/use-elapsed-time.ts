import { useEffect, useState } from "react";

/** Retorna string como "5min", "1h12", "agora" — atualiza a cada 30s. */
export function useElapsedTime(startIso: string | null | undefined): string {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!startIso) return "";
  const start = new Date(startIso).getTime();
  if (isNaN(start)) return "";
  const diffSec = Math.max(0, Math.floor((now - start) / 1000));
  if (diffSec < 60) return "agora";
  const min = Math.floor(diffSec / 60);
  if (min < 60) return `${min}min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h}h` : `${h}h${m.toString().padStart(2, "0")}`;
}
