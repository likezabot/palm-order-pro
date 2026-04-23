import { lazy, Suspense, useEffect, useState } from "react";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { queryPersister, shouldPersistQuery } from "@/lib/query-persister";
import { queryClient } from "@/lib/query-client";
import { getAppVersionAsync } from "@/lib/version-check";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import UpdateBanner from "@/components/UpdateBanner";
import ConnectivityBanner from "@/components/ConnectivityBanner";
import AdminErrorBoundary from "@/components/admin/AdminErrorBoundary";
// Index, Palm e Kitchen são leves e abertos com mais frequência → import direto.
import Index from "./pages/Index";
import Palm from "./pages/Palm";
import Kitchen from "./pages/Kitchen";

// Retry helper: tenta o import dinâmico até 2x antes de propagar o erro
// (cobre falhas transitórias de rede / chunk velho após deploy).
const lazyWithRetry = <T extends { default: React.ComponentType<any> }>(
  factory: () => Promise<T>,
) =>
  lazy(async () => {
    try {
      return await factory();
    } catch (err) {
      await new Promise((r) => setTimeout(r, 600));
      try {
        return await factory();
      } catch (err2) {
        throw err2;
      }
    }
  });

// Rotas pesadas → lazy (Admin tem charts; PrintStation tem fila; Pdv tem realtime denso etc.).
const Admin = lazyWithRetry(() => import("./pages/Admin"));
const Pdv = lazy(() => import("./pages/Pdv"));
const PrintStation = lazy(() => import("./pages/PrintStation"));
const Stock = lazy(() => import("./pages/Stock"));
const ForceUpdate = lazy(() => import("./pages/ForceUpdate"));
const InstallPalm = lazy(() => import("./pages/InstallPalm"));
const InstallKitchen = lazy(() => import("./pages/InstallKitchen"));
const NotFound = lazy(() => import("./pages/NotFound"));

const RouteFallback = () => (
  <div className="flex min-h-screen items-center justify-center text-muted-foreground text-sm">
    Carregando…
  </div>
);

const AnimatedRoutes = () => {
  const location = useLocation();
  return (
    <div key={location.pathname} className="animate-fade-in">
      <Suspense fallback={<RouteFallback />}>
        <Routes location={location}>
          <Route path="/" element={<Index />} />
          <Route path="/palm" element={<Palm />} />
          <Route path="/kitchen" element={<Kitchen />} />
          <Route path="/cashier" element={<Pdv />} />
          <Route
            path="/admin"
            element={
              <AdminErrorBoundary>
                <Admin />
              </AdminErrorBoundary>
            }
          />
          <Route path="/pdv" element={<Pdv />} />
          <Route path="/print-station" element={<PrintStation />} />
          <Route path="/estoque" element={<Stock />} />
          <Route path="/atualizar" element={<ForceUpdate />} />
          <Route path="/instalar/palm" element={<InstallPalm />} />
          <Route path="/instalar/cozinha" element={<InstallKitchen />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </div>
  );
};

// Buster do cache persistente: muda a cada deploy.
declare const __APP_VERSION__: string;
const FALLBACK_BUSTER =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

const App = () => {
  const [buster, setBuster] = useState<string>(FALLBACK_BUSTER);

  useEffect(() => {
    let alive = true;
    getAppVersionAsync()
      .then((v) => { if (alive) setBuster(v); })
      .catch(() => { /* mantém fallback */ });
    return () => { alive = false; };
  }, []);

  return (
  <PersistQueryClientProvider
    client={queryClient}
    persistOptions={{
      persister: queryPersister,
      maxAge: 24 * 60 * 60 * 1000, // 24h
      buster,
      dehydrateOptions: {
        shouldDehydrateQuery: (query) => shouldPersistQuery(query as any),
      },
    }}
  >
    <TooltipProvider>
      <UpdateBanner />
      <ConnectivityBanner />
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AnimatedRoutes />
      </BrowserRouter>
    </TooltipProvider>
  </PersistQueryClientProvider>
  );
};

export default App;
