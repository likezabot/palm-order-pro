import { useNavigate } from "react-router-dom";
import { Smartphone, Monitor, DollarSign, Settings, Printer } from "lucide-react";

const modes = [
  { label: "ATENDIMENTO / PALM", icon: Smartphone, path: "/palm", emoji: "📱" },
  { label: "PDV / IMPRESSÃO", icon: Monitor, path: "/pdv", emoji: "🖥️" },
  { label: "PAINEL COZINHA", icon: Monitor, path: "/kitchen", emoji: "👨‍🍳" },
  { label: "CAIXA", icon: DollarSign, path: "/cashier", emoji: "💰" },
  { label: "ADMIN", icon: Settings, path: "/admin", emoji: "⚙️" },
];

const Index = () => {
  const navigate = useNavigate();

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
      <div className="text-center mb-4">
        <h1 className="text-3xl font-extrabold tracking-tight text-primary">
          PLANO B
        </h1>
        <p className="text-lg font-semibold text-muted-foreground">ESPETARIA</p>
      </div>

      <div className="flex w-full max-w-sm flex-col gap-4">
        {modes.map((mode) => (
          <button
            key={mode.path}
            onClick={() => navigate(mode.path)}
            className="flex items-center gap-4 rounded-lg bg-card p-5 text-left text-lg font-semibold text-card-foreground transition-all duration-150 active:scale-[0.97] hover:bg-secondary border border-border min-h-[56px]"
          >
            <span className="text-2xl">{mode.emoji}</span>
            <span>{mode.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
};

export default Index;
