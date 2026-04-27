import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Loader2, ImageIcon, CircleDot } from "lucide-react";
import { toast } from "sonner";

type Restaurant = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  whatsapp_phone: string | null;
  logo_url: string | null;
  hero_url: string | null;
  pix_key: string | null;
  is_open_override: "auto" | "open" | "closed";
  default_prep_minutes: number;
  delivery_prep_buffer: number;
};

async function fetchRestaurant(): Promise<Restaurant> {
  const { data, error } = await supabase
    .from("restaurants" as any)
    .select(
      "id, slug, name, description, whatsapp_phone, logo_url, hero_url, pix_key, is_open_override, default_prep_minutes, delivery_prep_buffer",
    )
    .limit(1)
    .single();
  if (error) throw error;
  return data as unknown as Restaurant;
}

async function fetchIsOpen(id: string): Promise<boolean> {
  const { data } = await supabase.rpc("is_restaurant_open" as any, { p_restaurant_id: id });
  return Boolean(data);
}

export default function RestaurantInfoEditor() {
  const qc = useQueryClient();
  const { data: r, isLoading } = useQuery({
    queryKey: ["admin", "online-settings", "restaurant"],
    queryFn: fetchRestaurant,
  });

  const [form, setForm] = useState<Restaurant | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"logo" | "hero" | null>(null);
  const [openNow, setOpenNow] = useState<boolean | null>(null);

  useEffect(() => {
    if (r) setForm(r);
  }, [r]);

  useEffect(() => {
    if (!r?.id) return;
    let alive = true;
    fetchIsOpen(r.id).then((v) => alive && setOpenNow(v));
    const t = setInterval(() => fetchIsOpen(r.id).then((v) => alive && setOpenNow(v)), 30_000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [r?.id, form?.is_open_override]);

  if (isLoading || !form) {
    return (
      <div className="flex items-center justify-center py-8 text-muted-foreground">
        <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando…
      </div>
    );
  }

  const upload = async (file: File, kind: "logo" | "hero") => {
    setUploading(kind);
    try {
      const ext = file.name.split(".").pop();
      const path = `restaurant-${kind}-${form.id}-${Date.now()}.${ext}`;
      const { error } = await supabase.storage.from("product-images").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
      setForm((f) => (f ? { ...f, [kind === "logo" ? "logo_url" : "hero_url"]: data.publicUrl } : f));
      toast.success("Imagem enviada");
    } catch (e: any) {
      toast.error("Erro: " + (e.message ?? "?"));
    } finally {
      setUploading(null);
    }
  };

  const save = async () => {
    if (!form) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc("admin_update_restaurant" as any, {
        p_id: form.id,
        p_name: form.name,
        p_description: form.description ?? "",
        p_whatsapp_phone: form.whatsapp_phone ?? "",
        p_logo_url: form.logo_url ?? "",
        p_hero_url: form.hero_url ?? "",
        p_pix_key: form.pix_key ?? "",
        p_is_open_override: form.is_open_override,
        p_default_prep_minutes: form.default_prep_minutes,
        p_delivery_prep_buffer: form.delivery_prep_buffer,
      });
      if (error) throw error;
      toast.success("Configurações salvas");
      qc.invalidateQueries({ queryKey: ["admin", "online-settings", "restaurant"] });
    } catch (e: any) {
      toast.error("Erro ao salvar: " + (e.message ?? "?"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Status */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-wide">Status da loja</h3>
          {openNow !== null && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold ${
                openNow ? "bg-emerald-500/15 text-emerald-600" : "bg-rose-500/15 text-rose-600"
              }`}
            >
              <CircleDot className="h-3 w-3" /> {openNow ? "Aberto agora" : "Fechado agora"}
            </span>
          )}
        </div>
        <div>
          <Label>Modo</Label>
          <Select
            value={form.is_open_override}
            onValueChange={(v) => setForm({ ...form, is_open_override: v as any })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="auto">Automático (segue horários)</SelectItem>
              <SelectItem value="open">Forçar aberto</SelectItem>
              <SelectItem value="closed">Forçar fechado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </section>

      {/* Dados */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-black uppercase tracking-wide">Dados públicos</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Nome</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label>WhatsApp</Label>
            <Input
              placeholder="55DDD9XXXXXXXX"
              value={form.whatsapp_phone ?? ""}
              onChange={(e) => setForm({ ...form, whatsapp_phone: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Descrição</Label>
            <Textarea
              rows={2}
              value={form.description ?? ""}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <Label>Chave PIX</Label>
            <Input
              value={form.pix_key ?? ""}
              onChange={(e) => setForm({ ...form, pix_key: e.target.value })}
            />
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <ImageField
            label="Logo"
            url={form.logo_url}
            onClear={() => setForm({ ...form, logo_url: "" })}
            uploading={uploading === "logo"}
            onPick={(f) => upload(f, "logo")}
          />
          <ImageField
            label="Capa (hero)"
            url={form.hero_url}
            onClear={() => setForm({ ...form, hero_url: "" })}
            uploading={uploading === "hero"}
            onPick={(f) => upload(f, "hero")}
          />
        </div>
      </section>

      {/* Tempo de preparo */}
      <section className="rounded-lg border border-border bg-card p-4 space-y-3">
        <h3 className="text-sm font-black uppercase tracking-wide">Tempo de preparo</h3>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Preparo padrão (min)</Label>
            <Input
              type="number" inputMode="decimal"
              min={0}
              value={form.default_prep_minutes}
              onChange={(e) =>
                setForm({ ...form, default_prep_minutes: parseInt(e.target.value) || 0 })
              }
            />
          </div>
          <div>
            <Label>Folga extra para entrega (min)</Label>
            <Input
              type="number" inputMode="decimal"
              min={0}
              value={form.delivery_prep_buffer}
              onChange={(e) =>
                setForm({ ...form, delivery_prep_buffer: parseInt(e.target.value) || 0 })
              }
            />
          </div>
        </div>
      </section>

      <Button className="w-full font-bold" onClick={save} disabled={saving}>
        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar configurações"}
      </Button>
    </div>
  );
}

function ImageField({
  label,
  url,
  uploading,
  onPick,
  onClear,
}: {
  label: string;
  url: string | null;
  uploading: boolean;
  onPick: (f: File) => void;
  onClear: () => void;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <div className="mt-1 flex gap-3">
        <div className="h-20 w-20 overflow-hidden rounded-md bg-muted shrink-0">
          {url ? (
            <img src={url} alt={label} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground">
              <ImageIcon className="h-5 w-5" />
            </div>
          )}
        </div>
        <div className="flex flex-1 flex-col gap-2">
          <Input
            type="file"
            accept="image/*"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPick(f);
            }}
          />
          {url && (
            <Button variant="ghost" size="sm" onClick={onClear}>
              Remover
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
