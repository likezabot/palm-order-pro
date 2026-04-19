import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfDay, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, TrendingUp, ShoppingBag, DollarSign, Package, Users } from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CATEGORIES, CATEGORY_LABELS, Product } from "@/lib/types";
import { cn } from "@/lib/utils";

type Period = "today" | "7d" | "30d" | "custom";

interface OrderRow {
  id: string;
  total: number | null;
  payment_method: string | null;
  created_at: string;
  waiter_name: string | null;
  order_items: { product_name: string; quantity: number; subtotal: number; waiter_name: string | null }[];
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(var(--muted-foreground))",
];

const StatsPanel = () => {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<Period>("today");
  const [customDate, setCustomDate] = useState<Date | undefined>();
  const [waiterFilter, setWaiterFilter] = useState<string>("all");

  const periodStart = useMemo(() => {
    const now = new Date();
    if (period === "today") return startOfDay(now);
    if (period === "7d") return startOfDay(subDays(now, 6));
    if (period === "30d") return startOfDay(subDays(now, 29));
    return customDate ? startOfDay(customDate) : startOfDay(now);
  }, [period, customDate]);

  const { data: orders = [] } = useQuery({
    queryKey: ["stats-orders", periodStart.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, total, payment_method, created_at, waiter_name, order_items(product_name, quantity, subtotal, waiter_name)")
        .eq("status", "paid")
        .gte("created_at", periodStart.toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as OrderRow[];
    },
    refetchInterval: 30_000,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["stats-products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("name, category");
      if (error) throw error;
      return data as Pick<Product, "name" | "category">[];
    },
  });

  // Realtime invalidation when an order is paid
  useEffect(() => {
    const ch = supabase
      .channel("stats-orders-rt")
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "orders" }, () => {
        queryClient.invalidateQueries({ queryKey: ["stats-orders"] });
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [queryClient]);

  const productCategoryMap = useMemo(() => {
    const m = new Map<string, string>();
    products.forEach((p) => m.set(p.name, p.category));
    return m;
  }, [products]);

  // Lista de garçons disponíveis no período (para o seletor)
  const availableWaiters = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => {
      o.order_items?.forEach((i) => {
        const name = (i.waiter_name || o.waiter_name || "").trim();
        if (name) set.add(name);
      });
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [orders]);

  // Pedidos com itens filtrados pelo garçom selecionado.
  // Mantemos a estrutura de OrderRow, só descartamos itens de outros garçons.
  // KPIs baseados em ITENS (não em order.total) para refletir o filtro corretamente.
  const filteredOrders = useMemo<OrderRow[]>(() => {
    if (waiterFilter === "all") return orders;
    return orders
      .map((o) => {
        const items = (o.order_items || []).filter((i) => {
          const w = (i.waiter_name || o.waiter_name || "").trim();
          return w === waiterFilter;
        });
        if (items.length === 0) return null;
        const itemsTotal = items.reduce((s, i) => s + (i.subtotal || 0), 0);
        return { ...o, total: itemsTotal, order_items: items };
      })
      .filter((o): o is OrderRow => o !== null);
  }, [orders, waiterFilter]);

  // ===== KPIs =====
  const totalRevenue = filteredOrders.reduce((s, o) => s + (o.total || 0), 0);
  const totalOrders = filteredOrders.length;
  const totalItems = filteredOrders.reduce(
    (s, o) => s + (o.order_items?.reduce((x, i) => x + (i.quantity || 0), 0) || 0),
    0,
  );
  // Quando filtrado por garçom, "ticket médio" passa a ser por item (mais útil).
  const avgTicket = waiterFilter === "all"
    ? (totalOrders > 0 ? totalRevenue / totalOrders : 0)
    : (totalItems > 0 ? totalRevenue / totalItems : 0);

  // ===== Top 10 itens =====
  const topItems = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredOrders.forEach((o) =>
      o.order_items?.forEach((i) => {
        counts[i.product_name] = (counts[i.product_name] || 0) + (i.quantity || 0);
      }),
    );
    return Object.entries(counts)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);
  }, [filteredOrders]);

  // ===== Vendas por categoria =====
  const byCategory = useMemo(() => {
    const totals: Record<string, number> = {};
    CATEGORIES.forEach((c) => (totals[c] = 0));
    filteredOrders.forEach((o) =>
      o.order_items?.forEach((i) => {
        const cat = productCategoryMap.get(i.product_name);
        if (cat && cat in totals) totals[cat] += i.subtotal || 0;
        else totals["_outros"] = (totals["_outros"] || 0) + (i.subtotal || 0);
      }),
    );
    return Object.entries(totals)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ name: CATEGORY_LABELS[k] || "Outros", value: Number(v.toFixed(2)) }));
  }, [filteredOrders, productCategoryMap]);

  // ===== Vendas por hora =====
  // Quando filtrado por garçom, conta itens do garçom por hora (não pedidos inteiros).
  const byHour = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, h) => ({ hour: `${String(h).padStart(2, "0")}h`, pedidos: 0 }));
    filteredOrders.forEach((o) => {
      const h = new Date(o.created_at).getHours();
      if (waiterFilter === "all") {
        hours[h].pedidos += 1;
      } else {
        hours[h].pedidos += (o.order_items?.reduce((s, i) => s + (i.quantity || 0), 0) || 0);
      }
    });
    return hours;
  }, [filteredOrders, waiterFilter]);

  // ===== Forma de pagamento =====
  const byPayment = useMemo(() => {
    const totals: Record<string, number> = {};
    filteredOrders.forEach((o) => {
      const k = o.payment_method || "Não informado";
      totals[k] = (totals[k] || 0) + (o.total || 0);
    });
    const labelMap: Record<string, string> = {
      cash: "Dinheiro", pix: "PIX", card: "Cartão", credit: "Crédito", debit: "Débito",
    };
    return Object.entries(totals).map(([k, v]) => ({
      name: labelMap[k] || k,
      value: Number(v.toFixed(2)),
    }));
  }, [filteredOrders]);

  // ===== Top 5 noite/dia/semana =====
  const topByWindow = (filter: (d: Date) => boolean) => {
    const counts: Record<string, number> = {};
    filteredOrders
      .filter((o) => filter(new Date(o.created_at)))
      .forEach((o) =>
        o.order_items?.forEach((i) => {
          counts[i.product_name] = (counts[i.product_name] || 0) + (i.quantity || 0);
        }),
      );
    return Object.entries(counts)
      .map(([name, qty]) => ({ name, qty }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 5);
  };
  const topNight = useMemo(() => topByWindow((d) => d.getHours() >= 18 && d.getHours() <= 23), [filteredOrders]);
  const topDay = useMemo(() => topByWindow((d) => d.getHours() >= 11 && d.getHours() <= 17), [filteredOrders]);
  const topWeek = useMemo(() => {
    const cutoff = subDays(new Date(), 7);
    return topByWindow((d) => d >= cutoff);
  }, [filteredOrders]);

  // ===== Vendas por garçom (nível do item, fallback para waiter do pedido) =====
  const byWaiter = useMemo(() => {
    const agg: Record<string, { revenue: number; items: number }> = {};
    orders.forEach((o) => {
      o.order_items?.forEach((i) => {
        const name = (i.waiter_name || o.waiter_name || "Sem garçom").trim() || "Sem garçom";
        if (!agg[name]) agg[name] = { revenue: 0, items: 0 };
        agg[name].revenue += i.subtotal || 0;
        agg[name].items += i.quantity || 0;
      });
    });
    return Object.entries(agg)
      .map(([name, v]) => ({
        name,
        revenue: Number(v.revenue.toFixed(2)),
        items: v.items,
        avg: v.items > 0 ? Number((v.revenue / v.items).toFixed(2)) : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue);
  }, [orders]);

  const fmtBRL = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Filtro de período */}
      <div className="flex items-center gap-2 flex-wrap">
        {([
          ["today", "Hoje"],
          ["7d", "7 dias"],
          ["30d", "30 dias"],
        ] as const).map(([key, label]) => (
          <Button
            key={key}
            size="sm"
            variant={period === key ? "default" : "secondary"}
            onClick={() => setPeriod(key)}
            className="font-bold"
          >
            {label}
          </Button>
        ))}
        <Popover>
          <PopoverTrigger asChild>
            <Button
              size="sm"
              variant={period === "custom" ? "default" : "secondary"}
              className={cn("font-bold gap-1.5", !customDate && period !== "custom" && "text-muted-foreground")}
            >
              <CalendarIcon size={14} />
              {period === "custom" && customDate
                ? format(customDate, "dd/MM/yyyy", { locale: ptBR })
                : "Personalizado"}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={customDate}
              onSelect={(d) => { setCustomDate(d); if (d) setPeriod("custom"); }}
              disabled={(d) => d > new Date()}
              initialFocus
              className={cn("p-3 pointer-events-auto")}
            />
          </PopoverContent>
        </Popover>
        <span className="text-xs text-muted-foreground ml-auto">
          Atualiza a cada 30s · {filteredOrders.length} pedidos no recorte
        </span>
      </div>

      {/* Filtro por garçom */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
          <Users size={14} /> Garçom:
        </span>
        <Button
          size="sm"
          variant={waiterFilter === "all" ? "default" : "secondary"}
          onClick={() => setWaiterFilter("all")}
          className="font-bold h-8"
        >
          Todos
        </Button>
        {availableWaiters.map((w) => (
          <Button
            key={w}
            size="sm"
            variant={waiterFilter === w ? "default" : "secondary"}
            onClick={() => setWaiterFilter(w)}
            className="font-bold h-8"
          >
            {w}
          </Button>
        ))}
        {availableWaiters.length === 0 && (
          <span className="text-xs text-muted-foreground italic">Nenhum garçom no período</span>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard icon={<DollarSign className="w-4 h-4" />} label="Faturamento" value={fmtBRL(totalRevenue)} />
        <KpiCard
          icon={<ShoppingBag className="w-4 h-4" />}
          label={waiterFilter === "all" ? "Pedidos pagos" : "Pedidos atendidos"}
          value={String(totalOrders)}
        />
        <KpiCard
          icon={<TrendingUp className="w-4 h-4" />}
          label={waiterFilter === "all" ? "Ticket médio" : "Médio por item"}
          value={fmtBRL(avgTicket)}
        />
        <KpiCard icon={<Package className="w-4 h-4" />} label="Itens vendidos" value={String(totalItems)} />
      </div>

      {/* Gráficos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <ChartCard title="Top 10 itens mais vendidos">
          {topItems.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topItems} layout="vertical" margin={{ left: 20, right: 20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <YAxis type="category" dataKey="name" width={110} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Bar dataKey="qty" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} name="Quantidade" />
              </BarChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title="Vendas por categoria (R$)">
          {byCategory.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={byCategory} dataKey="value" nameKey="name" outerRadius={100} label>
                  {byCategory.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => fmtBRL(v)}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>

        <ChartCard title={waiterFilter === "all" ? "Pedidos por hora do dia" : "Itens vendidos por hora"}>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={byHour}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" fontSize={10} interval={1} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="pedidos" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        <ChartCard title="Faturamento por forma de pagamento">
          {byPayment.length === 0 ? (
            <EmptyChart />
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie data={byPayment} dataKey="value" nameKey="name" outerRadius={100} label>
                  {byPayment.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(v: number) => fmtBRL(v)}
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </div>

      {/* Top 5 listas */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <TopList title="🌙 Top 5 da noite (18h–23h)" items={topNight} />
        <TopList title="☀️ Top 5 do dia (11h–17h)" items={topDay} />
        <TopList title="📅 Top 5 da semana" items={topWeek} />
      </div>

      {/* Ranking de garçons */}
      <div className="rounded-xl bg-card border border-border p-4">
        <h3 className="font-bold text-sm mb-3 text-foreground flex items-center gap-2">
          <Users size={16} className="text-primary" /> Vendas por garçom (no período)
        </h3>
        {byWaiter.length === 0 ? (
          <p className="text-xs text-muted-foreground">Sem dados</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted-foreground text-xs uppercase tracking-wider">
                  <th className="py-2">#</th>
                  <th className="py-2">Garçom</th>
                  <th className="py-2 text-right">Itens</th>
                  <th className="py-2 text-right">Total</th>
                  <th className="py-2 text-right">Médio/item</th>
                </tr>
              </thead>
              <tbody>
                {byWaiter.map((w, i) => (
                  <tr key={w.name} className="border-t border-border">
                    <td className="py-2 font-bold text-muted-foreground">{i + 1}</td>
                    <td className="py-2 font-semibold text-foreground">{w.name}</td>
                    <td className="py-2 text-right tabular-nums">{w.items}</td>
                    <td className="py-2 text-right font-bold text-primary tabular-nums">{fmtBRL(w.revenue)}</td>
                    <td className="py-2 text-right text-muted-foreground tabular-nums">{fmtBRL(w.avg)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

const KpiCard = ({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) => (
  <div className="rounded-xl bg-card border border-border p-4">
    <div className="flex items-center gap-2 text-muted-foreground text-xs font-bold uppercase tracking-wider">
      {icon} {label}
    </div>
    <div className="mt-2 text-2xl font-black text-foreground">{value}</div>
  </div>
);

const ChartCard = ({ title, children }: { title: string; children: React.ReactNode }) => (
  <div className="rounded-xl bg-card border border-border p-4">
    <h3 className="font-bold text-sm mb-3 text-foreground">{title}</h3>
    {children}
  </div>
);

const EmptyChart = () => (
  <div className="h-[300px] flex items-center justify-center text-sm text-muted-foreground">
    Sem dados no período
  </div>
);

const TopList = ({ title, items }: { title: string; items: { name: string; qty: number }[] }) => (
  <div className="rounded-xl bg-card border border-border p-4">
    <h3 className="font-bold text-sm mb-3 text-foreground">{title}</h3>
    {items.length === 0 ? (
      <p className="text-xs text-muted-foreground">Sem dados</p>
    ) : (
      <ol className="space-y-2">
        {items.map((it, i) => (
          <li key={it.name} className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-2 min-w-0">
              <span className="w-5 h-5 rounded-full bg-primary/10 text-primary text-[10px] font-black flex items-center justify-center shrink-0">
                {i + 1}
              </span>
              <span className="truncate">{it.name}</span>
            </span>
            <span className="font-bold text-foreground tabular-nums">{it.qty}</span>
          </li>
        ))}
      </ol>
    )}
  </div>
);

export default StatsPanel;
