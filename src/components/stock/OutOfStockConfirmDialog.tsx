import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToggleProductActive } from "@/hooks/use-inventory";
import { toast } from "@/hooks/use-toast";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  itemName: string;
  productId: string | null;
  newStock: number;
};

export default function OutOfStockConfirmDialog({
  open,
  onOpenChange,
  itemName,
  productId,
  newStock,
}: Props) {
  const toggle = useToggleProductActive();

  const handleMarkOutOfStock = async () => {
    if (!productId) return;
    try {
      await toggle.mutateAsync({ product_id: productId, active: false });
      toast({ title: `${itemName} removido do cardápio` });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Erro", description: e.message, variant: "destructive" });
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>⚠ Realmente acabou {itemName}?</AlertDialogTitle>
          <AlertDialogDescription>
            O estoque chegou a {newStock < 0 ? `${newStock} (negativo)` : "0"}.
            Quer remover do cardápio do garçom? Você pode reativar a qualquer momento.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="gap-2">
          <AlertDialogCancel>Manter no cardápio</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleMarkOutOfStock}
            disabled={toggle.isPending || !productId}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Marcar esgotado
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
