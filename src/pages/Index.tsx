import { useNavigate } from "react-router-dom";
import { Smartphone, Monitor, Settings, Download } from "lucide-react";
import { useFeedback } from "@/hooks/use-feedback";
import { getAppVersion } from "@/lib/version-check";
import { RecentItemsPanel } from "@/components/home/RecentItemsPanel";

const modes = [
  { label: "ATENDIMENTO / PALM", path: "/palm", emoji: "📱" },
  { label: "PDV / CAIXA", path: "/pdv", emoji: "🖥️" },
  { label: "PAINEL COZINHA", path: "/kitchen", emoji: "👨‍🍳" },
  { label: "ADMIN", path: "/admin", emoji: "⚙️" },
];

const Index = () => {
  const navigate = useNavigate();
  const { playFeedback } = useFeedback();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="text-center mb-2">
        <h1 className="text-3xl font-extrabold tracking-tight text-primary">
          PLANO B
        </h1>
        <p className="text-lg font-semibold text-muted-foreground">ESPETARIA</p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-4">
        {modes.map((mode) => (
          <button
            key={mode.path}
            onClick={() => {
              playFeedback("click");
              navigate(mode.path);
            }}
            className="flex items-center gap-4 rounded-lg bg-card p-5 text-left text-lg font-semibold text-card-foreground transition-all duration-150 active:scale-[0.97] hover:bg-secondary border border-border min-h-[64px]"
          >
            <span className="text-2xl">{mode.emoji}</span>
            <span>{mode.label}</span>
          </button>
        ))}
      </div>

      {/* Instalação dedicada por modo */}
      <div className="w-full max-w-sm rounded-lg border border-primary/30 bg-primary/5 p-4 flex flex-col gap-3">
        <div className="flex items-center gap-2 mb-1">
          <Download className="h-5 w-5 text-primary shrink-0" />
          <p className="font-semibold text-card-foreground text-sm">
            Instalar como App
          </p>
        </div>
        <p className="text-xs text-muted-foreground -mt-1">
          O funcionário escolhe qual tela abre direto ao tocar no ícone.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={() => {
              playFeedback("click");
              navigate("/instalar/palm");
            }}
            className="flex flex-col items-center gap-1 rounded-lg bg-card border border-border p-3 active:scale-[0.97] transition-transform min-h-[80px]"
          >
            <Smartphone className="h-6 w-6 text-primary" />
            <span className="text-xs font-bold text-foreground">Atendimento</span>
            <span className="text-[10px] text-muted-foreground">/palm</span>
          </button>
          <button
            onClick={() => {
              playFeedback("click");
              navigate("/instalar/cozinha");
            }}
            className="flex flex-col items-center gap-1 rounded-lg bg-card border border-border p-3 active:scale-[0.97] transition-transform min-h-[80px]"
          >
            <Monitor className="h-6 w-6 text-primary" />
            <span className="text-xs font-bold text-foreground">Cozinha</span>
            <span className="text-[10px] text-muted-foreground">/kitchen</span>
          </button>
        </div>
      </div>

      <p className="mt-2 text-[10px] text-muted-foreground/50 select-none">
        v1.14.0 ({getAppVersion().slice(0, 10)})
      </p>
    </div>
  );
};

export default Index;
