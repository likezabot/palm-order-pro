declare const __APP_VERSION__: string;

const VERSION_KEY = "app_version";
const RELOAD_FLAG = "app_version_reloading";
const LAST_RELOAD_KEY = "app_last_reload_ts";

/** Safe localStorage access (modo privado pode lançar). */
const ls = {
  get(k: string): string | null {
    try { return localStorage.getItem(k); } catch { return null; }
  },
  set(k: string, v: string) {
    try { localStorage.setItem(k, v); } catch { /* noop */ }
  },
};
const ss = {
  get(k: string): string | null {
    try { return sessionStorage.getItem(k); } catch { return null; }
  },
  set(k: string, v: string) {
    try { sessionStorage.setItem(k, v); } catch { /* noop */ }
  },
  remove(k: string) {
    try { sessionStorage.removeItem(k); } catch { /* noop */ }
  },
};

/** Promise.race com timeout para nunca pendurar a inicialização. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([
    p.catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
  ]);
}

/**
 * NÃO BLOQUEANTE.
 * Sempre retorna rapidamente para o app renderizar.
 * Se detectar nova versão, agenda limpeza + reload em background com timeout.
 */
export function checkAndUpdateVersion(): void {
  try {
    const current = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
    const stored = ls.get(VERSION_KEY);
    const lastReloadTs = Number(ls.get(LAST_RELOAD_KEY) || "0");
    const now = Date.now();

    // Já recarregou recentemente: marca versão e segue.
    if (ss.get(RELOAD_FLAG)) {
      ss.remove(RELOAD_FLAG);
      ls.set(VERSION_KEY, current);
      return;
    }
    if (now - lastReloadTs < 30_000) {
      ls.set(VERSION_KEY, current);
      return;
    }

    // Primeira visita: registra e segue.
    if (!stored) {
      ls.set(VERSION_KEY, current);
      return;
    }

    // Mesma versão: nada a fazer.
    if (stored === current) return;

    // Nova versão: limpa em background e recarrega — com timeout duro de 3s
    // para nunca travar caso caches/SW pendurem.
    console.log(`[version] ${stored} → ${current} — limpando em background`);
    ls.set(VERSION_KEY, current);
    ls.set(LAST_RELOAD_KEY, String(now));
    ss.set(RELOAD_FLAG, "1");

    const cleanup = (async () => {
      if ("caches" in window) {
        const keys = await caches.keys().catch(() => []);
        await Promise.all(keys.map((k) => caches.delete(k).catch(() => false)));
      }
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker
          .getRegistrations()
          .catch(() => [] as ServiceWorkerRegistration[]);
        await Promise.all(regs.map((r) => r.unregister().catch(() => false)));
      }
    })();

    withTimeout(cleanup, 3000).then(() => {
      window.location.reload();
    });
  } catch (err) {
    // Nunca deixar o version-check derrubar o boot.
    console.warn("[version-check] erro ignorado:", err);
  }
}

export function getAppVersion(): string {
  return typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
}
