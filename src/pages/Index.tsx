import { useNavigate } from "react-router-dom";
import { Smartphone, Monitor, Settings, Download, ChefHat, ShoppingBag } from "lucide-react";
import { useFeedback } from "@/hooks/use-feedback";
import { getAppVersion } from "@/lib/version-check";
import { RecentItemsPanel } from "@/components/home/RecentItemsPanel";

const modes = [
  { label: "ATENDIMENTO / PALM", path: "/palm", Icon: Smartphone },
  { label: "PDV / CAIXA", path: "/pdv", Icon: ShoppingBag },
  { label: "PAINEL COZINHA", path: "/kitchen", Icon: ChefHat },
  { label: "ADMIN", path: "/admin", Icon: Settings },
];

const Index = () => {
  const navigate = useNavigate();
  const { playFeedback } = useFeedback();

  return (
    <div className="flex min-h-screen-safe flex-col items-center justify-center gap-6 p-6 pt-[calc(1.5rem+env(safe-area-inset-top))] pb-[calc(1.5rem+env(safe-area-inset-bottom))]">
      <div className="text-center mb-2 animate-fade-in-up">
        <h1 className="text-4xl font-black tracking-widest brand-gradient-text">
          PLANO B
        </h1>
        <p className="text-sm font-bold tracking-[0.4em] text-muted-foreground mt-1">
          ESPETARIA
        </p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-3">
        {modes.map((mode, i) => {
          const Icon = mode.Icon;
          return (
            <button
              key={mode.path}
              onClick={() => {
                playFeedback("click");
                navigate(mode.path);
              }}
              style={{ animationDelay: `${i * 60}ms` }}
              className="group flex items-center gap-4 rounded-xl bg-card p-5 text-left text-lg font-semibold text-card-foreground border border-border shadow-card transition-all duration-200 active:scale-[0.97] hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-glow min-h-[64px] animate-fade-in-up"
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/15 transition-colors">
                <Icon size={22} strokeWidth={2.25} />
              </span>
              <span className="flex-1">{mode.label}</span>
            </button>
          );
        })}
      </div>

      {/* Instalação dedicada por modo */}
      <div className="w-full max-w-sm rounded-xl border border-primary/30 surface-elevated p-4 flex flex-col gap-3 shadow-card animate-fade-in-up" style={{ animationDelay: "260ms" }}>
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
            className="flex flex-col items-center gap-1.5 rounded-xl bg-card border border-border p-3 active:scale-[0.97] hover:border-primary/40 transition-all min-h-[88px]"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Smartphone className="h-5 w-5" />
            </span>
            <span className="text-xs font-bold text-foreground">Atendimento</span>
            <span className="text-[10px] text-muted-foreground">/palm</span>
          </button>
          <button
            onClick={() => {
              playFeedback("click");
              navigate("/instalar/cozinha");
            }}
            className="flex flex-col items-center gap-1.5 rounded-xl bg-card border border-border p-3 active:scale-[0.97] hover:border-primary/40 transition-all min-h-[88px]"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary">
              <Monitor className="h-5 w-5" />
            </span>
            <span className="text-xs font-bold text-foreground">Cozinha</span>
            <span className="text-[10px] text-muted-foreground">/kitchen</span>
          </button>
        </div>
      </div>

      <RecentItemsPanel />

      <p className="mt-2 text-[10px] text-muted-foreground/50 select-none">
        v1.14.0 ({getAppVersion().slice(0, 10)})
      </p>
    </div>
  );
};

export default Index;
