import { useState } from "react";
import { Eye, EyeOff, X, Percent } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";

interface Props {
  count: number;
  onShow: () => void;
  onHide: () => void;
  onAdjustPrice: (mode: "percent" | "fixed", value: number) => void;
  onCancel: () => void;
}

const BulkActionsBar = ({ count, onShow, onHide, onAdjustPrice, onCancel }: Props) => {
  const [fixedDialogOpen, setFixedDialogOpen] = useState(false);
  const [fixedValue, setFixedValue] = useState("");

  return (
    <>
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border shadow-2xl px-3 py-3 animate-in slide-in-from-bottom-4">
        <div className="max-w-5xl mx-auto flex items-center gap-2 flex-wrap">
          <span className="text-sm font-bold text-foreground mr-2">
            {count} selecionado{count !== 1 ? "s" : ""}
          </span>
          <Button
            size="sm"
            variant="default"
            disabled={count === 0}
            onClick={onShow}
            className="gap-1.5 font-bold"
          >
            <Eye size={14} /> Mostrar
          </Button>
          <Button
            size="sm"
            variant="secondary"
            disabled={count === 0}
            onClick={onHide}
            className="gap-1.5 font-bold"
          >
            <EyeOff size={14} /> Ocultar
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="secondary" disabled={count === 0} className="gap-1.5 font-bold">
                <Percent size={14} /> Ajustar preço
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => onAdjustPrice("percent", 5)}>+5%</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAdjustPrice("percent", 10)}>+10%</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAdjustPrice("percent", -5)}>−5%</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { setFixedValue(""); setFixedDialogOpen(true); }}>
                Definir valor fixo (R$)…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <div className="ml-auto">
            <Button size="sm" variant="ghost" onClick={onCancel} className="gap-1.5">
              <X size={14} /> Cancelar
            </Button>
          </div>
        </div>
      </div>

      <Dialog open={fixedDialogOpen} onOpenChange={setFixedDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Definir preço fixo</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Novo preço (R$) para os {count} itens</Label>
            <Input
              type="number" inputMode="decimal"
              step="0.01"
              min="0"
              value={fixedValue}
              onChange={(e) => setFixedValue(e.target.value)}
              placeholder="Ex.: 12.50"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFixedDialogOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => {
                const v = parseFloat(fixedValue);
                if (!isNaN(v) && v >= 0) {
                  onAdjustPrice("fixed", v);
                  setFixedDialogOpen(false);
                }
              }}
              disabled={!fixedValue || isNaN(parseFloat(fixedValue))}
            >
              Aplicar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default BulkActionsBar;
