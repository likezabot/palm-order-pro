import { useLocation } from "react-router-dom";

/**
 * Modo preview do cardápio público.
 * Quando ?preview=1 está presente, o cardápio é navegável mas
 * AÇÕES DE ENVIO (criar pedido, ir para checkout) ficam bloqueadas.
 * Usado pelo iframe do Admin para visualizar mudanças visuais.
 */
export function usePreviewMode(): boolean {
  const loc = useLocation();
  const params = new URLSearchParams(loc.search);
  return params.get("preview") === "1";
}
