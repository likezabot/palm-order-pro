import { checkAndUpdateVersion } from "./lib/version-check";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

// Check version before rendering — if updated, page will reload
checkAndUpdateVersion().then((reloading) => {
  if (reloading) return; // Stop — page is reloading

  createRoot(document.getElementById("root")!).render(<App />);

  // --- PWA Service Worker ---
  const isInIframe = (() => {
    try { return window.self !== window.top; } catch { return true; }
  })();

  const isPreviewHost =
    window.location.hostname.includes("id-preview--") ||
    window.location.hostname.includes("lovableproject.com");

  if ("serviceWorker" in navigator) {
    if (isPreviewHost || isInIframe) {
      navigator.serviceWorker.getRegistrations().then((regs) =>
        regs.forEach((r) => r.unregister())
      );
    } else {
      window.addEventListener("load", () => {
        navigator.serviceWorker
          .register("/sw.js")
          .then((reg) => {
            console.log("SW registered:", reg);
            // Check on tab focus / visibility return — throttled to once per minute
            let lastCheck = 0;
            const checkOnFocus = () => {
              const now = Date.now();
              if (document.visibilityState === "visible" && now - lastCheck > 60_000) {
                lastCheck = now;
                reg.update();
              }
            };
            document.addEventListener("visibilitychange", checkOnFocus);
            window.addEventListener("focus", checkOnFocus);
          })
          .catch((err) => console.log("SW registration failed:", err));
      });
    }
  }
});
