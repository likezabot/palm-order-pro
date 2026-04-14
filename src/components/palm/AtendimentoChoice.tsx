import { ArrowLeft, Store, PlusCircle, History } from "lucide-react";
import { useNavigate } from "react-router-dom";

interface Props {
  onSelect: (type: "balcao" | "nova_mesa" | "mesa_atendida") => void;
}

const AtendimentoChoice = ({ onSelect }: Props) => {
  const navigate = useNavigate();

  const handleSelect = (type: "balcao" | "nova_mesa" | "mesa_atendida") => {
    // Haptic feedback
    if (navigator.vibrate) {
      navigator.vibrate(30);
    }
    onSelect(type);
  };

  return (
    <div className="flex min-h-screen flex-col p-4">
      <button
        onClick={() => navigate("/")}
        className="flex items-center gap-2 text-muted-foreground mb-6 text-base"
      >
        <ArrowLeft size={20} /> Voltar
      </button>

      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <h1 className="text-2xl font-bold text-primary mb-4">ATENDIMENTO</h1>

        <button
          onClick={() => handleSelect("balcao")}
          className="w-full max-w-sm flex items-center gap-4 rounded-xl bg-card border border-border p-6 text-left transition-all duration-150 active:scale-[0.97] hover:bg-secondary/50"
        >
          <div className="bg-primary/10 p-3 rounded-lg text-primary">
            <Store size={28} />
          </div>
          <div>
            <span className="block text-lg font-bold text-foreground">BALCÃO</span>
            <span className="text-sm text-muted-foreground">Venda rápida no balcão</span>
          </div>
        </button>

        <button
          onClick={() => handleSelect("nova_mesa")}
          className="w-full max-w-sm flex items-center gap-4 rounded-xl bg-card border border-border p-6 text-left transition-all duration-150 active:scale-[0.97] hover:bg-secondary/50"
        >
          <div className="bg-primary/10 p-3 rounded-lg text-primary">
            <PlusCircle size={28} />
          </div>
          <div>
            <span className="block text-lg font-bold text-foreground">NOVA MESA</span>
            <span className="text-sm text-muted-foreground">Abrir uma nova mesa</span>
          </div>
        </button>

        <button
          onClick={() => handleSelect("mesa_atendida")}
          className="w-full max-w-sm flex items-center gap-4 rounded-xl bg-card border border-border p-6 text-left transition-all duration-150 active:scale-[0.97] hover:bg-secondary/50"
        >
          <div className="bg-primary/10 p-3 rounded-lg text-primary">
            <History size={28} />
          </div>
          <div>
            <span className="block text-lg font-bold text-foreground">MESA JÁ ATENDIDA</span>
            <span className="text-sm text-muted-foreground">Adicionar itens a uma mesa</span>
          </div>
        </button>
      </div>
    </div>
  );
};

export default AtendimentoChoice;
