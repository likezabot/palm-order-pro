import { Clock } from "lucide-react";

type Props = {
  nextOpenLabel?: string | null;
};

export default function ClosedOverlay({ nextOpenLabel }: Props) {
  return (
    <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-center">
      <Clock className="mx-auto mb-2 h-6 w-6 text-rose-400" />
      <p className="text-base font-bold text-rose-300">Estamos fechados no momento</p>
      {nextOpenLabel && (
        <p className="mt-1 text-xs text-rose-300/80">Próxima abertura: {nextOpenLabel}</p>
      )}
      <p className="mt-2 text-xs text-muted-foreground">
        Você pode ver o cardápio, mas não dá pra fazer pedidos agora.
      </p>
    </div>
  );
}
