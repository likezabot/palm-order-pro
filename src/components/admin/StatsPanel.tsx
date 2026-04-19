import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfDay, subDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  CalendarIcon,
  TrendingUp,
  ShoppingBag,
  DollarSign,
  Package,
  Users,
  Crown,
  Download,
  ArrowUpDown,
  Trophy,
  ArrowUp,
  ArrowDown,
  Minus,
} from "lucide-react";
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
import { Progress } from "@/components/ui/progress";
import { CATEGORIES, CATEGORY_LABELS, Product } from "@/lib/types";
import { cn } from "@/lib/utils";

type Period = "today" | "7d" | "30d" | "custom";

interface OrderItemRow {
  product_name: string;
  product_id: string | null;
  quantity: number;
  subtotal: number;
  waiter_name: string | null;
}

interface OrderRow {
  id: string;
  table_name: string;
  total: number | null;
  payment_method: string | null;
  created_at: string;
  waiter_name: string | null;
  order_items: OrderItemRow[];
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(var(--muted-foreground))",
];

// Paleta para garçons (até ~10). Usa tokens HSL semânticos com leves variações de luminosidade.
const WAITER_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(217 91% 60%)",
  "hsl(280 65% 60%)",
  "hsl(160 60% 45%)",
  "hsl(35 90% 55%)",
  "hsl(330 75% 60%)",
  "hsl(190 70% 50%)",
];

type SortKey = "name" | "items" | "tables" | "revenue" | "avg" | "avgPerTable" | "share";
type SortDir = "asc" | "desc";

const StatsPanel = () => {
  const queryClient = useQueryClient();
  const [period, setPeriod] = useState<Period>("today");
  const [customDate, setCustomDate] = useState<Date | undefined>();
  const [waiterFilter, setWaiterFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const periodStart = useMemo(() => {
    const now = new Date();
    if (period === "today") return startOfDay(now);
    if (period === "7d") return startOfDay(subDays(now, 6));
    if (period === "30d") return startOfDay(subDays(now, 29));
    return customDate ? startOfDay(customDate) : startOfDay(now);
  }, [period, customDate]);

  // Período anterior equivalente: mesmo tamanho, terminando logo antes de periodStart
  const { prevStart, prevEnd, prevLabel } = useMemo(() => {
    let days = 1;
    if (period === "7d") days = 7;
    else if (period === "30d") days = 30;
    else if (period === "custom") days = 1;
    const end = periodStart; // exclusivo
    const start = subDays(periodStart, days);
    const label =
      period === "today" ? "vs ontem"
      : period === "7d" ? "vs 7d anteriores"
      : period === "30d" ? "vs 30d anteriores"
      : "vs dia anterior";
    return { prevStart: start, prevEnd: end, prevLabel: label };
  }, [period, periodStart]);

  const { data: orders = [] } = useQuery({
    queryKey: ["stats-orders", periodStart.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, table_name, total, payment_method, created_at, waiter_name, order_items(product_name, product_id, quantity, subtotal, waiter_name)")
        .eq("status", "paid")
        .gte("created_at", periodStart.toISOString())
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as OrderRow[];
    },
    refetchInterval: 30_000,
  });

  const { data: prevOrders = [] } = useQuery({
    queryKey: ["stats-orders-prev", prevStart.toISOString(), prevEnd.toISOString()],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select("id, table_name, total, created_at, waiter_name, order_items(product_name, product_id, quantity, subtotal, waiter_name)")
        .eq("status", "paid")
        .gte("created_at", prevStart.toISOString())
        .lt("created_at", prevEnd.toISOString());
      if (error) throw error;
      return (data || []) as OrderRow[];
    },
    refetchInterval: 60_000,
  });

  const { data: products = [] } = useQuery({
    queryKey: ["stats-products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("id, name, category");
      if (error) throw error;
      return data as (Pick<Product, "name" | "category"> & { id: string })[];
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

  const productCategoryByName = useMemo(() => {
    const m = new Map<string, string>();
    products.forEach((p) => m.set(p.name, p.category));
    return m;
  }, [products]);

  const productCategoryById = useMemo(() => {
    const m = new Map<string, string>();
    products.forEach((p) => m.set(p.id, p.category));
    return m;
  }, [products]);

  const getItemCategory = (i: OrderItemRow) =>
    (i.product_id && productCategoryById.get(i.product_id)) ||
    productCategoryByName.get(i.product_name) ||
    "_outros";

  // Lista de garçons disponíveis no período
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

  // Pedidos com itens filtrados pelo garçom selecionado
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
  const avgTicket = waiterFilter === "all"
    ? (totalOrders > 0 ? totalRevenue / totalOrders : 0)
    : (totalItems > 0 ? totalRevenue / totalItems : 0);

  // KPIs do período anterior (respeitam o filtro de garçom)
  const prevKpis = useMemo(() => {
    let revenue = 0;
    let items = 0;
    let ordersCount = 0;
    prevOrders.forEach((o) => {
      const matchingItems = waiterFilter === "all"
        ? (o.order_items || [])
        : (o.order_items || []).filter((i) => ((i.waiter_name || o.waiter_name || "").trim()) === waiterFilter);
      if (matchingItems.length === 0) return;
      ordersCount += 1;
      matchingItems.forEach((i) => {
        revenue += i.subtotal || 0;
        items += i.quantity || 0;
      });
    });
    const avg = waiterFilter === "all"
      ? (ordersCount > 0 ? revenue / ordersCount : 0)
      : (items > 0 ? revenue / items : 0);
    return { revenue, items, orders: ordersCount, avg };
  }, [prevOrders, waiterFilter]);

  const calcDeltaPct = (current: number, previous: number): number | null => {
    if (previous <= 0) return current > 0 ? Infinity : null;
    return ((current - previous) / previous) * 100;
  };

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
        const cat = getItemCategory(i);
        if (cat in totals) totals[cat] += i.subtotal || 0;
        else totals["_outros"] = (totals["_outros"] || 0) + (i.subtotal || 0);
      }),
    );
    return Object.entries(totals)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => ({ name: CATEGORY_LABELS[k] || "Outros", value: Number(v.toFixed(2)) }));
  }, [filteredOrders, productCategoryById, productCategoryByName]);

  // ===== Vendas por hora =====
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

  // ===== Top windows =====
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

  // ===== Agregação rica por garçom (sempre considera TODOS os pedidos do período, ignora waiterFilter) =====
  interface WaiterAgg {
    name: string;
    revenue: number;
    items: number;
    tables: Set<string>;
    categoryTotals: Record<string, number>;
    productCounts: Record<string, number>;
    productRevenue: Record<string, number>;
    hourly: number[]; // 24 buckets, revenue
  }

  const waiterAggMap = useMemo(() => {
    const map = new Map<string, WaiterAgg>();
    orders.forEach((o) => {
      const hour = new Date(o.created_at).getHours();
      o.order_items?.forEach((i) => {
        const name = (i.waiter_name || o.waiter_name || "Sem garçom").trim() || "Sem garçom";
        if (!map.has(name)) {
          map.set(name, {
            name,
            revenue: 0,
            items: 0,
            tables: new Set(),
            categoryTotals: {},
            productCounts: {},
            productRevenue: {},
            hourly: Array(24).fill(0),
          });
        }
        const w = map.get(name)!;
        w.revenue += i.subtotal || 0;
        w.items += i.quantity || 0;
        w.tables.add(o.table_name);
        const cat = getItemCategory(i);
        w.categoryTotals[cat] = (w.categoryTotals[cat] || 0) + (i.subtotal || 0);
        w.productCounts[i.product_name] = (w.productCounts[i.product_name] || 0) + (i.quantity || 0);
        w.productRevenue[i.product_name] = (w.productRevenue[i.product_name] || 0) + (i.subtotal || 0);
        w.hourly[hour] += i.subtotal || 0;
      });
    });
    return map;
  }, [orders, productCategoryById, productCategoryByName]);

  const grandTotal = useMemo(
    () => Array.from(waiterAggMap.values()).reduce((s, w) => s + w.revenue, 0),
    [waiterAggMap],
  );

  // ===== Período anterior: agregações para comparação =====
  const prevWaiterRevenue = useMemo(() => {
    const map = new Map<string, number>();
    prevOrders.forEach((o) => {
      o.order_items?.forEach((i) => {
        const name = (i.waiter_name || o.waiter_name || "Sem garçom").trim() || "Sem garçom";
        map.set(name, (map.get(name) || 0) + (i.subtotal || 0));
      });
    });
    return map;
  }, [prevOrders]);

  const prevTotals = useMemo(() => {
    let revenue = 0;
    let items = 0;
    prevOrders.forEach((o) => {
      revenue += o.total || 0;
      o.order_items?.forEach((i) => { items += i.quantity || 0; });
    });
    return { revenue, items, orders: prevOrders.length };
  }, [prevOrders]);

  // (calcDeltaPct definido acima é reutilizado abaixo)

  interface WaiterRow {
    name: string;
    revenue: number;
    items: number;
    tables: number;
    avg: number; // por item
    avgPerTable: number;
    share: number; // %
    topCategory: string;
    top3: { name: string; qty: number; revenue: number }[];
    prevRevenue: number;
    revenueDelta: number | null;
  }

  const waiterRows = useMemo<WaiterRow[]>(() => {
    return Array.from(waiterAggMap.values()).map((w) => {
      const tables = w.tables.size;
      const topCatEntry = Object.entries(w.categoryTotals).sort((a, b) => b[1] - a[1])[0];
      const topCategory = topCatEntry ? (CATEGORY_LABELS[topCatEntry[0]] || "Outros") : "—";
      const top3 = Object.entries(w.productCounts)
        .map(([name, qty]) => ({ name, qty, revenue: w.productRevenue[name] || 0 }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 3);
      const prevRevenue = prevWaiterRevenue.get(w.name) || 0;
      return {
        name: w.name,
        revenue: Number(w.revenue.toFixed(2)),
        items: w.items,
        tables,
        avg: w.items > 0 ? Number((w.revenue / w.items).toFixed(2)) : 0,
        avgPerTable: tables > 0 ? Number((w.revenue / tables).toFixed(2)) : 0,
        share: grandTotal > 0 ? Number(((w.revenue / grandTotal) * 100).toFixed(1)) : 0,
        topCategory,
        top3,
        prevRevenue,
        revenueDelta: calcDelta(w.revenue, prevRevenue),
      };
    });
  }, [waiterAggMap, grandTotal, prevWaiterRevenue]);

  const sortedWaiterRows = useMemo(() => {
    const rows = [...waiterRows];
    rows.sort((a, b) => {
      const dir = sortDir === "asc" ? 1 : -1;
      const va = a[sortKey];
      const vb = b[sortKey];
      if (typeof va === "string" && typeof vb === "string") return va.localeCompare(vb, "pt-BR") * dir;
      return ((va as number) - (vb as number)) * dir;
    });
    return rows;
  }, [waiterRows, sortKey, sortDir]);

  const topByRevenue = useMemo(() => [...waiterRows].sort((a, b) => b.revenue - a.revenue), [waiterRows]);
  const champion = topByRevenue[0];
  const runnerUp = topByRevenue[1];
  const championLead = champion && runnerUp && runnerUp.revenue > 0
    ? Number((((champion.revenue - runnerUp.revenue) / runnerUp.revenue) * 100).toFixed(1))
    : null;
  const avgPerWaiter = waiterRows.length > 0 ? grandTotal / waiterRows.length : 0;

  // ===== Stacked hourly revenue por garçom =====
  const stackedHourly = useMemo(() => {
    const aggs = Array.from(waiterAggMap.values());
    return Array.from({ length: 24 }, (_, h) => {
      const row: Record<string, string | number> = { hour: `${String(h).padStart(2, "0")}h` };
      aggs.forEach((w) => {
        row[w.name] = Number(w.hourly[h].toFixed(2));
      });
      return row;
    });
  }, [waiterAggMap]);

  const waiterColorMap = useMemo(() => {
    const map = new Map<string, string>();
    topByRevenue.forEach((w, i) => map.set(w.name, WAITER_COLORS[i % WAITER_COLORS.length]));
    return map;
  }, [topByRevenue]);

  const fmtBRL = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const periodLabel = period === "today" ? "Hoje"
    : period === "7d" ? "Últimos 7 dias"
    : period === "30d" ? "Últimos 30 dias"
    : customDate ? format(customDate, "dd/MM/yyyy", { locale: ptBR }) : "Personalizado";

  const exportCSV = () => {
    const header = ["#", "Garçom", "Itens", "Mesas", "Total (R$)", "Médio/item (R$)", "Médio/mesa (R$)", "% faturamento", "Top categoria"];
    const rows = sortedWaiterRows.map((w, i) => [
      i + 1,
      w.name,
      w.items,
      w.tables,
      w.revenue.toFixed(2).replace(".", ","),
      w.avg.toFixed(2).replace(".", ","),
      w.avgPerTable.toFixed(2).replace(".", ","),
      `${w.share.toFixed(1).replace(".", ",")}%`,
      w.topCategory,
    ]);
    const csv = [
      `Período: ${periodLabel}`,
      "",
      header.join(";"),
      ...rows.map((r) => r.join(";")),
    ].join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `vendas-garcons-${format(new Date(), "yyyy-MM-dd-HHmm")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

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

      {/* ============ BLOCO DE GARÇONS ============ */}
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-lg font-black text-foreground flex items-center gap-2">
            <Users size={20} className="text-primary" /> Desempenho dos Garçons
          </h2>
          <Button size="sm" variant="secondary" onClick={exportCSV} className="gap-1.5 font-bold" disabled={waiterRows.length === 0}>
            <Download size={14} /> Exportar CSV
          </Button>
        </div>

        {/* Chips de KPI rápidos */}
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <KpiCard
            icon={<Users className="w-4 h-4" />}
            label="Garçons ativos"
            value={String(waiterRows.length)}
          />
          <KpiCard
            icon={<DollarSign className="w-4 h-4" />}
            label="Média por garçom"
            value={fmtBRL(avgPerWaiter)}
          />
          <KpiCard
            icon={<Trophy className="w-4 h-4" />}
            label="Vantagem do líder"
            value={championLead !== null ? `+${championLead.toString().replace(".", ",")}%` : "—"}
          />
        </div>

        {/* Card destaque: Garçom do período */}
        {champion && (
          <div className="rounded-xl border border-primary/40 bg-gradient-to-br from-primary/10 via-card to-card p-5 flex items-center gap-4 flex-wrap">
            <div className="w-16 h-16 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-2xl font-black shrink-0 relative">
              {champion.name.charAt(0).toUpperCase()}
              <Crown className="absolute -top-2 -right-2 w-6 h-6 text-warning fill-warning" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-xs font-bold uppercase tracking-wider text-primary">Destaque do período</div>
              <div className="text-2xl font-black text-foreground truncate">{champion.name}</div>
              <div className="text-sm text-muted-foreground">
                {champion.items} itens · {champion.tables} {champion.tables === 1 ? "mesa" : "mesas"} · top em {champion.topCategory}
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-black text-primary tabular-nums">{fmtBRL(champion.revenue)}</div>
              <div className="text-xs font-bold text-muted-foreground">
                {champion.share.toString().replace(".", ",")}% do faturamento
              </div>
            </div>
          </div>
        )}

        {/* Gráfico empilhado: vendas por hora por garçom */}
        {waiterRows.length > 0 && (
          <ChartCard title="Vendas por garçom ao longo do dia (R$)">
            <div className="overflow-x-auto">
              <div style={{ minWidth: 600 }}>
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={stackedHourly}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="hour" stroke="hsl(var(--muted-foreground))" fontSize={10} interval={1} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickFormatter={(v) => `R$${v}`} />
                    <Tooltip
                      formatter={(v: number) => fmtBRL(v)}
                      contentStyle={{
                        background: "hsl(var(--card))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {topByRevenue.map((w) => (
                      <Bar
                        key={w.name}
                        dataKey={w.name}
                        stackId="waiters"
                        fill={waiterColorMap.get(w.name)}
                        radius={[2, 2, 0, 0]}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </ChartCard>
        )}

        {/* Top 3 itens por garçom */}
        {waiterRows.length > 0 && (
          <div>
            <h3 className="font-bold text-sm mb-3 text-foreground">
              {waiterFilter === "all" ? "Top 3 itens por garçom" : `Top 3 itens de ${waiterFilter}`}
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {(waiterFilter === "all" ? topByRevenue : waiterRows.filter((w) => w.name === waiterFilter)).map((w) => (
                <div key={w.name} className="rounded-xl bg-card border border-border p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-black text-primary-foreground shrink-0"
                      style={{ background: waiterColorMap.get(w.name) || "hsl(var(--primary))" }}
                    >
                      {w.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="font-bold text-sm text-foreground truncate">{w.name}</div>
                  </div>
                  {w.top3.length === 0 ? (
                    <p className="text-xs text-muted-foreground">Sem itens</p>
                  ) : (
                    <ol className="space-y-1.5">
                      {w.top3.map((it, i) => (
                        <li key={it.name} className="flex items-center justify-between text-xs gap-2">
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="w-4 h-4 rounded-full bg-primary/10 text-primary text-[9px] font-black flex items-center justify-center shrink-0">
                              {i + 1}
                            </span>
                            <span className="truncate">{it.name}</span>
                          </span>
                          <span className="font-bold text-foreground tabular-nums shrink-0">{it.qty}x</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Ranking expandido */}
        <div className="rounded-xl bg-card border border-border p-4">
          <h3 className="font-bold text-sm mb-3 text-foreground flex items-center gap-2">
            <Trophy size={16} className="text-primary" /> Ranking de vendas por garçom
          </h3>
          {sortedWaiterRows.length === 0 ? (
            <p className="text-xs text-muted-foreground">Sem dados</p>
          ) : (
            <>
              {/* Tabela (desktop) */}
              <div className="overflow-x-auto hidden sm:block">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted-foreground text-xs uppercase tracking-wider">
                      <th className="py-2 w-8">#</th>
                      <SortHeader label="Garçom" k="name" sortKey={sortKey} sortDir={sortDir} onClick={handleSort} />
                      <SortHeader label="Itens" k="items" sortKey={sortKey} sortDir={sortDir} onClick={handleSort} align="right" />
                      <SortHeader label="Mesas" k="tables" sortKey={sortKey} sortDir={sortDir} onClick={handleSort} align="right" />
                      <SortHeader label="Total" k="revenue" sortKey={sortKey} sortDir={sortDir} onClick={handleSort} align="right" />
                      <SortHeader label="Médio/item" k="avg" sortKey={sortKey} sortDir={sortDir} onClick={handleSort} align="right" />
                      <SortHeader label="Médio/mesa" k="avgPerTable" sortKey={sortKey} sortDir={sortDir} onClick={handleSort} align="right" />
                      <SortHeader label="% fat." k="share" sortKey={sortKey} sortDir={sortDir} onClick={handleSort} align="left" />
                      <th className="py-2">Top categoria</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedWaiterRows.map((w, i) => (
                      <tr key={w.name} className="border-t border-border">
                        <td className="py-2 font-bold text-muted-foreground">{i + 1}</td>
                        <td className="py-2 font-semibold text-foreground">
                          <div className="flex items-center gap-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ background: waiterColorMap.get(w.name) || "hsl(var(--muted))" }}
                            />
                            {w.name}
                          </div>
                        </td>
                        <td className="py-2 text-right tabular-nums">{w.items}</td>
                        <td className="py-2 text-right tabular-nums">{w.tables}</td>
                        <td className="py-2 text-right font-bold text-primary tabular-nums">{fmtBRL(w.revenue)}</td>
                        <td className="py-2 text-right text-muted-foreground tabular-nums">{fmtBRL(w.avg)}</td>
                        <td className="py-2 text-right text-muted-foreground tabular-nums">{fmtBRL(w.avgPerTable)}</td>
                        <td className="py-2 min-w-[120px]">
                          <div className="flex items-center gap-2">
                            <Progress value={w.share} className="h-1.5 flex-1" />
                            <span className="text-xs font-bold tabular-nums w-10 text-right">
                              {w.share.toString().replace(".", ",")}%
                            </span>
                          </div>
                        </td>
                        <td className="py-2 text-xs text-muted-foreground">{w.topCategory}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Cards (mobile) */}
              <div className="space-y-2 sm:hidden">
                {sortedWaiterRows.map((w, i) => (
                  <div key={w.name} className="rounded-lg border border-border p-3 bg-background/50">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-xs font-bold text-muted-foreground">#{i + 1}</span>
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: waiterColorMap.get(w.name) || "hsl(var(--muted))" }}
                        />
                        <span className="font-bold text-foreground truncate">{w.name}</span>
                      </div>
                      <span className="font-black text-primary tabular-nums">{fmtBRL(w.revenue)}</span>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <div>Itens: <span className="font-bold text-foreground tabular-nums">{w.items}</span></div>
                      <div>Mesas: <span className="font-bold text-foreground tabular-nums">{w.tables}</span></div>
                      <div>Médio/item: <span className="font-bold text-foreground tabular-nums">{fmtBRL(w.avg)}</span></div>
                      <div>Médio/mesa: <span className="font-bold text-foreground tabular-nums">{fmtBRL(w.avgPerTable)}</span></div>
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <Progress value={w.share} className="h-1.5 flex-1" />
                      <span className="text-[10px] font-bold tabular-nums w-10 text-right">
                        {w.share.toString().replace(".", ",")}%
                      </span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-1">Top: {w.topCategory}</div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
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

const SortHeader = ({
  label, k, sortKey, sortDir, onClick, align = "left",
}: {
  label: string;
  k: SortKey;
  sortKey: SortKey;
  sortDir: SortDir;
  onClick: (k: SortKey) => void;
  align?: "left" | "right";
}) => {
  const active = sortKey === k;
  return (
    <th className={cn("py-2 select-none", align === "right" && "text-right")}>
      <button
        onClick={() => onClick(k)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground transition-colors",
          active && "text-foreground",
        )}
      >
        {label}
        <ArrowUpDown size={11} className={cn("opacity-50", active && "opacity-100")} />
        {active && <span className="text-[9px]">{sortDir === "asc" ? "↑" : "↓"}</span>}
      </button>
    </th>
  );
};

export default StatsPanel;
