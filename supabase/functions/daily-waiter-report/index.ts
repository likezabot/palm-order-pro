// Relatório diário de garçons (00:00 BRT). Padroniza nome via normalize_waiter_name.
import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const sb = createClient(SUPABASE_URL, SERVICE_KEY);

function fmtBRL(n: number): string {
  return `R$ ${Number(n || 0).toFixed(2).replace(".", ",")}`;
}

function normalizeName(s: string): string {
  return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
}

function titleCase(s: string): string {
  return s.split(/\s+/).map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join(" ");
}

async function getNotifyChats(): Promise<number[]> {
  const { data } = await sb.from("settings").select("value").eq("key", "telegram_notify_chats").maybeSingle();
  if (!data?.value) return [];
  try { const a = JSON.parse(data.value); return Array.isArray(a) ? a.map(Number) : []; } catch { return []; }
}

async function sendTelegram(chatId: number, text: string) {
  await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML" }),
  });
}

async function buildReport(targetDateBRT?: string): Promise<string> {
  // Janela: dia anterior em BRT (00:00 a 23:59 BRT) — UTC = +3h
  const now = new Date();
  const brtNow = new Date(now.getTime() - 3 * 3600_000);
  const day = targetDateBRT
    ? new Date(targetDateBRT + "T00:00:00")
    : new Date(brtNow.getFullYear(), brtNow.getMonth(), brtNow.getDate() - 1);
  const startUTC = new Date(day.getTime() + 3 * 3600_000);
  const endUTC = new Date(startUTC.getTime() + 24 * 3600_000);

  const { data: orders, error } = await sb
    .from("orders")
    .select("waiter_name,total,id")
    .eq("status", "paid")
    .gte("updated_at", startUTC.toISOString())
    .lt("updated_at", endUTC.toISOString());

  if (error) throw error;

  const dateLabel = `${String(day.getDate()).padStart(2, "0")}/${String(day.getMonth() + 1).padStart(2, "0")}`;

  if (!orders || orders.length === 0) {
    return `🏆 <b>Fechamento do dia — ${dateLabel}</b>\n\nSem vendas registradas.`;
  }

  // Agrupa por nome normalizado
  const map = new Map<string, { display: string; total: number; count: number }>();
  for (const o of orders) {
    const norm = normalizeName(o.waiter_name || "sem garçom");
    const display = titleCase(norm);
    const cur = map.get(norm) || { display, total: 0, count: 0 };
    cur.total += Number(o.total || 0);
    cur.count += 1;
    map.set(norm, cur);
  }

  const ranking = Array.from(map.values()).sort((a, b) => b.total - a.total);
  const medals = ["🥇", "🥈", "🥉"];
  const lines = ranking.map((r, i) => {
    const medal = medals[i] || "  ";
    return `${i + 1}º ${medal} ${r.display} — <b>${fmtBRL(r.total)}</b> (${r.count} pedido${r.count > 1 ? "s" : ""})`;
  });

  const totalCasa = ranking.reduce((s, r) => s + r.total, 0);
  const totalPedidos = ranking.reduce((s, r) => s + r.count, 0);
  const winner = ranking[0];

  return `🏆 <b>Fechamento do dia — ${dateLabel}</b>\n\n` +
         lines.join("\n") +
         `\n\n🎉 Parabéns ${winner.display}! 👏\n` +
         `Total da casa: <b>${fmtBRL(totalCasa)}</b> · ${totalPedidos} pedidos`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const date = url.searchParams.get("date") || undefined;
    const text = await buildReport(date);
    const chats = await getNotifyChats();
    for (const c of chats) await sendTelegram(c, text);
    return new Response(JSON.stringify({ ok: true, chats: chats.length, preview: text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
