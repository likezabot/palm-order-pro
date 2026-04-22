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

interface Props {
  open: boolean;
  productName: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}

export const EsgotadoConfirmDialog = ({ open, productName, onCancel, onConfirm }: Props) => {
  return (
    <AlertDialog open={open} onOpenChange={(o) => !o && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Item esgotado no estoque</AlertDialogTitle>
          <AlertDialogDescription>
            {productName ? <strong>{productName}</strong> : "Este item"} está esgotado no estoque.
            Deseja adicionar mesmo assim ao carrinho?
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={onCancel}>Cancelar</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>Adicionar mesmo assim</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};
