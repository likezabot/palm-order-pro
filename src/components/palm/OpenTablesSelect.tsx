import { useState, useEffect } from "react";
import { ArrowLeft, Search, Users, Clock, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface OpenTable {
  id: string;
  table_name: string;
  waiter_name: string | null;
  total: number;
  status: string;
  created_at: string;
}

interface Props {
  onSelect: (tableName: string) => void;
  onBack: () => void;
}

const OpenTablesSelect = ({ onSelect, onBack }: Props) => {
  const [tables, setTables] = useState<OpenTable[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    fetchOpenTables();
  }, []);

  const fetchOpenTables = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("orders")
        .select("id, table_name, waiter_name, total, status, created_at")
        .in("status", ["new", "preparing"])
        .order("created_at", { ascending: false });

      if (error) throw error;
      
      // Group by table name to show only one entry per table if multiple orders exist
      // or just show all active orders. The requirement says "mesas abertas".
      // Usually, if there are multiple "new/preparing" orders for the same table, 
      // they should probably be grouped or we just show them as separate "orders" on that table.
      // For simplicity and following the prompt "Mesa X — Garçom: João", 
      // I will show the orders.
      setTables(data || []);
    } catch (error) {
      console.error("Error fetching open tables:", error);
    } finally {
      setLoading(false);
    }
  };

  const filteredTables = tables.filter((t) =>
    t.table_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.waiter_name && t.waiter_name.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const getStatusColor = (status: string) => {
    switch (status) {
      case "new":
        return "bg-blue-500/10 text-blue-500 border-blue-500/20";
      case "preparing":
        return "bg-amber-500/10 text-amber-500 border-amber-500/20";
      default:
        return "bg-gray-500/10 text-gray-500 border-gray-500/20";
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case "new":
        return "Novo";
      case "preparing":
        return "Preparando";
      default:
        return status;
    }
  };

  return (
    <div className="flex min-h-screen flex-col p-4 bg-background">
      <header className="sticky top-0 z-10 bg-background pb-4 pt-2">
        <button
          onClick={onBack}
          className="flex items-center gap-2 text-muted-foreground mb-4 text-base"
        >
          <ArrowLeft size={20} /> Voltar
        </button>
        <h1 className="text-2xl font-bold text-primary mb-4">MESAS ABERTAS</h1>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={18} />
          <input
            type="text"
            placeholder="Buscar mesa ou garçom..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full rounded-xl border border-border bg-card p-3 pl-10 text-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
          />
        </div>
      </header>

      <div className="flex flex-1 flex-col gap-3 overflow-y-auto pb-20">
        {loading ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        ) : filteredTables.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center text-muted-foreground gap-2">
            <Receipt size={48} className="opacity-20" />
            <p className="text-lg font-medium">Nenhuma mesa aberta encontrada</p>
          </div>
        ) : (
          filteredTables.map((table) => (
            <button
              key={table.id}
              onClick={() => onSelect(table.table_name)}
              className="flex flex-col gap-3 rounded-xl bg-card border border-border p-4 text-left transition-all duration-150 active:scale-[0.98] hover:bg-secondary/30"
            >
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold text-foreground">Mesa {table.table_name}</span>
                <Badge className={getStatusColor(table.status)} variant="outline">
                  {getStatusLabel(table.status)}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Users size={14} className="text-primary" />
                  <span className="truncate">{table.waiter_name || "Não informado"}</span>
                </div>
                <div className="flex items-center gap-2 justify-end">
                  <Clock size={14} className="text-primary" />
                  <span>{format(new Date(table.created_at), "HH:mm", { locale: ptBR })}</span>
                </div>
                <div className="flex items-center gap-2 font-bold text-primary col-span-2 mt-1">
                  <Receipt size={14} />
                  <span>R$ {Number(table.total).toFixed(2)}</span>
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
};

export default OpenTablesSelect;
