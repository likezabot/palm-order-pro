import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import fs from "fs";
import { componentTagger } from "lovable-tagger";

// Inject a unique build stamp into the service worker on every build.
// Without this, sw.js byte-content stays identical between deploys and
// browsers never detect a new version → users get stuck on old bundles.
const stampServiceWorker = () => {
  const stamp = Date.now().toString();
  return {
    name: "stamp-service-worker",
    closeBundle() {
      const swPath = path.resolve(__dirname, "dist/sw.js");
      if (fs.existsSync(swPath)) {
        const content = fs.readFileSync(swPath, "utf-8");
        fs.writeFileSync(swPath, content.replace(/__BUILD_STAMP__/g, stamp));
      }
    },
  };
};

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  define: {
    __APP_VERSION__: JSON.stringify(new Date().toISOString()),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger(), stampServiceWorker()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
}));
