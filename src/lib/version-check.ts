declare const __APP_VERSION__: string;

const VERSION_KEY = "app_version";
const RELOAD_FLAG = "app_version_reloading";

/**
 * Compares build version with stored version.
 * If different: clears caches, unregisters SW, saves new version, reloads once.
 * Returns true if a reload was triggered (caller should stop rendering).
 */
export async function checkAndUpdateVersion(): Promise<boolean> {
  const current = typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
  const stored = localStorage.getItem(VERSION_KEY);
  const lastReloadTs = Number(localStorage.getItem("app_last_reload_ts") || "0");
  const now = Date.now();

  // Prevent reload loop (session flag)
  if (sessionStorage.getItem(RELOAD_FLAG)) {
    sessionStorage.removeItem(RELOAD_FLAG);
    localStorage.setItem(VERSION_KEY, current);
    return false;
  }

  // Hard guard: never reload twice within 30s, regardless of version mismatch
  if (now - lastReloadTs < 30_000) {
    localStorage.setItem(VERSION_KEY, current);
    return false;
  }

  if (stored && stored !== current) {
    console.log(`[version] Updating ${stored} → ${current}`);

    // Clear all caches
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }

    // Unregister all service workers
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }

    localStorage.setItem(VERSION_KEY, current);
    localStorage.setItem("app_last_reload_ts", String(now));
    sessionStorage.setItem(RELOAD_FLAG, "1");
    window.location.reload();
    return true;
  }

  // First visit or same version
  localStorage.setItem(VERSION_KEY, current);
  return false;
}

export function getAppVersion(): string {
  return typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";
}
