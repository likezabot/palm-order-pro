import { FileText, Receipt, FilePlus } from "lucide-react";
import { Order } from "@/lib/types";
import { useFeedback } from "@/hooks/use-feedback";
import { formatTableLabel } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export type PrintChoice = "full" | "bill" | "delta";

interface Props {
  order: Order | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChoose: (choice: PrintChoice) => void;
}

const PrintChoiceDialog = ({ order, open, onOpenChange, onChoose }: Props) => {
  const { playFeedback } = useFeedback();

  const hasDelta =
    Array.isArray((order as any)?.delta_items) &&
    ((order as any).delta_items as unknown[]).length > 0;

  const handle = (choice: PrintChoice) => {
    playFeedback("click");
    onChoose(choice);
  };

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-[90vw] rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl">
            Imprimir {order ? formatTableLabel(order.table_name, order.original_table_name) : ""}
          </AlertDialogTitle>
          <AlertDialogDescription>
            Escolha o que enviar para a central de impressão.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex flex-col gap-2 sm:flex-col">
          <button
            onClick={() => handle("full")}
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-primary p-4 text-base font-bold text-primary-foreground active:scale-[0.98] transition-all"
          >
            <FileText size={20} /> Comanda completa
          </button>
          <button
            onClick={() => handle("bill")}
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-secondary p-4 text-base font-bold text-secondary-foreground active:scale-[0.98] transition-all"
          >
            <Receipt size={20} /> Conta / Fechamento
          </button>
          <button
            onClick={() => handle("delta")}
            disabled={!hasDelta}
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-secondary p-4 text-base font-bold text-secondary-foreground active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FilePlus size={20} /> Últimos acréscimos
          </button>
          <AlertDialogCancel className="w-full rounded-xl p-4 h-auto text-base border-none text-muted-foreground">
            Cancelar
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default PrintChoiceDialog;
