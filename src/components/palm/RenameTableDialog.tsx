import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useFeedback } from "@/hooks/use-feedback";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  value: string;
  onValueChange: (v: string) => void;
  tableName?: string;
  originalTableName?: string;
  onRename: (v: string) => void | Promise<void>;
}

export const RenameTableDialog = ({
  open,
  onOpenChange,
  value,
  onValueChange,
  tableName,
  originalTableName,
  onRename,
}: Props) => {
  const { playFeedback } = useFeedback();

  const submit = () => {
    const v = value.trim();
    if (!v) return;
    playFeedback("click");
    onRename(v);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Nome da mesa</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">
          Substitua o número pelo nome do cliente (ex: "João").
        </p>
        <input
          type="text"
          autoFocus
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
          placeholder="Ex: João, Mesa do canto..."
          maxLength={40}
          className="w-full rounded-md border border-border bg-background p-3 text-base text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
        {originalTableName && tableName !== originalTableName && (
          <button
            onClick={() => {
              playFeedback("click");
              onRename(originalTableName);
              onOpenChange(false);
            }}
            className="w-full rounded-lg border border-border bg-card p-3 text-sm font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary active:scale-[0.98] transition-all min-h-[48px]"
          >
            ↺ Voltar ao número original (Mesa {originalTableName})
          </button>
        )}
        <div className="flex gap-2">
          <button
            onClick={() => onOpenChange(false)}
            className="flex-1 rounded-lg border border-border bg-secondary p-3 text-sm font-semibold text-secondary-foreground active:scale-[0.97] transition-transform min-h-[48px]"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!value.trim() || value.trim() === tableName}
            className="flex-1 rounded-lg bg-primary p-3 text-sm font-bold text-primary-foreground active:scale-[0.97] transition-transform disabled:opacity-50 min-h-[48px]"
          >
            Salvar
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
};
