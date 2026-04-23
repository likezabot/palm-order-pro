import { Eye, EyeOff } from "lucide-react";
import { useHighContrast } from "@/hooks/use-high-contrast";
import { useFeedback } from "@/hooks/use-feedback";

interface Props {
  className?: string;
}

const HighContrastToggle = ({ className = "" }: Props) => {
  const { enabled, toggle } = useHighContrast();
  const { playFeedback } = useFeedback();

  return (
    <button
      type="button"
      onClick={() => {
        playFeedback("click");
        toggle();
      }}
      aria-pressed={enabled}
      aria-label={enabled ? "Desativar alto contraste" : "Ativar alto contraste"}
      title={enabled ? "Desativar alto contraste" : "Ativar alto contraste"}
      className={`relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-card/60 text-muted-foreground backdrop-blur-sm transition-all hover:border-primary/40 hover:text-foreground active:scale-95 ${
        enabled ? "border-primary/60 text-foreground" : ""
      } ${className}`}
    >
      {enabled ? <Eye size={18} /> : <EyeOff size={18} />}
    </button>
  );
};

export default HighContrastToggle;
