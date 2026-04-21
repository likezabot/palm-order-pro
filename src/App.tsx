import { QueryClient } from "@tanstack/react-query";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { queryPersister, shouldPersistQuery } from "@/lib/query-persister";
import { BrowserRouter, Route, Routes, useLocation } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import UpdateBanner from "@/components/UpdateBanner";
import ConnectivityBanner from "@/components/ConnectivityBanner";
import Index from "./pages/Index";
import Palm from "./pages/Palm";
import Kitchen from "./pages/Kitchen";
import Admin from "./pages/Admin";
import PrintStation from "./pages/PrintStation";
import Pdv from "./pages/Pdv";
import ForceUpdate from "./pages/ForceUpdate";
import InstallPalm from "./pages/InstallPalm";
import InstallKitchen from "./pages/InstallKitchen";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Cache offline parcial: mantém última versão visível mesmo sem rede.
      networkMode: "offlineFirst",
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
});

const AnimatedRoutes = () => {
  const location = useLocation();
  return (
    <div key={location.pathname} className="animate-fade-in">
      <Routes location={location}>
        <Route path="/" element={<Index />} />
        <Route path="/palm" element={<Palm />} />
        <Route path="/kitchen" element={<Kitchen />} />
        <Route path="/cashier" element={<Pdv />} />
        <Route path="/admin" element={<Admin />} />
        <Route path="/pdv" element={<Pdv />} />
        <Route path="/print-station" element={<PrintStation />} />
        <Route path="/atualizar" element={<ForceUpdate />} />
        <Route path="/instalar/palm" element={<InstallPalm />} />
        <Route path="/instalar/cozinha" element={<InstallKitchen />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
    </div>
  );
};

// Buster do cache persistente: muda a cada deploy (via __APP_VERSION__).
declare const __APP_VERSION__: string;
const CACHE_BUSTER =
  typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "dev";

const App = () => (
  <PersistQueryClientProvider
    client={queryClient}
    persistOptions={{
      persister: queryPersister,
      maxAge: 24 * 60 * 60 * 1000, // 24h
      buster: CACHE_BUSTER,
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

export default App;
