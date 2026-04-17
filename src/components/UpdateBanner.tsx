import { useEffect, useState } from "react";

export default function UpdateBanner() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const onUpdate = () => {
      setShow(true);
      // Auto-reload after 2s
      setTimeout(() => window.location.reload(), 2000);
    };

    // Listen for new SW taking control
    let refreshing = false;
    const onControllerChange = () => {
      if (refreshing) return;
      // Anti-loop: don't auto-reload if we just reloaded recently
      const lastReload = Number(localStorage.getItem("app_last_reload_ts") || "0");
      if (Date.now() - lastReload < 30_000) return;
      refreshing = true;
      localStorage.setItem("app_last_reload_ts", String(Date.now()));
      onUpdate();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    // Check if there's a waiting SW right now
    navigator.serviceWorker.getRegistration().then((reg) => {
      if (reg?.waiting) {
        reg.waiting.postMessage({ type: "SKIP_WAITING" });
      }
      reg?.addEventListener("updatefound", () => {
        const newSW = reg.installing;
        newSW?.addEventListener("statechange", () => {
          if (newSW.state === "installed" && navigator.serviceWorker.controller) {
            newSW.postMessage({ type: "SKIP_WAITING" });
          }
        });
      });
    });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  if (!show) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-[9999] bg-primary text-primary-foreground text-center py-2 text-sm font-medium animate-in slide-in-from-top">
      Nova versão disponível. Atualizando...
      <button
        onClick={() => window.location.reload()}
        className="ml-3 underline font-bold"
      >
        Atualizar agora
      </button>
    </div>
  );
}
