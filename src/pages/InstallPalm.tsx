import { useEffect } from "react";
import InstallPage from "@/components/install/InstallPage";

const InstallPalm = () => {
  useEffect(() => {
    // Troca o manifest para apontar start_url=/palm antes do prompt de instalação
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    const original = link?.getAttribute("href") ?? "/manifest.json";
    if (link) link.setAttribute("href", "/manifest-palm.json");
    document.title = "Instalar Atendimento — Plano B";
    return () => {
      if (link) link.setAttribute("href", original);
      document.title = "Plano B Espetaria";
    };
  }, []);

  return (
    <InstallPage
      title="Instalar como ATENDIMENTO"
      subtitle="Ao instalar, o ícone abrirá direto na tela de mesas/balcão (Palm)."
      emoji="📱"
      colorClass="text-primary"
      ctaTarget="/palm"
    />
  );
};

export default InstallPalm;
