/**
 * Limpa todo o estado do client (caches do navegador, service workers,
 * sessionStorage e flags de versão) e recarrega a página.
 * Útil quando um tablet trava em uma versão antiga.
 *
 * Mantém: localStorage de configurações do PDV (autoprint, print-config, etc).
 */
export async function forceUpdate(): Promise<void> {
  try {
    // 1. Limpa todas as caches do Cache Storage (PWA / SW caches)
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    }

    // 2. Desregistra todos os service workers
    if ("serviceWorker" in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map((r) => r.unregister()));
    }

    // 3. Limpa flags internas de versão e anti-loop para forçar revalidação
    localStorage.removeItem("app_version");
    localStorage.removeItem("app_last_reload_ts");
    sessionStorage.clear();
  } catch (err) {
    console.error("[force-update] erro durante limpeza:", err);
  } finally {
    // 4. Recarrega ignorando o cache HTTP do navegador
    window.location.reload();
  }
}
