import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Index from "./pages/Index";
import Palm from "./pages/Palm";
import Kitchen from "./pages/Kitchen";
import Admin from "./pages/Admin";
import PrintStation from "./pages/PrintStation";
import Pdv from "./pages/Pdv";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/palm" element={<Palm />} />
          <Route path="/kitchen" element={<Kitchen />} />
          <Route path="/cashier" element={<Cashier />} />
          <Route path="/admin" element={<Admin />} />
          <Route path="/pdv" element={<Pdv />} />
          <Route path="/print-station" element={<PrintStation />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
