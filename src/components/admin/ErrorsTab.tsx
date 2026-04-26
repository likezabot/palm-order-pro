/**
 * Aba "Erros & Saúde" — concentra todo o monitoramento de erros do sistema.
 *
 * Mantém os mesmos painéis que viviam no topo da aba Sistema, agora isolados
 * de ferramentas destrutivas (apagar dados, etc).
 */
import { ShieldAlert } from "lucide-react";
import ErrorsSummaryPanel from "./ErrorsSummaryPanel";
import DailyErrorsPanel from "./DailyErrorsPanel";
import StuckPrintsPanel from "./StuckPrintsPanel";
import ErrorLogPanel from "./ErrorLogPanel";

export default function ErrorsTab() {
  return (
    <div className="max-w-2xl mx-auto py-4 space-y-6">
      <div className="rounded-xl border-2 border-border bg-muted/30 p-4 flex items-start gap-3">
        <div className="rounded-lg bg-destructive/10 p-2.5 shrink-0">
          <ShieldAlert className="w-5 h-5 text-destructive" />
        </div>
        <div className="text-sm">
          <h2 className="font-black text-base text-foreground">Erros & Saúde do sistema</h2>
          <p className="text-muted-foreground mt-1">
            Tudo que falhou hoje (cardápio, PDV, cozinha, impressão, integrações) e o que o
            sistema corrigiu sozinho. Use os painéis abaixo para investigar e destravar.
          </p>
        </div>
      </div>

      <ErrorsSummaryPanel />
      <DailyErrorsPanel />
      <StuckPrintsPanel />
      <ErrorLogPanel />
    </div>
  );
}
