import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useFeedback } from "@/hooks/use-feedback";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  /** Mesa física atual (original_table_name) — fica destacada e desabilitada */
  currentTable: string;
  onMoved: (newTable: string) => void;
}

const MoveTableDialog = ({ open, onOpenChange, orderId, currentTable, onMoved }: Props) => {
  const { playFeedback } = useFeedback();
  const { toast } = useToast();
  const [moving, setMoving] = useState<string | null>(null);

  // Total de mesas do sistema
  const { data: tableCount = 10 } = useQuery({
    queryKey: ["table-count"],
    queryFn: async () => {
      const { data } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "table_count")
        .maybeSingle();
      return data ? Number(data.value) : 10;
    },
    staleTime: 30_000,
  });

  // Pedidos ativos para descobrir quais mesas físicas estão ocupadas
  const { data: activeOrders = [], refetch } = useQuery({
    queryKey: ["active-orders-move", open],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, table_name, original_table_name, status")
        .in("status", ["new", "preparing", "done"]);
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
    refetchInterval: open ? 4000 : false,
  });

  useEffect(() => {
    if (open) refetch();
  }, [open, refetch]);

  const tables = Array.from({ length: tableCount }, (_, i) => (i + 1).toString());

  const occupiedMap = new Map<string, { id: string; table_name: string }>();
  for (const o of activeOrders) {
    const physical = (o.original_table_name ?? o.table_name) as string;
    if (physical && physical !== "BALCÃO") {
      occupiedMap.set(physical, { id: o.id, table_name: o.table_name });
    }
  }

  const handlePick = async (target: string) => {
    if (target === currentTable) return;
    setMoving(target);
    const { error } = await supabase.rpc("move_order_to_table", {
      p_order_id: orderId,
      p_target_table: target,
    });
    setMoving(null);

    if (error) {
      const msg = error.message || "";
      if (msg.includes("target_table_occupied")) {
        toast({
          title: "Mesa indisponível",
          description: `A Mesa ${target} foi ocupada. Atualizando lista...`,
          variant: "destructive",
        });
        refetch();
        return;
      }
      console.error("[MoveTable] erro:", error);
      toast({
        title: "Erro ao mover mesa",
        description: msg,
        variant: "destructive",
      });
      return;
    }

    playFeedback("success");
    onMoved(target);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Mover pedido para outra mesa</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground -mt-2">
          Atualmente na <strong className="text-foreground">Mesa {currentTable}</strong>. Escolha uma mesa disponível:
        </p>

        <div className="grid grid-cols-4 gap-2 max-h-[60vh] overflow-y-auto pt-1">
          {tables.map((t) => {
            const isCurrent = t === currentTable;
            const occupied = occupiedMap.has(t);
            const disabled = isCurrent || occupied || !!moving;
            const isMovingThis = moving === t;

            let cls = "bg-emerald-500/10 border-emerald-500/60 text-emerald-500 hover:bg-emerald-500/20";
            if (isCurrent) cls = "bg-primary/20 border-primary text-primary";
            else if (occupied) cls = "bg-muted border-border text-muted-foreground opacity-50 cursor-not-allowed";

            return (
              <button
                key={t}
                onClick={() => handlePick(t)}
                disabled={disabled}
                className={`relative aspect-square flex flex-col items-center justify-center rounded-xl border-2 font-black text-xl transition-all active:scale-95 disabled:active:scale-100 ${cls}`}
              >
                {isMovingThis ? (
                  <Loader2 size={20} className="animate-spin" />
                ) : (
                  <>
                    <span>{t}</span>
                    {isCurrent && (
                      <span className="text-[9px] font-bold mt-0.5 uppercase">Atual</span>
                    )}
                    {occupied && !isCurrent && (
                      <span className="text-[9px] font-bold mt-0.5 uppercase">Ocupada</span>
                    )}
                    {!occupied && !isCurrent && (
                      <span className="text-[9px] font-bold mt-0.5 uppercase">Livre</span>
                    )}
                  </>
                )}
              </button>
            );
          })}
        </div>

        <button
          onClick={() => onOpenChange(false)}
          className="mt-2 w-full rounded-lg border border-border bg-secondary p-3 text-sm font-semibold text-secondary-foreground active:scale-[0.97] transition-transform min-h-[48px]"
        >
          Cancelar
        </button>
      </DialogContent>
    </Dialog>
  );
};

export default MoveTableDialog;
