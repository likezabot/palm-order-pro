import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Loader2, Plus, Trash2, Pencil } from "lucide-react";
import { toast } from "sonner";

type Zone = {
  id: string;
  name: string;
  fee: number;
  min_order: number;
  estimated_minutes: number;
  match_neighborhoods: string[];
  active: boolean;
};

async function fetchZones(restaurantId: string): Promise<Zone[]> {
  const { data, error } = await supabase
    .from("delivery_zones" as any)
    .select("id, name, fee, min_order, estimated_minutes, match_neighborhoods, active")
    .eq("restaurant_id", restaurantId)
    .order("name");
  if (error) throw error;
  return (data ?? []) as unknown as Zone[];
}

const empty = (): Omit<Zone, "id"> => ({
  name: "",
  fee: 0,
  min_order: 0,
  estimated_minutes: 30,
  match_neighborhoods: [],
  active: true,
});

export default function DeliveryZonesEditor({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();
  const { data: zones = [], isLoading } = useQuery({
    queryKey: ["admin", "online-settings", "zones", restaurantId],
    queryFn: () => fetchZones(restaurantId),
    enabled: !!restaurantId,
  });
  const [editing, setEditing] = useState<Partial<Zone> | null>(null);
  const [saving, setSaving] = useState(false);

  const refresh = () =>
    qc.invalidateQueries({ queryKey: ["admin", "online-settings", "zones", restaurantId] });

  const save = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("admin_upsert_delivery_zone" as any, {
        p_id: editing.id ?? null,
        p_restaurant_id: restaurantId,
        p_name: editing.name ?? "",
        p_fee: Number(editing.fee ?? 0),
        p_min_order: Number(editing.min_order ?? 0),
        p_estimated_minutes: Number(editing.estimated_minutes ?? 30),
        p_match_neighborhoods: editing.match_neighborhoods ?? [],
        p_active: editing.active ?? true,
      });
      if (error) throw error;
      toast.success("Zona salva");
      setEditing(null);
      refresh();
    } catch (e: any) {
      toast.error("Erro: " + (e.message ?? "?"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Remover esta zona?")) return;
    const { error } = await supabase.rpc("admin_delete_delivery_zone" as any, { p_id: id });
    if (error) toast.error("Erro: " + error.message);
    else {
      toast.success("Zona removida");
      refresh();
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black uppercase tracking-wide">Zonas de entrega</h3>
        <Button size="sm" onClick={() => setEditing(empty())}>
          <Plus className="h-4 w-4 mr-1" /> Nova zona
        </Button>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-6 text-muted-foreground">
          <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
        </div>
      ) : zones.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4 text-center">
          Nenhuma zona cadastrada. Sem zonas, o checkout de entrega fica bloqueado.
        </p>
      ) : (
        <div className="space-y-2">
          {zones.map((z) => (
            <div
              key={z.id}
              className="flex flex-wrap items-center gap-3 rounded-md border border-border p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="font-bold flex items-center gap-2">
                  {z.name}
                  {!z.active && (
                    <span className="text-[10px] uppercase rounded bg-muted px-1.5 py-0.5">
                      inativa
                    </span>
                  )}
                </p>
                <p className="text-xs text-muted-foreground">
                  Taxa R$ {z.fee.toFixed(2)} · mín R$ {z.min_order.toFixed(2)} ·{" "}
                  {z.estimated_minutes} min
                </p>
                {z.match_neighborhoods.length > 0 && (
                  <p className="text-xs text-muted-foreground truncate">
                    Bairros: {z.match_neighborhoods.join(", ")}
                  </p>
                )}
              </div>
              <Button size="sm" variant="outline" onClick={() => setEditing(z)}>
                <Pencil className="h-3 w-3 mr-1" /> Editar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => remove(z.id)}>
                <Trash2 className="h-3 w-3 text-rose-500" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="w-full max-w-lg rounded-t-2xl bg-card p-4 shadow-xl sm:rounded-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-black mb-3">
              {editing.id ? "Editar zona" : "Nova zona de entrega"}
            </h3>
            <div className="space-y-3">
              <div>
                <Label>Nome</Label>
                <Input
                  value={editing.name ?? ""}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="Ex: Centro"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label>Taxa (R$)</Label>
                  <Input
                    type="number" inputMode="decimal"
                    step="0.01"
                    min={0}
                    value={editing.fee ?? 0}
                    onChange={(e) => setEditing({ ...editing, fee: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>Pedido mín. (R$)</Label>
                  <Input
                    type="number" inputMode="decimal"
                    step="0.01"
                    min={0}
                    value={editing.min_order ?? 0}
                    onChange={(e) =>
                      setEditing({ ...editing, min_order: parseFloat(e.target.value) || 0 })
                    }
                  />
                </div>
                <div>
                  <Label>Tempo (min)</Label>
                  <Input
                    type="number" inputMode="decimal"
                    min={1}
                    value={editing.estimated_minutes ?? 30}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        estimated_minutes: parseInt(e.target.value) || 30,
                      })
                    }
                  />
                </div>
              </div>
              <div>
                <Label>Bairros (separados por vírgula)</Label>
                <Input
                  value={(editing.match_neighborhoods ?? []).join(", ")}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      match_neighborhoods: e.target.value
                        .split(",")
                        .map((s) => s.trim())
                        .filter(Boolean),
                    })
                  }
                  placeholder="centro, jardim, vila nova"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Pedidos cujo bairro bater com algum aqui usarão esta zona.
                </p>
              </div>
              <div className="flex items-center justify-between">
                <Label>Ativa</Label>
                <Switch
                  checked={editing.active ?? true}
                  onCheckedChange={(v) => setEditing({ ...editing, active: v })}
                />
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => setEditing(null)}>
                Cancelar
              </Button>
              <Button className="flex-1" onClick={save} disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
