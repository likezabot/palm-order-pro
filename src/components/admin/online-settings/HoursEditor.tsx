import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { weekdayLabel } from "@/lib/public-menu";

type Hour = {
  weekday: number;
  opens_at: string | null;
  closes_at: string | null;
  is_closed: boolean;
};

async function fetchHours(restaurantId: string): Promise<Hour[]> {
  const { data, error } = await supabase
    .from("business_hours" as any)
    .select("weekday, opens_at, closes_at, is_closed")
    .eq("restaurant_id", restaurantId)
    .order("weekday");
  if (error) throw error;
  const map = new Map<number, Hour>();
  (data ?? []).forEach((h: any) => map.set(h.weekday, h));
  const full: Hour[] = [];
  for (let w = 0; w < 7; w++) {
    full.push(map.get(w) ?? { weekday: w, opens_at: null, closes_at: null, is_closed: true });
  }
  return full;
}

const trim = (t: string | null) => (t ? t.slice(0, 5) : "");

export default function HoursEditor({ restaurantId }: { restaurantId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "online-settings", "hours", restaurantId],
    queryFn: () => fetchHours(restaurantId),
    enabled: !!restaurantId,
  });
  const [hours, setHours] = useState<Hour[] | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (data) setHours(data);
  }, [data]);

  if (isLoading || !hours) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  const update = (w: number, patch: Partial<Hour>) =>
    setHours((hs) => hs!.map((h) => (h.weekday === w ? { ...h, ...patch } : h)));

  const save = async () => {
    setSaving(true);
    try {
      const payload = hours.map((h) => ({
        weekday: h.weekday,
        is_closed: h.is_closed,
        opens_at: h.is_closed ? null : trim(h.opens_at),
        closes_at: h.is_closed ? null : trim(h.closes_at),
      }));
      const { error } = await supabase.rpc("admin_upsert_business_hours" as any, {
        p_restaurant_id: restaurantId,
        p_hours: payload,
      });
      if (error) throw error;
      toast.success("Horários salvos");
      qc.invalidateQueries({ queryKey: ["admin", "online-settings", "hours", restaurantId] });
    } catch (e: any) {
      toast.error("Erro: " + (e.message ?? "?"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <h3 className="text-sm font-black uppercase tracking-wide">Horários de funcionamento</h3>
      <div className="space-y-2">
        {hours.map((h) => (
          <div
            key={h.weekday}
            className="flex flex-wrap items-center gap-3 rounded-md border border-border p-2"
          >
            <span className="w-24 text-sm font-bold">{weekdayLabel(h.weekday)}</span>
            <div className="flex items-center gap-2">
              <Switch
                checked={!h.is_closed}
                onCheckedChange={(v) => update(h.weekday, { is_closed: !v })}
              />
              <span className="text-xs text-muted-foreground">
                {h.is_closed ? "Fechado" : "Aberto"}
              </span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <Input
                type="time"
                className="w-28"
                disabled={h.is_closed}
                value={trim(h.opens_at)}
                onChange={(e) => update(h.weekday, { opens_at: e.target.value })}
              />
              <span className="text-muted-foreground">–</span>
              <Input
                type="time"
                className="w-28"
                disabled={h.is_closed}
                value={trim(h.closes_at)}
                onChange={(e) => update(h.weekday, { closes_at: e.target.value })}
              />
            </div>
          </div>
        ))}
      </div>
      <Button className="w-full font-bold" onClick={save} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar horários"}
      </Button>
    </div>
  );
}
