import { useEffect, useState } from "react";
import { forceUpdate } from "@/lib/force-update";

/**
 * Rota /atualizar — executa limpeza completa de cache + SW e recarrega.
 * Use em tablets/navegadores que ficaram travados em uma versão antiga:
 * basta abrir https://palm-order-pro.lovable.app/atualizar
 */
const ForceUpdate = () => {
  const [status, setStatus] = useState("Limpando caches e atualizando…");

  useEffect(() => {
    const t = setTimeout(() => {
      setStatus("Recarregando…");
      forceUpdate().catch(() => {
        // forceUpdate já dá reload no finally; este catch é só por segurança
        window.location.replace("/");
      });
    }, 400);
    return () => clearTimeout(t);
  }, []);

  return (
    <div className="min-h-screen-safe flex flex-col items-center justify-center bg-background text-foreground p-6 gap-4">
      <div className="w-12 h-12 rounded-full border-4 border-primary border-t-transparent animate-spin" />
      <h1 className="text-xl font-bold text-center">Forçando atualização</h1>
      <p className="text-muted-foreground text-center">{status}</p>
      <p className="text-xs text-muted-foreground text-center max-w-xs">
        Não feche esta tela. O app vai recarregar automaticamente em instantes.
      </p>
    </div>
  );
};

export default ForceUpdate;
