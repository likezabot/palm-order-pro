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
        "inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider transition-all",
        "shadow-[0_4px_14px_-4px_hsl(var(--primary)/0.25)] hover:scale-[1.03] active:scale-[0.98]",
        open
          ? "border border-success/30 bg-gradient-to-r from-success/15 to-success/5 text-success"
          : "border border-destructive/30 bg-gradient-to-r from-destructive/15 to-destructive/5 text-destructive",
      )}
    >
      <span className="relative flex h-2 w-2">
        <span
          className={cn(
            "absolute inline-flex h-full w-full animate-ping rounded-full opacity-60",
            open ? "bg-success" : "bg-destructive",
          )}
        />
        <span
          className={cn(
            "relative inline-flex h-2 w-2 rounded-full",
            open ? "bg-success" : "bg-destructive",
          )}
        />
      </span>
      {open ? "Aberto agora" : "Fechado"}
      <span className="ml-1 opacity-70 normal-case font-medium tracking-normal">· ver horários</span>
    </button>
  );
}
