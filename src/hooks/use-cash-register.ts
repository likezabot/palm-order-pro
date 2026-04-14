import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useFeedback } from "@/hooks/use-feedback";

export interface CashRegister {
  id: string;
  opened_at: string;
  closed_at: string | null;
  user_id: string;
  initial_amount: number;
  final_amount: number | null;
  total_sales: number;
  status: 'open' | 'closed';
}

export interface CashMovement {
  id: string;
  cash_register_id: string;
  type: 'in' | 'out';
  amount: number;
  reason: string | null;
  created_at: string;
}

export const useCashRegister = () => {
  const [register, setRegister] = useState<CashRegister | null>(null);
  const [movements, setMovements] = useState<CashMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { playFeedback } = useFeedback();

  const fetchRegister = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("cash_register")
      .select("*")
      .eq("status", "open")
      .single();

    if (error && error.code !== "PGRST116") {
      console.error(error);
    } else {
      setRegister(data as unknown as CashRegister);
      if (data) {
        const { data: mvms } = await supabase
          .from("cash_movements")
          .select("*")
          .eq("cash_register_id", data.id);
        setMovements((mvms as unknown as CashMovement[]) || []);
      }
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRegister();
  }, [fetchRegister]);

  const openRegister = async (initialAmount: number, userId: string) => {
    const { data, error } = await supabase
      .from("cash_register")
      .insert({
        initial_amount: initialAmount,
        user_id: userId,
        status: "open",
      })
      .select()
      .single();

    if (error) {
      playFeedback("error");
      toast({ title: "Erro ao abrir caixa", variant: "destructive" });
    } else {
      playFeedback("success");
      setRegister(data as unknown as CashRegister);
      toast({ title: "Caixa aberto!" });
    }
  };

  const addMovement = async (amount: number, type: 'in' | 'out', reason: string) => {
    if (!register) return;
    const { data, error } = await supabase
      .from("cash_movements")
      .insert({
        cash_register_id: register.id,
        amount,
        type,
        reason,
      })
      .select()
      .single();

    if (error) {
      playFeedback("error");
      toast({ title: "Erro ao registrar movimento", variant: "destructive" });
    } else {
      playFeedback("success");
      setMovements(prev => [...prev, data as unknown as CashMovement]);
      toast({ title: type === 'out' ? "Sangria registrada!" : "Reforço registrado!" });
    }
  };

  const closeRegister = async (finalAmount: number) => {
    if (!register) return;
    const { error } = await supabase
      .from("cash_register")
      .update({
        status: "closed",
        closed_at: new Date().toISOString(),
        final_amount: finalAmount,
      })
      .eq("id", register.id);

    if (error) {
      playFeedback("error");
      toast({ title: "Erro ao fechar caixa", variant: "destructive" });
    } else {
      playFeedback("success");
      setRegister(null);
      setMovements([]);
      toast({ title: "Caixa fechado!" });
    }
  };

  return { register, movements, loading, openRegister, addMovement, closeRegister, refresh: fetchRegister };
};
