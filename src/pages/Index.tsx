import { useNavigate } from "react-router-dom";
import { Smartphone, Monitor, DollarSign, Settings, Download, Share } from "lucide-react";
import { useFeedback } from "@/hooks/use-feedback";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { getAppVersion } from "@/lib/version-check";

const modes = [
  { label: "ATENDIMENTO / PALM", icon: Smartphone, path: "/palm", emoji: "📱" },
  { label: "PDV / CAIXA", icon: Monitor, path: "/pdv", emoji: "🖥️" },
  { label: "PAINEL COZINHA", icon: Monitor, path: "/kitchen", emoji: "👨‍🍳" },
  { label: "ADMIN", icon: Settings, path: "/admin", emoji: "⚙️" },
];

const Index = () => {
  const navigate = useNavigate();
  const { playFeedback } = useFeedback();
  const { install, canPrompt, isIOS, showInstallBanner } = usePwaInstall();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="text-center mb-4">
        <h1 className="text-3xl font-extrabold tracking-tight text-primary">
          PLANO B
        </h1>
        <p className="text-lg font-semibold text-muted-foreground">ESPETARIA</p>
      </div>

      {showInstallBanner && (
        <div className="w-full max-w-sm rounded-lg border border-primary/30 bg-primary/10 p-4 flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <Download className="h-6 w-6 text-primary shrink-0" />
            <div>
              <p className="font-semibold text-card-foreground text-sm">
                Instale o App
              </p>
              <p className="text-xs text-muted-foreground">
                Acesse mais rápido direto da tela inicial
              </p>
            </div>
          </div>
          {canPrompt ? (
            <button
              onClick={async () => {
                playFeedback("click");
                await install();
              }}
              className="w-full rounded-lg bg-primary py-3 text-sm font-bold text-primary-foreground active:scale-[0.97] transition-transform"
            >
              INSTALAR AGORA
            </button>
          ) : isIOS ? (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              Toque em <Share className="h-4 w-4 inline" /> e depois em{" "}
              <strong>"Adicionar à Tela de Início"</strong>
            </p>
          ) : null}
        </div>
      )}

      <div className="flex w-full max-w-sm flex-col gap-4">
        {modes.map((mode) => (
          <button
            key={mode.path}
            onClick={() => {
              playFeedback("click");
              navigate(mode.path);
            }}
            className="flex items-center gap-4 rounded-lg bg-card p-5 text-left text-lg font-semibold text-card-foreground transition-all duration-150 active:scale-[0.97] hover:bg-secondary border border-border min-h-[56px]"
          >
            <span className="text-2xl">{mode.emoji}</span>
            <span>{mode.label}</span>
          </button>
        ))}
      </div>

      <p className="mt-6 text-[10px] text-muted-foreground/50 select-none">
        v{getAppVersion().slice(0, 16).replace("T", " ")}
      </p>
    </div>
  );
};

export default Index;
