import { checkAndUpdateVersion } from "./lib/version-check";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { startPrintQueueWorker } from "./lib/print-queue-worker";
import { debugLog } from "./lib/debug-logger";
import { startConnectivityMonitor } from "./lib/connectivity-monitor";

// Anti-flash: aplica tema salvo antes do React montar.
// Default = dark (preserva visual atual).
try {
  const t = localStorage.getItem("plano-b-theme");
  if (t !== "light") {
    document.documentElement.classList.add("dark");
  }
} catch {
  document.documentElement.classList.add("dark");
}

debugLog.info(
  "system",
  "Plano B PDV iniciado — use __plbLogs(), __plbLogsText() ou __plbLogsCopy() no DevTools",
);

// Disparar verificação de versão SEM bloquear a renderização.
// Se houver atualização, ela limpa caches em background e recarrega.
checkAndUpdateVersion();

// Renderiza imediatamente — não esperamos nada.
createRoot(document.getElementById("root")!).render(<App />);

// Worker da fila local de impressão (fallback do bridge .exe).
// Roda em background e tenta reimprimir jobs pendentes a cada 15s.
startPrintQueueWorker();

// Monitor de conectividade (internet + realtime + backend).
// Não toca em backend: só observa e expõe estado pra UI.
startConnectivityMonitor();

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
        // updateViaCache: "none" garante que toda checagem do próprio sw.js
        // ignore o HTTP cache do navegador. Sem isso, alguns Androids
        // mantêm o sw.js cacheado por 24h e o PWA fica preso em build antigo.
        .register("/sw.js", { updateViaCache: "none" })
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
