import { Printer, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useFeedback } from "@/hooks/use-feedback";

interface Props {
  open: boolean;
  senha: string;
  customerName?: string;
  onChoose: (printSenha: boolean) => void;
}

const PrintSenhaDialog = ({ open, senha, customerName, onChoose }: Props) => {
  const { playFeedback } = useFeedback();

  const handle = (yes: boolean) => {
    playFeedback("click");
    onChoose(yes);
  };

  return (
    <AlertDialog open={open}>
      <AlertDialogContent className="max-w-[90vw] rounded-2xl">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-xl">
            Imprimir cupom de senha?
          </AlertDialogTitle>
          <AlertDialogDescription className="space-y-2">
            <span className="block">
              Pedido enviado com sucesso{customerName ? ` para ${customerName}` : ""}.
            </span>
            <span className="block text-4xl font-black text-primary text-center py-2 tabular-nums">
              {senha}
            </span>
            <span className="block">
              Deseja imprimir o cupom de senha do cliente agora?
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="flex flex-col gap-2 sm:flex-col">
          <button
            type="button"
            onClick={() => handle(true)}
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-primary p-4 text-lg font-bold text-primary-foreground active:scale-[0.98] transition-all min-h-[56px]"
          >
            <Printer size={20} /> Sim, imprimir senha
          </button>
          <button
            type="button"
            onClick={() => handle(false)}
            className="flex items-center justify-center gap-2 w-full rounded-xl bg-secondary p-4 text-base font-bold text-secondary-foreground active:scale-[0.98] transition-all min-h-[56px]"
          >
            <X size={18} /> Não, obrigado
          </button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default PrintSenhaDialog;
