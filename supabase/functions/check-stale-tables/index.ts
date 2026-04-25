// Varre pedidos parados e enfileira alertas de "mesa parada".
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};

const CRON_SECRET = Deno.env.get("CRON_SECRET") ?? "";

function safeEqual(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function checkCronAuth(req: Request): Response | null {
  const provided = req.headers.get("x-cron-secret") ?? "";
  if (!CRON_SECRET || !safeEqual(provided, CRON_SECRET)) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return null;
}

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

// Bucket de 15min — usado para deduplicar alertas da mesma mesa
function bucket15(now: Date): string {
  const m = Math.floor(now.getMinutes() / 15) * 15;
  const d = new Date(now);
  d.setMinutes(m, 0, 0);
  return d.toISOString();
}

async function run() {
  const now = new Date();
  const bucket = bucket15(now);
  const cutoffDone = new Date(now.getTime() - 30 * 60 * 1000).toISOString();
  const cutoffActive = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

  // Pedidos parados
  const { data: stale, error } = await sb
    .from("orders")
    .select("id,table_name,waiter_name,total,status,created_at,updated_at")
    .in("status", ["new", "preparing", "done"])
    .or(`and(status.eq.done,updated_at.lte.${cutoffDone}),and(status.in.(new,preparing),updated_at.lte.${cutoffActive})`)
    .limit(100);

  if (error) {
    console.error("query stale", error);
    return { ok: false, error: error.message };
  }
  if (!stale || stale.length === 0) return { ok: true, enqueued: 0 };

  let enqueued = 0;
  for (const o of stale) {
    const consolidate_key = `table_stale:${o.id}:${bucket}`;
    const dedupe_key = consolidate_key;

    // Idempotência: já alertado para esta mesa neste bucket?
    const { data: existing } = await sb
      .from("notification_log")
      .select("id")
      .eq("dedupe_key", dedupe_key)
      .maybeSingle();
    if (existing) continue;

    const openedMin = Math.floor((now.getTime() - new Date(o.created_at).getTime()) / 60000);
    const idleMin = Math.floor((now.getTime() - new Date(o.updated_at).getTime()) / 60000);

    const { error: qErr } = await sb.from("notification_queue").insert({
      event_type: "table_stale",
      entity_id: o.id,
      consolidate_key,
      send_after: new Date(now.getTime() + 5000).toISOString(),
      payload: {
        table_name: o.table_name,
        waiter_name: o.waiter_name,
        total: o.total,
        status: o.status,
        opened_min: openedMin,
        idle_min: idleMin,
      },
    });
    if (!qErr) enqueued++;
  }

  return { ok: true, enqueued, scanned: stale.length };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const unauthorized = checkCronAuth(req);
  if (unauthorized) return unauthorized;
  try {
    const result = await run();
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
