import { useNavigate } from "react-router-dom";
import { ArrowLeft, Download, Share } from "lucide-react";
import { usePwaInstall } from "@/hooks/use-pwa-install";
import { useFeedback } from "@/hooks/use-feedback";

interface Props {
  title: string;
  subtitle: string;
  emoji: string;
  colorClass: string;
  ctaTarget: string;
}

const InstallPage = ({ title, subtitle, emoji, ctaTarget }: Props) => {
  const navigate = useNavigate();
  const { install, canPrompt, isIOS, isInstalled } = usePwaInstall();
  const { playFeedback } = useFeedback();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6 bg-background">
      <button
        onClick={() => navigate("/")}
        className="absolute top-4 left-4 flex items-center gap-2 text-muted-foreground"
      >
        <ArrowLeft size={20} /> Voltar
      </button>

      <div className="text-center">
        <div className="text-6xl mb-3">{emoji}</div>
        <h1 className="text-2xl font-extrabold text-primary">{title}</h1>
        <p className="mt-2 text-sm text-muted-foreground max-w-xs mx-auto">{subtitle}</p>
      </div>

      {isInstalled ? (
        <div className="w-full max-w-sm rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-center">
          <p className="text-sm font-semibold text-emerald-400">App já instalado neste dispositivo.</p>
          <button
            onClick={() => navigate(ctaTarget)}
            className="mt-3 w-full rounded-lg bg-primary py-3 text-sm font-bold text-primary-foreground active:scale-[0.97] transition-transform"
          >
            Abrir agora
          </button>
        </div>
      ) : canPrompt ? (
        <button
          onClick={async () => {
            playFeedback("click");
            const ok = await install();
            if (ok) {
              setTimeout(() => navigate(ctaTarget), 600);
            }
          }}
          className="flex w-full max-w-sm items-center justify-center gap-3 rounded-lg bg-primary py-4 text-base font-bold text-primary-foreground active:scale-[0.97] transition-transform"
        >
          <Download size={22} /> INSTALAR AGORA
        </button>
      ) : isIOS ? (
        <div className="w-full max-w-sm rounded-lg border border-primary/30 bg-primary/10 p-4">
          <p className="text-sm text-foreground mb-2 font-semibold">No iPhone/iPad:</p>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5 flex-wrap">
            Toque em <Share className="h-4 w-4 inline" /> e depois em{" "}
            <strong>"Adicionar à Tela de Início"</strong>
          </p>
        </div>
      ) : (
        <div className="w-full max-w-sm rounded-lg border border-border bg-card p-4 text-center">
          <p className="text-sm text-muted-foreground">
            Use o menu do seu navegador (⋮) e escolha <strong>"Instalar app"</strong> ou{" "}
            <strong>"Adicionar à tela inicial"</strong>.
          </p>
        </div>
      )}

      <button
        onClick={() => navigate(ctaTarget)}
        className="text-sm text-muted-foreground underline"
      >
        Pular instalação e abrir no navegador
      </button>
    </div>
  );
};

export default InstallPage;
