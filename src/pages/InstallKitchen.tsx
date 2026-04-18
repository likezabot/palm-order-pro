import { useEffect } from "react";
import InstallPage from "@/components/install/InstallPage";

const InstallKitchen = () => {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const original = link?.getAttribute("href") ?? "/manifest.json";
    if (link) link.setAttribute("href", "/manifest-kitchen.json");
    document.title = "Instalar Cozinha — Plano B";
    return () => {
      if (link) link.setAttribute("href", original);
      document.title = "Plano B Espetaria";
    };
  }, []);

  return (
    <InstallPage
      title="Instalar como COZINHA"
      subtitle="Ao instalar, o ícone abrirá direto no painel de cozinha (kanban de pedidos)."
      emoji="👨‍🍳"
      colorClass="text-primary"
      ctaTarget="/kitchen"
    />
  );
};

export default InstallKitchen;
