import { checkAndUpdateVersion } from "./lib/version-check";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Disparar verificação de versão SEM bloquear a renderização.
// Se houver atualização, ela limpa caches em background e recarrega.
checkAndUpdateVersion();

// Renderiza imediatamente — não esperamos nada.
createRoot(document.getElementById("root")!).render(<App />);

// --- PWA Service Worker ---
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();

const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com") ||
  window.location.hostname.includes("lovable.dev");

if ("serviceWorker" in navigator) {
  if (isPreviewHost || isInIframe) {
    // No editor/preview: nunca registrar SW e remover qualquer um existente.
    navigator.serviceWorker.getRegistrations().then((regs) =>
      regs.forEach((r) => r.unregister())
    ).catch(() => {});
  } else {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          console.log("SW registered:", reg);
          let lastCheck = 0;
          const checkOnFocus = () => {
            const now = Date.now();
            if (document.visibilityState === "visible" && now - lastCheck > 60_000) {
              lastCheck = now;
              reg.update().catch(() => {});
            }
          };
          document.addEventListener("visibilitychange", checkOnFocus);
          window.addEventListener("focus", checkOnFocus);
        })
        .catch((err) => console.log("SW registration failed:", err));
    });
  }
}
