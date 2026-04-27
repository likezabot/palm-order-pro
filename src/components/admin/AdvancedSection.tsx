/**
 * AdvancedSection — esconde conteúdo técnico atrás de um botão
 * "Mostrar opções avançadas". Estado persistido em localStorage por id.
 */
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface Props {
  id: string;
  label?: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
}

export default function AdvancedSection({
  id,
  label = "Mostrar opções avançadas",
  description,
  defaultOpen = false,
  children,
  className,
}: Props) {
  const storageKey = `admin-advanced-${id}`;
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(storageKey);
      if (stored != null) setOpen(stored === "true");
    } catch {
      /* no-op */
    }
  }, [storageKey]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try {
      localStorage.setItem(storageKey, String(next));
    } catch {
      /* no-op */
    }
  };

  return (
    <div className={cn("rounded-xl border border-dashed border-border/70 bg-muted/20", className)}>
      <Button
        type="button"
        variant="ghost"
        onClick={toggle}
        className="w-full justify-between h-auto py-3 px-4 hover:bg-muted/40 rounded-xl"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 font-bold text-sm text-foreground">
          <Settings2 className="w-4 h-4 text-muted-foreground" />
          {open ? "Ocultar opções avançadas" : label}
        </span>
        <ChevronDown
          className={cn("w-4 h-4 text-muted-foreground transition-transform", open && "rotate-180")}
        />
      </Button>
      {description && !open && (
        <p className="px-4 pb-3 text-xs text-muted-foreground -mt-1">{description}</p>
      )}
      {open && <div className="border-t border-border/60 p-4 space-y-6">{children}</div>}
    </div>
  );
}
