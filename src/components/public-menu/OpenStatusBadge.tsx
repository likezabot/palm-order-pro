import { Clock } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  open: boolean;
  onClick?: () => void;
};

export default function OpenStatusBadge({ open, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-bold uppercase tracking-wide transition-colors",
        open
          ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25"
          : "bg-rose-500/15 text-rose-400 hover:bg-rose-500/25",
      )}
    >
      <Clock className="h-3.5 w-3.5" />
      {open ? "Aberto agora" : "Fechado"}
      <span className="opacity-70 normal-case font-medium">· ver horários</span>
    </button>
  );
}
