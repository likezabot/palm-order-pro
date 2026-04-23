// Drena fila de notificações e envia mensagens consolidadas pro Telegram.
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

async function getNotifyChats(): Promise<number[]> {
  const { data } = await sb.from("settings").select("value").eq("key", "telegram_notify_chats").maybeSingle();
  if (!data?.value) return [];
  try {
    const arr = JSON.parse(data.value);
    return Array.isArray(arr) ? arr.map(Number).filter(Number.isFinite) : [];
  } catch { return []; }
}

async function getNotifyConfig(): Promise<Record<string, boolean>> {
  const { data } = await sb.from("settings").select("value").eq("key", "telegram_notify_config").maybeSingle();
  if (!data?.value) return { orders: true, payments: true, stock_critical: true, daily_report: true, cash_closed: true, stale_tables: true };
  try { return JSON.parse(data.value); } catch { return {}; }
}

async function sendTelegram(chatId: number, text: string): Promise<boolean> {
  try {
    const r = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    });
    return r.ok;
  } catch (e) {
    console.error("send fail", e);
    return false;
  }
}

async function broadcast(text: string, chats: number[]) {
  for (const c of chats) await sendTelegram(c, text);
}

function formatDelta(delta: any[]): string {
  if (!Array.isArray(delta) || delta.length === 0) return "";
  const lines: string[] = [];
  for (const d of delta) {
    const qty = Number(d.quantity || 0);
    const name = d.product_name || "item";
    if (qty > 0) lines.push(`  ➕ ${qty}× ${name}`);
    else if (qty < 0) lines.push(`  ➖ ${Math.abs(qty)}× ${name}`);
  }
  return lines.join("\n");
}

async function processQueue(): Promise<{ processed: number; sent: number }> {
  const chats = await getNotifyChats();
  const cfg = await getNotifyConfig();
  if (chats.length === 0) return { processed: 0, sent: 0 };

  // Pega todos os eventos cuja janela de consolidação venceu, agrupa por consolidate_key
  const { data: rows, error } = await sb
    .from("notification_queue")
    .select("*")
    .is("processed_at", null)
    .lte("send_after", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(200);

  if (error) { console.error(error); return { processed: 0, sent: 0 }; }
  if (!rows || rows.length === 0) return { processed: 0, sent: 0 };

  // Agrupa por consolidate_key — só o último registro de cada chave conta (estado atual)
  const byKey = new Map<string, any>();
  const allIds: number[] = [];
  for (const r of rows) {
    allIds.push(r.id);
    const prev = byKey.get(r.consolidate_key);
    if (!prev || new Date(r.created_at) > new Date(prev.created_at)) {
      byKey.set(r.consolidate_key, r);
    }
  }

  // ===== Pré-processamento: detecta print_failure por "ponte offline" e consolida =====
  // Heurística: erros que indicam ponte de impressão desligada (não falha real da impressora)
  const isBridgeOffline = (err: string): boolean => {
    if (!err) return false;
    const low = err.toLowerCase();
    return (
      low.includes("bridge_offline") ||
      low.includes("failed to fetch") ||
      low.includes("fetch failed") ||
      low.includes("networkerror") ||
      low.includes("econnrefused") ||
      low.includes("bridge offline") ||
      low.includes("ponte offline")
    );
  };

  const offlineFailures: any[] = [];
  const realFailures: any[] = [];
  const otherEvents: any[] = [];

  for (const evt of byKey.values()) {
    if (evt.event_type === "print_failure") {
      const err = String((evt.payload || {}).error || "");
      if (isBridgeOffline(err)) offlineFailures.push(evt);
      else realFailures.push(evt);
    } else {
      otherEvents.push(evt);
    }
  }

  let sent = 0;

  // ===== Alerta consolidado de ponte offline (1 a cada 30 min) =====
  if (offlineFailures.length > 0 && cfg.print_failure !== false) {
    // Janela de 30 minutos: dedupe_key fixo por janela
    const windowStart = new Date(Math.floor(Date.now() / (30 * 60 * 1000)) * 30 * 60 * 1000);
    const dedupeKey = `printer_offline:${windowStart.toISOString()}`;
    const { data: existing } = await sb.from("notification_log")
      .select("id").eq("dedupe_key", dedupeKey).maybeSingle();

    if (!existing) {
      const tables = Array.from(new Set(
        offlineFailures.map((e) => (e.payload || {}).table_name).filter(Boolean)
      ));
      const tablesText = tables.length > 0 ? `\nMesas aguardando: ${tables.join(", ")}` : "";
      const text =
        `🔌 <b>Impressora desligada</b>\n` +
        `Temporariamente indisponível para impressão.${tablesText}\n` +
        `<i>Os pedidos ficam na fila e imprimem assim que a impressora voltar.</i>`;
      await broadcast(text, chats);
      await sb.from("notification_log").insert({
        event_type: "printer_offline", entity_id: offlineFailures[0].entity_id, dedupe_key: dedupeKey,
      });
      sent++;
    }
    // Não envia mensagens individuais nem fica avisando — só marca como processado
  }

  // ===== Eventos restantes (falhas reais + tudo o mais) =====
  for (const evt of [...realFailures, ...otherEvents]) {
    const dedupeKey = `${evt.event_type}:${evt.entity_id}:${evt.created_at}`;
    // Idempotência
    const { data: existing } = await sb.from("notification_log")
      .select("id").eq("dedupe_key", dedupeKey).maybeSingle();
    if (existing) continue;

    let text = "";
    const p = evt.payload || {};

    if (evt.event_type === "order_created" && cfg.orders !== false) {
      // Busca itens atuais
      const { data: items } = await sb.from("order_items")
        .select("product_name,quantity").eq("order_id", evt.entity_id);
      const itemLines = (items || []).map((i: any) => `  • ${i.quantity}× ${i.product_name}`).join("\n");
      text = `🆕 <b>Novo pedido — Mesa ${p.table_name}</b>\n` +
             `Garçom: ${p.waiter_name || "—"}\n` +
             (itemLines ? itemLines + "\n" : "") +
             `Total: <b>${fmtBRL(p.total)}</b>`;
    } else if (evt.event_type === "order_delta" && cfg.orders !== false) {
      const deltaText = formatDelta(p.delta || []);
      if (!deltaText) continue;
      text = `🔄 <b>Mesa ${p.table_name}</b> atualizada\n` +
             deltaText + "\n" +
             `Total: <b>${fmtBRL(p.total)}</b>`;
    } else if (evt.event_type === "order_paid" && cfg.payments !== false) {
      const paid = Number(p.amount_paid || 0);
      const total = Number(p.total || 0);
      const change = paid > total ? paid - total : 0;
      text = `✅ <b>Mesa ${p.table_name} paga</b>\n` +
             `Garçom: ${p.waiter_name || "—"}\n` +
             `Método: ${p.payment_method || "—"} · ${fmtBRL(total)}` +
             (change > 0 ? `\nTroco: ${fmtBRL(change)}` : "");
    } else if (evt.event_type === "stock_critical" && cfg.stock_critical !== false) {
      text = `⚠️ <b>Estoque crítico</b>\n${p.name}: ${p.current} ${p.unit || ""} (mín ${p.min})`;
    } else if (evt.event_type === "stock_zero" && cfg.stock_critical !== false) {
      text = `🚨 <b>Item zerado</b>\n${p.name}: ${p.current} ${p.unit || ""}`;
    } else if (evt.event_type === "stock_in" && cfg.stock_in !== false) {
      const note = p.note ? `\n<i>${p.note}</i>` : "";
      text = `📦 <b>Entrada de estoque</b>\n${p.name}: +${p.quantity} ${p.unit || ""} (atual ${p.current})${note}`;
    } else if (evt.event_type === "table_renamed" && cfg.orders !== false) {
      text = `🔁 <b>Mesa renomeada</b>\n${p.old_name} → <b>${p.new_name}</b>` +
             (p.waiter_name ? `\nGarçom: ${p.waiter_name}` : "");
    } else if (evt.event_type === "print_failure" && cfg.print_failure !== false) {
      const tipo = p.print_type === "bill" ? "conta" : p.print_type === "delta" ? "acréscimo" : "pedido";
      text = `🖨️ <b>Falha de impressão</b>\nMesa ${p.table_name} (${tipo})\n<i>${p.error}</i>`;
    } else if (evt.event_type === "cash_closed" && cfg.cash_closed !== false) {
      const sangrias = Number(p.sangrias || 0);
      const suprimentos = Number(p.suprimentos || 0);
      const diff = Number(p.diferenca || 0);
      const diffSign = diff > 0 ? "+" : "";
      const diffWarn = Math.abs(diff) >= 0.01 ? " ⚠️" : "";
      text = `💰 <b>Caixa fechado</b>\n` +
             `Vendas: ${fmtBRL(p.total_sales)}\n` +
             (sangrias > 0 ? `Sangrias: ${fmtBRL(sangrias)}\n` : "") +
             (suprimentos > 0 ? `Suprimentos: ${fmtBRL(suprimentos)}\n` : "") +
             `Esperado: ${fmtBRL(p.esperado)} · Conferido: ${fmtBRL(p.final_amount)}\n` +
             `Diferença: ${diffSign}${fmtBRL(Math.abs(diff))}${diffWarn}`;
    } else if (evt.event_type === "table_stale" && cfg.stale_tables !== false) {
      const fmtDur = (m: number) => m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${m}min`;
      const statusLabel = p.status === "done" ? "aguardando pagar" : "sem item novo";
      text = `⏰ <b>Mesa parada</b>\n` +
             `Mesa ${p.table_name}` + (p.waiter_name ? ` · Garçom ${p.waiter_name}` : "") + `\n` +
             `Aberta há ${fmtDur(Number(p.opened_min || 0))} · ${statusLabel} há ${fmtDur(Number(p.idle_min || 0))}\n` +
             `Total atual: <b>${fmtBRL(p.total)}</b>`;
    } else {
      continue;
    }

    await broadcast(text, chats);
    await sb.from("notification_log").insert({
      event_type: evt.event_type, entity_id: evt.entity_id, dedupe_key: dedupeKey,
    });
    sent++;
  }

  // Marca todos os processados
  await sb.from("notification_queue").update({ processed_at: new Date().toISOString() })
    .in("id", allIds);

  return { processed: allIds.length, sent };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const result = await processQueue();
    return new Response(JSON.stringify({ ok: true, ...result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error(e);
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
