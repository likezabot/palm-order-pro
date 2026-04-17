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
            // Periodic update check
            setInterval(() => reg.update(), 30_000);
            // Check on tab focus / visibility return — catches deploys fast
            const checkOnFocus = () => {
              if (document.visibilityState === "visible") reg.update();
            };
            document.addEventListener("visibilitychange", checkOnFocus);
            window.addEventListener("focus", checkOnFocus);
          })
          .catch((err) => console.log("SW registration failed:", err));
      });
    }
  }
});
