import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/hooks/use-theme";
import { useFeedback } from "@/hooks/use-feedback";

interface Props {
  className?: string;
}

const ThemeToggle = ({ className = "" }: Props) => {
  const { theme, toggleTheme } = useTheme();
  const { playFeedback } = useFeedback();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      onClick={() => {
        playFeedback("click");
        toggleTheme();
      }}
      aria-label={isDark ? "Ativar modo claro" : "Ativar modo escuro"}
      title={isDark ? "Modo claro" : "Modo escuro"}
      className={`relative inline-flex h-10 w-10 items-center justify-center rounded-full border border-border/60 bg-card/60 text-muted-foreground backdrop-blur-sm transition-all hover:border-primary/40 hover:text-foreground active:scale-95 ${className}`}
    >
      <Sun
        size={18}
        className={`absolute transition-all duration-300 ${
          isDark ? "rotate-90 scale-0 opacity-0" : "rotate-0 scale-100 opacity-100"
        }`}
      />
      <Moon
        size={18}
        className={`absolute transition-all duration-300 ${
          isDark ? "rotate-0 scale-100 opacity-100" : "-rotate-90 scale-0 opacity-0"
        }`}
      />
    </button>
  );
};

export default ThemeToggle;
