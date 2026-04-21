import { useEffect, useState } from "react";
import { Clock, ChevronDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useElapsedTime } from "@/hooks/use-elapsed-time";

interface FlatItem {
  key: string;
  product_name: string;
  quantity: number;
  table_name: string;
  waiter_name: string | null;
  updated_at: string;
}

function ItemRow({ item }: { item: FlatItem }) {
  const elapsed = useElapsedTime(item.updated_at);
  return (
    <div className="flex items-center gap-2 py-2 border-b border-border/50 last:border-b-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-foreground">
            {item.quantity}x {item.product_name}
          </span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-secondary text-secondary-foreground">
            {item.table_name}
          </span>
        </div>
        {item.waiter_name && (
          <p className="text-xs text-muted-foreground mt-0.5">
            por {item.waiter_name}
          </p>
        )}
      </div>
      <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
        {elapsed}
      </span>
    </div>
  );
}

export function RecentItemsList() {
  const [items, setItems] = useState<FlatItem[]>([]);
  const [loading, setLoading] = useState(false);

  async function fetchItems() {
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select("id, table_name, waiter_name, updated_at, status, order_items(product_name, quantity, waiter_name)")
      .in("status", ["new", "preparing", "done"])
      .order("updated_at", { ascending: false })
      .limit(20);

    if (error || !data) {
      setLoading(false);
      return;
    }

    const flat: FlatItem[] = [];
    for (const order of data) {
      const orderItems = (order.order_items as any[]) || [];
      for (let i = 0; i < orderItems.length; i++) {
        const it = orderItems[i];
        flat.push({
          key: `${order.id}-${i}`,
          product_name: it.product_name,
          quantity: it.quantity,
          table_name: order.table_name,
          waiter_name: it.waiter_name || order.waiter_name,
          updated_at: order.updated_at,
        });
        if (flat.length >= 30) break;
      }
      if (flat.length >= 30) break;
    }
    setItems(flat);
    setLoading(false);
  }

  useEffect(() => {
    fetchItems();
    const id = setInterval(fetchItems, 15_000);
    return () => clearInterval(id);
  }, []);

  if (loading && items.length === 0) {
    return <p className="text-xs text-muted-foreground py-4 text-center">Carregando…</p>;
  }
  if (items.length === 0) {
    return (
      <p className="text-xs text-muted-foreground py-4 text-center">
        Nenhum pedido em andamento.
      </p>
    );
  }
  return (
    <div>
      {items.map((it) => (
        <ItemRow key={it.key} item={it} />
      ))}
    </div>
  );
}

export function RecentItemsPanel() {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<FlatItem[]>([]);
  const [loading, setLoading] = useState(false);

  async function fetchItems() {
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select("id, table_name, waiter_name, updated_at, status, order_items(product_name, quantity, waiter_name)")
      .in("status", ["new", "preparing", "done"])
      .order("updated_at", { ascending: false })
      .limit(20);

    if (error || !data) {
      setLoading(false);
      return;
    }

    const flat: FlatItem[] = [];
    for (const order of data) {
      const orderItems = (order.order_items as any[]) || [];
      for (let i = 0; i < orderItems.length; i++) {
        const it = orderItems[i];
        flat.push({
          key: `${order.id}-${i}`,
          product_name: it.product_name,
          quantity: it.quantity,
          table_name: order.table_name,
          waiter_name: it.waiter_name || order.waiter_name,
          updated_at: order.updated_at,
        });
        if (flat.length >= 30) break;
      }
      if (flat.length >= 30) break;
    }
    setItems(flat);
    setLoading(false);
  }

  useEffect(() => {
    if (!open) return;
    fetchItems();
    const id = setInterval(fetchItems, 15_000);
    return () => clearInterval(id);
  }, [open]);

  return (
    <div className="w-full max-w-sm rounded-lg border border-border bg-card overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 p-4 active:bg-secondary/50 transition-colors"
      >
        <Clock className="h-5 w-5 text-primary shrink-0" />
        <span className="font-semibold text-card-foreground text-sm flex-1 text-left">
          Últimos lançamentos
        </span>
        <ChevronDown
          className={`h-4 w-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="px-4 pb-3 max-h-[60vh] overflow-y-auto">
          {loading && items.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">Carregando…</p>
          ) : items.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">
              Nenhum pedido em andamento.
            </p>
          ) : (
            <div>
              {items.map((it) => (
                <ItemRow key={it.key} item={it} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
