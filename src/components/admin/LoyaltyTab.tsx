/**
 * Aba "Fidelidade" do Admin.
 * - Toggle global loyalty_enabled.
 * - CRUD simples de brindes.
 * - Busca cliente por telefone + ajuste manual com observação obrigatória.
 * - Top 20 clientes por saldo.
 * Protegido pelo StaffGate herdado de /admin.
 */
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Gift, Plus, Trash2, Search, Sparkles, Phone, AlertTriangle, Truck, Info } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

type Reward = {
  id: string;
  restaurant_id: string;
  product_id: string | null;
  product_name: string | null;
  product_price: number | null;
  display_name: string;
  points_cost: number;
  min_order_subtotal: number;
  active: boolean;
  sort_order: number;
  effective_cost_per_point: number | null;
};

type CustomerInfo = {
  found: boolean;
  phone?: string;
  balance?: number;
  total_earned?: number;
  last_customer_name?: string | null;
  history?: Array<{
    id: string;
    kind: string;
    points: number;
    order_id: string | null;
    admin_note: string | null;
    created_at: string;
  }>;
};

export default function LoyaltyTab() {
  const qc = useQueryClient();
  const { toast } = useToast();

  const restaurantQuery = useQuery({
    queryKey: ["loyalty-restaurant"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("restaurants")
        .select("id, slug, name")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const restaurantId = restaurantQuery.data?.id ?? null;

  const enabledQuery = useQuery({
    queryKey: ["loyalty-enabled"],
    queryFn: async () => {
      const { data } = await supabase
        .from("settings")
        .select("value")
        .eq("key", "loyalty_enabled")
        .maybeSingle();
      return data?.value === "true";
    },
  });

  const rewardsQuery = useQuery({
    queryKey: ["loyalty-rewards", restaurantId],
    enabled: !!restaurantId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "admin_loyalty_list_rewards" as never,
        { p_restaurant_id: restaurantId } as never,
      );
      if (error) throw error;
      return (data ?? []) as unknown as Reward[];
    },
  });

  const topQuery = useQuery({
    queryKey: ["loyalty-top"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc(
        "admin_loyalty_top_customers" as never,
        { p_limit: 20 } as never,
      );
      if (error) throw error;
      return (data ?? []) as unknown as Array<{
        phone: string;
        balance: number;
        total_earned: number;
        last_customer_name: string | null;
      }>;
    },
  });

  // ===== Toggle =====
  async function toggleEnabled(v: boolean) {
    const { error } = await supabase.rpc(
      "admin_loyalty_set_enabled" as never,
      { p_enabled: v } as never,
    );
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["loyalty-enabled"] });
    toast({ title: v ? "Fidelidade ativada" : "Fidelidade desativada" });
  }

  const [seeding, setSeeding] = useState(false);
  async function seedDefaults() {
    setSeeding(true);
    const { error } = await supabase.rpc(
      "admin_loyalty_seed_default_rewards" as never,
    );
    setSeeding(false);
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["loyalty-rewards", restaurantId] });
    toast({ title: "Brindes padrão criados/atualizados" });
  }

  // ===== CRUD brinde =====
  const [form, setForm] = useState<{
    id: string | null;
    display_name: string;
    points_cost: string;
    min_order_subtotal: string;
    sort_order: string;
    active: boolean;
    product_id: string;
  }>({
    id: null,
    display_name: "",
    points_cost: "100",
    min_order_subtotal: "0",
    sort_order: "0",
    active: true,
    product_id: "",
  });

  function resetForm() {
    setForm({
      id: null,
      display_name: "",
      points_cost: "100",
      min_order_subtotal: "0",
      sort_order: "0",
      active: true,
      product_id: "",
    });
  }

  async function saveReward() {
    if (!restaurantId) return;
    if (!form.display_name.trim()) {
      toast({ title: "Nome obrigatório", variant: "destructive" });
      return;
    }
    const points = Number(form.points_cost) || 0;
    const minSub = Number(form.min_order_subtotal) || 0;
    if (points < 100) {
      toast({
        title: "Pontuação mínima para brinde é 100 pontos",
        variant: "destructive",
      });
      return;
    }
    if (minSub > 80) {
      toast({
        title: "Compra mínima máxima é R$ 80,00",
        variant: "destructive",
      });
      return;
    }
    const { error } = await supabase.rpc(
      "admin_loyalty_upsert_reward" as never,
      {
        p_id: form.id,
        p_restaurant_id: restaurantId,
        p_display_name: form.display_name.trim(),
        p_points_cost: points,
        p_min_order_subtotal: minSub,
        p_active: form.active,
        p_sort_order: Number(form.sort_order) || 0,
        p_product_id: form.product_id || null,
      } as never,
    );
    if (error) {
      let friendly = error.message;
      if (friendly.includes("points_cost_min_100"))
        friendly = "Pontuação mínima para brinde é 100 pontos";
      else if (friendly.includes("min_subtotal_max_80"))
        friendly = "Compra mínima máxima é R$ 80,00";
      toast({ title: "Erro ao salvar", description: friendly, variant: "destructive" });
      return;
    }
    resetForm();
    qc.invalidateQueries({ queryKey: ["loyalty-rewards"] });
    toast({ title: "Brinde salvo" });
  }

  async function deleteReward(id: string) {
    if (!confirm("Excluir este brinde?")) return;
    const { error } = await supabase.rpc(
      "admin_loyalty_delete_reward" as never,
      { p_id: id } as never,
    );
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    qc.invalidateQueries({ queryKey: ["loyalty-rewards"] });
  }

  function editReward(r: Reward) {
    setForm({
      id: r.id,
      display_name: r.display_name,
      points_cost: String(r.points_cost),
      min_order_subtotal: String(r.min_order_subtotal),
      sort_order: String(r.sort_order),
      active: r.active,
      product_id: r.product_id ?? "",
    });
  }

  // ===== Busca cliente / ajuste =====
  const [searchPhone, setSearchPhone] = useState("");
  const [customer, setCustomer] = useState<CustomerInfo | null>(null);
  const [adjustPoints, setAdjustPoints] = useState("");
  const [adjustNote, setAdjustNote] = useState("");

  async function doSearch() {
    if (!searchPhone.trim()) return;
    const { data, error } = await supabase.rpc(
      "admin_loyalty_search_customer" as never,
      { p_phone: searchPhone } as never,
    );
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setCustomer(data as unknown as CustomerInfo);
  }

  async function doAdjust() {
    const pts = Number(adjustPoints);
    if (!pts) {
      toast({ title: "Informe pontos (positivo ou negativo)", variant: "destructive" });
      return;
    }
    if (!adjustNote.trim()) {
      toast({ title: "Observação obrigatória", variant: "destructive" });
      return;
    }
    const { error } = await supabase.rpc(
      "admin_loyalty_adjust" as never,
      { p_phone: searchPhone, p_points: pts, p_note: adjustNote } as never,
    );
    if (error) {
      toast({ title: "Erro", description: error.message, variant: "destructive" });
      return;
    }
    setAdjustPoints("");
    setAdjustNote("");
    await doSearch();
    qc.invalidateQueries({ queryKey: ["loyalty-top"] });
    toast({ title: "Ajuste registrado" });
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between rounded-xl border p-4">
        <div className="flex items-center gap-3 min-w-0">
          <Gift className="text-primary shrink-0" />
          <div className="min-w-0">
            <div className="font-bold flex items-center gap-2">
              Programa de Fidelidade
              <Dialog>
                <DialogTrigger asChild>
                  <button
                    type="button"
                    aria-label="Como funciona o programa de fidelidade"
                    className="inline-flex items-center justify-center w-5 h-5 rounded-full border border-border text-muted-foreground hover:text-primary hover:border-primary transition-colors"
                  >
                    <Info size={12} />
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-md">
                  <DialogHeader>
                    <DialogTitle className="flex items-center gap-2">
                      <Gift className="text-primary" size={18} />
                      Como funciona a fidelidade
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 text-sm">
                    <div className="rounded-lg border border-warning/30 bg-warning/5 p-3 flex gap-2">
                      <Truck className="text-warning shrink-0 mt-0.5" size={16} />
                      <p className="text-xs leading-relaxed">
                        <strong>Somente pedidos online de retirada geram pontos.</strong>{" "}
                        Entregas e mesa não acumulam. Itens marcados como casco/retornável e
                        brindes também não pontuam.
                      </p>
                    </div>
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex gap-2">
                      <AlertTriangle className="text-primary shrink-0 mt-0.5" size={16} />
                      <p className="text-xs leading-relaxed">
                        <strong>Resgate mínimo:</strong> 100 pontos por brinde.{" "}
                        <strong>Compra mínima máxima:</strong> R$ 80,00. Máximo de 1 brinde
                        por pedido.
                      </p>
                    </div>
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex gap-2">
                      <Phone className="text-primary shrink-0 mt-0.5" size={16} />
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        Os pontos são salvos pelo <strong>telefone do cliente</strong>. O
                        sistema remove máscara e usa apenas números, então{" "}
                        <code className="bg-muted px-1 rounded">(67) 99999-9999</code> e{" "}
                        <code className="bg-muted px-1 rounded">67999999999</code> são a
                        mesma conta.
                      </p>
                    </div>
                    <ul className="text-xs text-muted-foreground space-y-1 pl-1">
                      <li>• 1 ponto a cada R$ 1 gasto (somente retirada online).</li>
                      <li>• Cliente identificado pelo telefone, sem cadastro/senha.</li>
                      <li>• Brindes precisam ter pelo menos 100 pontos de custo.</li>
                    </ul>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <div className="text-xs text-muted-foreground">
              1 ponto por R$ 1 — somente retirada online
            </div>
          </div>
        </div>
        <Switch
          checked={!!enabledQuery.data}
          onCheckedChange={toggleEnabled}
        />
      </div>

      {/* Brindes */}
      <section className="space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="text-sm font-bold uppercase">Brindes</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={seedDefaults}
            disabled={seeding || !restaurantId}
          >
            <Sparkles size={14} className="mr-1" />
            {seeding ? "Atualizando…" : "Criar/atualizar brindes recomendados"}
          </Button>
        </div>
        <div className="rounded-xl border p-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="sm:col-span-2">
            <Label>Nome do brinde</Label>
            <Input
              value={form.display_name}
              onChange={(e) => setForm({ ...form, display_name: e.target.value })}
              placeholder="Ex: Espeto de frango grátis"
            />
          </div>
          <div>
            <Label>Custo (pontos) — mínimo 100</Label>
            <Input
              type="number" inputMode="decimal"
              min={100}
              value={form.points_cost}
              onChange={(e) => setForm({ ...form, points_cost: e.target.value })}
            />
          </div>
          <div>
            <Label>Pedido mínimo (R$) — máximo 80</Label>
            <Input
              type="number" inputMode="decimal"
              step="0.01"
              max={80}
              value={form.min_order_subtotal}
              onChange={(e) => setForm({ ...form, min_order_subtotal: e.target.value })}
            />
          </div>
          <div>
            <Label>Ordem</Label>
            <Input
              type="number" inputMode="decimal"
              value={form.sort_order}
              onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
            />
          </div>
          <div>
            <Label>Produto vinculado (UUID, opcional)</Label>
            <Input
              value={form.product_id}
              onChange={(e) => setForm({ ...form, product_id: e.target.value })}
              placeholder="uuid do produto"
            />
          </div>
          <div className="flex items-center gap-2 pt-6">
            <Switch
              checked={form.active}
              onCheckedChange={(v) => setForm({ ...form, active: v })}
            />
            <span className="text-sm">Ativo</span>
          </div>
          <div className="sm:col-span-2 flex gap-2">
            <Button onClick={saveReward}>
              <Plus size={16} className="mr-1" />
              {form.id ? "Atualizar" : "Adicionar brinde"}
            </Button>
            {form.id && (
              <Button variant="outline" onClick={resetForm}>
                Cancelar edição
              </Button>
            )}
          </div>
        </div>

        <div className="rounded-xl border divide-y">
          {(rewardsQuery.data ?? []).length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">Nenhum brinde cadastrado.</div>
          )}
          {[...(rewardsQuery.data ?? [])]
            .sort((a, b) => {
              if (a.active !== b.active) return a.active ? -1 : 1;
              return a.sort_order - b.sort_order;
            })
            .map((r) => (
              <div key={r.id} className="p-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="font-semibold truncate flex items-center gap-2">
                    <span className="text-xs font-mono text-muted-foreground">#{r.sort_order}</span>
                    <span className="truncate">{r.display_name}</span>
                    {r.active ? (
                      <span className="text-[10px] font-bold uppercase rounded-full border border-success/40 bg-success/10 text-success px-2 py-0.5">
                        Ativo
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold uppercase rounded-full border border-border bg-muted text-muted-foreground px-2 py-0.5">
                        Oculto
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {r.points_cost} pts · mín R$ {Number(r.min_order_subtotal).toFixed(2)}
                    {r.product_name && ` · vinc. ${r.product_name} (R$ ${Number(r.product_price ?? 0).toFixed(2)})`}
                    {r.effective_cost_per_point !== null &&
                      ` · custo efetivo R$ ${r.effective_cost_per_point.toFixed(2)}/pt`}
                  </div>
                </div>
                <div className="flex gap-2 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => editReward(r)}>
                    Editar
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => deleteReward(r.id)}>
                    <Trash2 size={14} />
                  </Button>
                </div>
              </div>
            ))}
        </div>
      </section>

      {/* Cliente */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase">Buscar cliente</h2>
        <div className="rounded-xl border p-4 space-y-3">
          <div className="flex gap-2">
            <Input
              value={searchPhone}
              onChange={(e) => setSearchPhone(e.target.value)}
              placeholder="Telefone (com ou sem máscara)"
            />
            <Button onClick={doSearch}>
              <Search size={16} />
            </Button>
          </div>
          {customer && (
            <div className="space-y-3">
              {!customer.found ? (
                <p className="text-sm text-muted-foreground">
                  Cliente sem conta de fidelidade ainda.
                </p>
              ) : (
                <>
                  <div className="text-sm">
                    <div>
                      Nome: <strong>{customer.last_customer_name ?? "—"}</strong>
                    </div>
                    <div>
                      Telefone: <strong>{customer.phone}</strong>
                    </div>
                    <div>
                      Saldo: <strong className="text-primary">{customer.balance}</strong> pontos
                    </div>
                    <div>Total ganho: {customer.total_earned}</div>
                  </div>
                  <div className="border-t pt-3 space-y-2">
                    <p className="text-xs font-bold uppercase">Ajuste manual</p>
                    <div className="grid grid-cols-3 gap-2">
                      <Input
                        type="number" inputMode="decimal"
                        placeholder="Pontos (+/-)"
                        value={adjustPoints}
                        onChange={(e) => setAdjustPoints(e.target.value)}
                      />
                      <Input
                        className="col-span-2"
                        placeholder="Observação obrigatória"
                        value={adjustNote}
                        onChange={(e) => setAdjustNote(e.target.value)}
                      />
                    </div>
                    <Button onClick={doAdjust} size="sm">
                      Aplicar ajuste
                    </Button>
                  </div>
                  <div className="border-t pt-3">
                    <p className="text-xs font-bold uppercase mb-2">Histórico</p>
                    <div className="max-h-64 overflow-auto text-xs space-y-1">
                      {(customer.history ?? []).map((h) => (
                        <div key={h.id} className="flex justify-between gap-2 border-b pb-1">
                          <span>
                            {new Date(h.created_at).toLocaleString("pt-BR")} ·{" "}
                            <span className="uppercase">{h.kind}</span>
                            {h.admin_note && ` · ${h.admin_note}`}
                          </span>
                          <span
                            className={
                              h.points >= 0 ? "text-success" : "text-destructive"
                            }
                          >
                            {h.points > 0 ? "+" : ""}
                            {h.points}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {/* Top */}
      <section className="space-y-3">
        <h2 className="text-sm font-bold uppercase">Top 20 clientes</h2>
        <div className="rounded-xl border divide-y">
          {(topQuery.data ?? []).length === 0 && (
            <div className="p-4 text-sm text-muted-foreground">Nenhum cliente ainda.</div>
          )}
          {(topQuery.data ?? []).map((c) => (
            <div key={c.phone} className="p-3 flex justify-between text-sm">
              <span>
                {c.last_customer_name ?? "—"}{" "}
                <span className="text-muted-foreground">({c.phone})</span>
              </span>
              <span>
                <strong className="text-primary">{c.balance}</strong> · ganhos {c.total_earned}
              </span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
