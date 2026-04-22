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

const BUNDLE_VERSION =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

/**
 * Lê o BUILD_STAMP direto de /sw.js (sempre via rede, sem cache HTTP).
 * Esse é o "versão real do deploy", independente do bundle JS que o SW
 * antigo pode estar servindo. Se difere do armazenado, há nova versão.
 *
 * Retorna null se não conseguir ler — nesse caso usamos o fallback do bundle.
 */
async function readRemoteBuildStamp(): Promise<string | null> {
  try {
    const res = await fetch("/sw.js?cb=" + Date.now(), { cache: "no-store" });
    if (!res.ok) return null;
    const text = await res.text();
    const m = text.match(/BUILD_STAMP\s*=\s*["']([^"']+)["']/);
    if (!m) return null;
    const stamp = m[1];
    // Se o stamp ainda é o placeholder do source (build local não rodou),
    // não tem como comparar — devolve null pra cair no fallback.
    if (stamp === "__BUILD_STAMP__") return null;
    return stamp;
  } catch {
    return null;
  }
}

/** Cache do stamp remoto, lido uma vez por sessão. */
let cachedRemoteStamp: string | null | undefined;
async function getRemoteStampOnce(): Promise<string | null> {
  if (cachedRemoteStamp !== undefined) return cachedRemoteStamp;
  cachedRemoteStamp = await readRemoteBuildStamp();
  return cachedRemoteStamp;
}

/**
 * NÃO BLOQUEANTE.
 * Sempre retorna rapidamente para o app renderizar.
 * Se detectar nova versão (via /sw.js remoto), agenda limpeza + reload.
 */
export function checkAndUpdateVersion(): void {
  // Roda em background — não bloqueia o boot.
  (async () => {
    try {
      const stored = ls.get(VERSION_KEY);
      const lastReloadTs = Number(ls.get(LAST_RELOAD_KEY) || "0");
      const now = Date.now();

      // Já recarregou recentemente: registra versão atual e segue.
      if (ss.get(RELOAD_FLAG)) {
        ss.remove(RELOAD_FLAG);
        const stamp = (await getRemoteStampOnce()) ?? BUNDLE_VERSION;
        ls.set(VERSION_KEY, stamp);
        return;
      }
      if (now - lastReloadTs < 30_000) {
        const stamp = (await getRemoteStampOnce()) ?? BUNDLE_VERSION;
        ls.set(VERSION_KEY, stamp);
        return;
      }

      // Stamp do deploy real (lido de /sw.js direto da rede).
      // Fallback: versão do bundle. Em dev, ambos podem ser "dev"/ISO.
      const remote = await getRemoteStampOnce();
      const current = remote ?? BUNDLE_VERSION;

      // Primeira visita: registra e segue.
      if (!stored) {
        ls.set(VERSION_KEY, current);
        return;
      }

      // Mesma versão: nada a fazer.
      if (stored === current) return;

      // Nova versão: limpa em background e recarrega.
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

      await withTimeout(cleanup, 3000);
      window.location.reload();
    } catch (err) {
      // Nunca deixar o version-check derrubar o boot.
      console.warn("[version-check] erro ignorado:", err);
    }
  })();
}

/**
 * Versão usada pelo buster do React Query persister.
 * Assíncrono: tenta ler o stamp remoto, com fallback pra versão do bundle.
 * Retorno é cacheado por sessão (getRemoteStampOnce).
 */
export async function getAppVersionAsync(): Promise<string> {
  const remote = await getRemoteStampOnce();
  return remote ?? BUNDLE_VERSION;
}

/** Versão síncrona (do bundle) — mantida para compat. */
export function getAppVersion(): string {
  return BUNDLE_VERSION;
}
