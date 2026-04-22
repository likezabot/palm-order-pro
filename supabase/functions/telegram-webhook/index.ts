// Telegram webhook: edição de pedidos por texto.
// Comandos: "mesa N + qty produto", "mesa N - qty produto", "mesa N ver pedido", "ajuda".

import { createClient } from "npm:@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type InlineButton = { text: string; callback_data: string };

// Dedupe (TTL 5min) para retries do Telegram.
const seenUpdates = new Map<number, number>();
function isDuplicate(updateId: number): boolean {
  const now = Date.now();
  for (const [k, t] of seenUpdates) if (now - t > 5 * 60_000) seenUpdates.delete(k);
  if (seenUpdates.has(updateId)) return true;
  seenUpdates.set(updateId, now);
  return false;
}

// ─────────────────────── vinculação garçom (Telegram → Palm) ───────────────────────
// Lista garçons cadastrados no Palm (profiles.role = 'waiter').
async function listWaiterNames(): Promise<string[]> {
  const { data, error } = await sb
    .from("profiles")
    .select("name")
    .eq("role", "waiter")
    .order("name", { ascending: true });
  if (error) { console.warn("listWaiterNames:", error.message); return []; }
  return (data ?? []).map((r: any) => String(r.name)).filter(Boolean);
}

async function getWaiterBinding(telegramUserId: number): Promise<string | null> {
  const { data, error } = await sb
    .from("telegram_user_bindings")
    .select("waiter_name")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  if (error) { console.warn("getWaiterBinding:", error.message); return null; }
  return data?.waiter_name ?? null;
}

async function setWaiterBinding(telegramUserId: number, waiterName: string, username?: string): Promise<void> {
  const { error } = await sb
    .from("telegram_user_bindings")
    .upsert({
      telegram_user_id: telegramUserId,
      waiter_name: waiterName,
      telegram_username: username ?? null,
    }, { onConflict: "telegram_user_id" });
  if (error) console.warn("setWaiterBinding:", error.message);
}

async function clearAllWaiterBindings(): Promise<number> {
  const { data, error } = await sb
    .from("telegram_user_bindings")
    .delete()
    .gte("telegram_user_id", -9223372036854775000)
    .select("telegram_user_id");
  if (error) { console.warn("clearAllWaiterBindings:", error.message); return 0; }
  return data?.length ?? 0;
}

// Resolve o nome do garçom a partir do user_id Telegram. Retorna null se não vinculado.
// Tolerante a maiúsculas/acentos/espaços extras na escolha.
function normalizeWaiterChoice(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}
async function tryBindFromText(telegramUserId: number, text: string, username?: string): Promise<string | null> {
  const wanted = normalizeWaiterChoice(text);
  if (!wanted) return null;
  const names = await listWaiterNames();
  for (const n of names) {
    if (normalizeWaiterChoice(n) === wanted) {
      await setWaiterBinding(telegramUserId, n, username);
      return n;
    }
  }
  return null;
}
function buildWaiterPickerMessage(names: string[], username?: string): string {
  const greet = username ? `Olá, @${username}! ` : "Olá! ";
  if (names.length === 0) {
    return greet +
      "Nenhum garçom cadastrado no Palm ainda.\n" +
      "Peça ao admin para abrir o módulo *Admin* e criar seu nome em Garçons.";
  }
  return greet +
    "Antes de começar, me diga *qual garçom você é* (precisa estar cadastrado no Palm).\n\n" +
    "Garçons disponíveis:\n" +
    names.map((n) => `  • ${n}`).join("\n") +
    "\n\nResponda apenas com o nome (ex.: `" + names[0] + "`).";
}

// Modo turbo: contexto da última mesa por chat (TTL 15min, persistido em settings).
const LAST_TABLE_TTL_MS = 15 * 60_000;
type ChatType = "private" | "group" | "supergroup" | "channel" | undefined;
function isGroupChat(chatType: ChatType): boolean {
  return chatType === "group" || chatType === "supergroup";
}
function lastTableSettingsKey(chatId: number, userId?: number, chatType?: ChatType): string {
  if (isGroupChat(chatType) && typeof userId === "number") {
    return `telegram_last_table:${chatId}:${userId}`;
  }
  return `telegram_last_table:${chatId}`;
}
async function getLastTable(chatId: number, userId?: number, chatType?: ChatType): Promise<string | null> {
  const { data, error } = await sb
    .from("settings")
    .select("id, value, updated_at")
    .eq("key", lastTableSettingsKey(chatId, userId, chatType))
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data?.value) return null;

  try {
    const parsed = JSON.parse(data.value);
    const table = typeof parsed?.table === "string" ? parsed.table : null;
    const ts = typeof parsed?.ts === "number"
      ? parsed.ts
      : Date.parse(parsed?.ts ?? data.updated_at ?? "");
    if (!table || !Number.isFinite(ts) || Date.now() - ts > LAST_TABLE_TTL_MS) {
      return null;
    }
    return table;
  } catch {
    return null;
  }
}
async function setLastTable(chatId: number, table: string, userId?: number, chatType?: ChatType): Promise<void> {
  const key = lastTableSettingsKey(chatId, userId, chatType);
  const value = JSON.stringify({ table, ts: Date.now() });
  const { data: existing } = await sb
    .from("settings")
    .select("id")
    .eq("key", key)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing?.id) {
    await sb.from("settings").update({ value }).eq("id", existing.id);
    return;
  }

  await sb.from("settings").insert({ key, value });
}

// ─────────────────────────── rate limit ───────────────────────────
// REMOVIDO: rate limit in-memory não é confiável em Edge Functions multi-isolate.
// O backend não tem primitivos para rate limit persistente ainda. Sem proteção real
// contra flood até existir infra dedicada.

// ─────────────────────────── undo (60s, in-memory) ───────────────────────────
const UNDO_TTL_MS = 60_000;
type UndoOp = { op: "a" | "r"; productId: string; productName: string; qty: number };
type UndoToken = { chatId: number; table: string; ops: UndoOp[]; ts: number };
const pendingUndos = new Map<string, UndoToken>();
const consumedUndos = new Map<string, number>();
// Stack de tokens de undo por chat — mais recente primeiro. Usado pelo comando textual `undo`.
const chatUndoStack = new Map<number, string[]>();

function cleanupUndos() {
  const now = Date.now();
  for (const [k, v] of pendingUndos) if (now - v.ts > UNDO_TTL_MS) pendingUndos.delete(k);
  for (const [k, t] of consumedUndos) if (now - t > UNDO_TTL_MS) consumedUndos.delete(k);
  // Compacta stack por chat removendo tokens já expirados/consumidos.
  for (const [chat, arr] of chatUndoStack) {
    const filtered = arr.filter((t) => pendingUndos.has(t));
    if (filtered.length === 0) chatUndoStack.delete(chat);
    else chatUndoStack.set(chat, filtered);
  }
}
function genUndoToken(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
function registerBatchUndo(chatId: number, table: string, ops: UndoOp[]): string {
  cleanupUndos();
  if (ops.length === 0) return "";
  const token = genUndoToken();
  pendingUndos.set(token, { chatId, table, ops, ts: Date.now() });
  const stack = chatUndoStack.get(chatId) ?? [];
  stack.push(token);
  chatUndoStack.set(chatId, stack);
  // Persiste em DB (multi-isolate safe). Fire-and-forget.
  sb.from("telegram_undo_stack")
    .insert({ token, chat_id: chatId, table_name: table, ops })
    .then((r) => { if (r.error) console.warn("undo persist:", r.error.message); });
  return token;
}

async function loadChatUndoStackFromDb(chatId: number): Promise<{ token: string; table: string; ops: UndoOp[] }[]> {
  const cutoff = new Date(Date.now() - UNDO_TTL_MS).toISOString();
  const { data, error } = await sb
    .from("telegram_undo_stack")
    .select("token, table_name, ops, created_at")
    .eq("chat_id", chatId)
    .gte("created_at", cutoff)
    .order("created_at", { ascending: true });
  if (error) { console.warn("undo load:", error.message); return []; }
  return (data ?? []).map((r: any) => ({ token: r.token, table: r.table_name, ops: r.ops as UndoOp[] }));
}

async function deleteUndoTokensFromDb(tokens: string[]): Promise<void> {
  if (tokens.length === 0) return;
  const { error } = await sb.from("telegram_undo_stack").delete().in("token", tokens);
  if (error) console.warn("undo delete:", error.message);
}
function buildUndoSingleKeyboard(table: string, productId: string, qty: number, op: "a" | "r"): InlineButton[][] {
  // op = ação original ("a" → ADD foi feito → undo é REMOVE)
  return [[{ text: "↩️ Desfazer (60s)", callback_data: `u|${table}|${productId}|${qty}|${op}` }]];
}
function buildUndoBatchKeyboard(token: string): InlineButton[][] {
  if (!token) return [];
  return [[{ text: "↩️ Desfazer (60s)", callback_data: `ub|${token}` }]];
}

// ─────────────────────────── helpers ───────────────────────────

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Garante espaço ao redor de operadores +/- colados a dígitos/letras.
    // Ex.: "+2 coca" -> "+ 2 coca"; "mesa 5+2 coca" -> "mesa 5 + 2 coca".
    .replace(/([+\-])(?=\S)/g, "$1 ")
    .replace(/(\S)(?=[+\-]\s)/g, "$1 ")
    .replace(/\s+/g, " ")
    .trim();
}

function fmtBRL(n: number): string {
  return `R$ ${n.toFixed(2).replace(".", ",")}`;
}

// Singulariza tokens em pt-BR (conservador). Aplicado antes do resolveProduct.
// Preserva dígitos/unidades (350, 2l, 600ml) e palavras curtas/acentuadas (gas, mes).
function singularizeToken(tok: string): string {
  if (!tok) return tok;
  // dígitos ou tokens com dígito (350, 2l, 600ml) — não mexer
  if (/\d/.test(tok)) return tok;
  if (tok.length <= 3) return tok;
  // Já vem normalizado (sem acento). Heurística: se termina em "as/es/is/os/us"
  // mas a forma original poderia ter acento (gás→gas, três→tres), não dá pra saber.
  // Mantemos conservador: tokens com 4 letras terminados em vogal+s ficam.
  // Regras de plural:
  if (/oes$/.test(tok)) return tok.replace(/oes$/, "ao"); // medalhoes -> medalhao
  if (/ais$/.test(tok)) return tok.replace(/ais$/, "al"); // pasteis errado, mas: animais->animal
  if (/eis$/.test(tok)) return tok.replace(/eis$/, "el"); // pasteis -> pastel
  if (/ois$/.test(tok)) return tok.replace(/ois$/, "ol"); // lencois -> lencol
  if (/uis$/.test(tok)) return tok.replace(/uis$/, "ul"); // pauis -> paul
  if (/ns$/.test(tok)) return tok.replace(/ns$/, "m");    // garagens -> garagem
  if (/(res|zes|ses)$/.test(tok)) return tok.slice(0, -2); // colheres -> colher
  // Vogal + s no final: tira o s (cocas->coca, bovinos->bovino, aguas->agua)
  // Mas evita ss e palavras de 4 letras tipo "mais" (já tratado), "pais" (já tratado).
  if (/[aeiou]s$/.test(tok) && !/ss$/.test(tok)) return tok.slice(0, -1);
  return tok;
}

function singularize(text: string): string {
  return text.split(/\s+/).map(singularizeToken).join(" ");
}

// Distância de Levenshtein (matriz O(n·m), strings curtas).
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const al = a.length, bl = b.length;
  if (al === 0) return bl;
  if (bl === 0) return al;
  const dp: number[] = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) dp[j] = j;
  for (let i = 1; i <= al; i++) {
    let prev = dp[0];
    dp[0] = i;
    for (let j = 1; j <= bl; j++) {
      const tmp = dp[j];
      dp[j] = a[i - 1] === b[j - 1]
        ? prev
        : 1 + Math.min(prev, dp[j], dp[j - 1]);
      prev = tmp;
    }
  }
  return dp[bl];
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─────────────────────────── parser ───────────────────────────

type Command =
  | { kind: "ADD" | "REMOVE"; table: string; qty: number; productText: string; fromContext?: boolean }
  | { kind: "VIEW"; table: string; fromContext?: boolean }
  | { kind: "SET_TABLE"; table: string }
  | { kind: "ADD_NOMESA" | "REMOVE_NOMESA"; qty: number; productText: string }
  | { kind: "VIEW_NOMESA" }
  | { kind: "NEEDS_TABLE"; originalKind: "ADD" | "REMOVE" | "VIEW" }
  | { kind: "UNDO"; all: boolean }
  | { kind: "REPORT" }
  | { kind: "STOCK_CRITICAL" }
  | { kind: "NOTIFY_TOGGLE"; on: boolean }
  | { kind: "TABLE_STATUS"; table: string }
  | { kind: "HELP" }
  | { kind: "PARSE_ERROR"; raw: string; hint?: "no_op" | "no_product" | "no_table" | "no_qty" | "generic" };

// Operadores compartilhados (usados pelo parser e pelo fallback NOMESA).
const ADD_OPS = ["+", "add", "adiciona", "adicionar", "coloca", "colocar", "poe", "manda", "mandar", "bota", "botar", "mais", "soma", "somar", "inclui", "incluir", "acrescenta", "acrescentar"];
const REM_OPS = ["-", "remove", "remover", "tira", "tirar", "retira", "retirar", "cancela", "cancelar", "menos", "subtrai", "subtrair", "exclui", "excluir", "desconta", "descontar"];
const ALL_OPS = [...ADD_OPS, ...REM_OPS];
const VIEW_TOKENS = [
  "ver", "ve", "consulta", "consultar", "consulte",
  "total", "totais", "pedido", "pedidos",
  "mostra", "mostrar", "mostre", "lista", "listar", "liste",
  "resumo", "extrato", "conta", "quanto",
];
const VIEW_PHRASES = ["como esta", "como ta", "como anda"];
const NUM_WORDS_GLOBAL: Record<string, number> = {
  um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
  seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  onze: 11, doze: 12, treze: 13, quatorze: 14, catorze: 14, quinze: 15,
  dezesseis: 16, dezessete: 17, dezoito: 18, dezenove: 19, vinte: 20,
  "vinte e um": 21, "vinte e uma": 21, "vinte e dois": 22, "vinte e duas": 22,
  "vinte e tres": 23, "vinte e quatro": 24, "vinte e cinco": 25,
  "vinte e seis": 26, "vinte e sete": 27, "vinte e oito": 28, "vinte e nove": 29,
  trinta: 30,
};

// Resolve um número de mesa a partir de um trecho de texto (já normalizado).
// Aceita dígitos ("5"), por extenso ("cinco", "vinte e um").
function parseTableNumber(s: string): string | null {
  const t = s.trim();
  if (!t) return null;
  if (/^\d+$/.test(t)) return t;
  const n = NUM_WORDS_GLOBAL[t];
  return n !== undefined ? String(n) : null;
}
function parseQtyToken(token: string): number | null {
  if (/^\d+$/.test(token)) {
    const n = parseInt(token, 10);
    return n >= 1 ? n : null;
  }
  return NUM_WORDS_GLOBAL[token] ?? null;
}
function extractQtyProductFromTail(s: string): { qty: number; productText: string } | null {
  const t = s.trim();
  if (!t) return null;
  const m = t.match(/^(\S+)\s+(.+)$/);
  if (m) {
    const qty = parseQtyToken(m[1]);
    if (qty !== null) return { qty, productText: m[2].trim() };
  }
  return { qty: 1, productText: t };
}

function parseCommand(raw: string): Command {
  const text = normalize(raw);
  if (!text) return { kind: "PARSE_ERROR", raw };

  if (/^(?:\/start|\/help|ajuda|help|comandos|menu|ola|oi|opa|bom\s+dia|boa\s+tarde|boa\s+noite)$/.test(text)) {
    return { kind: "HELP" };
  }

  // UNDO: aceita "undo", "desfazer", "desfaz", "volta", "voltar", "anula", "anular", "cancela ultima"
  // opcionalmente seguido de "tudo|todos|todas|all|geral"
  const undoMatch = text.match(/^(?:undo|desfa(?:zer|z|ca)|volta(?:r)?|anula(?:r)?|cancela(?:r)?\s+ultima?)(?:\s+(tudo|todos|todas|all|geral))?$/);
  if (undoMatch) return { kind: "UNDO", all: !!undoMatch[1] };

  // RELATÓRIO: muitas formas de pedir o resumo do dia
  if (/^(?:relatorio|relatório|ranking|fechamento|resumo(?:\s+(?:do\s+)?dia)?|fecha(?:r)?\s+dia|balanco|balanço|me\s+(?:da|de)\s+o?\s*relatorio|gera(?:r)?\s+relatorio)$/.test(text)) {
    return { kind: "REPORT" };
  }

  // ESTOQUE CRÍTICO
  if (/^(?:estoque(?:\s+(?:critico|crítico|baixo|zerado|acabando|em\s+falta))?|criticos|críticos|o\s+que\s+(?:ta|esta)\s+acabando|falta(?:ndo)?\s+(?:o\s+)?que)$/.test(text)) {
    return { kind: "STOCK_CRITICAL" };
  }

  // NOTIFICAÇÕES on/off
  const notifM = text.match(/^(?:notificacoes|notificações|notif|alertas|avisos)\s+(on|off|ligar?|desligar?|ativa(?:r)?|desativa(?:r)?|sim|nao|não)$/);
  if (notifM) {
    const v = notifM[1];
    const on = ["on", "ligar", "liga", "ativar", "ativa", "sim"].includes(v);
    return { kind: "NOTIFY_TOGGLE", on };
  }

  // STATUS de mesa — bem permissivo:
  //   "mesa 5 status", "status mesa 5", "status 5", "status da mesa cinco",
  //   "situacao mesa 3", "como ta a mesa 4 status", "info mesa 2"
  // Aceita dígitos OU número por extenso (até 30, incluindo "vinte e um").
  const STATUS_WORDS = "(?:status|situacao|situação|info|informacao|informação|estado)";
  const NUM_WORD_RE = "(?:\\d+|vinte\\s+e\\s+(?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove)|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta)";
  const stPatterns = [
    new RegExp(`^mesa\\s+(${NUM_WORD_RE})\\s+${STATUS_WORDS}$`),
    new RegExp(`^${STATUS_WORDS}\\s+(?:da\\s+|do\\s+|na\\s+|no\\s+)?mesa\\s+(${NUM_WORD_RE})$`),
    new RegExp(`^${STATUS_WORDS}\\s+(${NUM_WORD_RE})$`),
  ];
  for (const re of stPatterns) {
    const m = text.match(re);
    if (m) {
      const t = parseTableNumber(m[1]);
      if (t) return { kind: "TABLE_STATUS", table: t };
    }
  }

  // SET_TABLE: "mesa N" sozinho — aceita extenso também.
  const setT = text.match(new RegExp(`^mesa\\s+(${NUM_WORD_RE})$`));
  if (setT) {
    const t = parseTableNumber(setT[1]);
    if (t) return { kind: "SET_TABLE", table: t };
  }

  // VIEW: "mesa N ver pedido" / "mesa N ver" / "mesa N pedido" / "ver [pedido] [da/na] mesa N"
  const viewA = text.match(new RegExp(`^mesa\\s+(${NUM_WORD_RE})\\s+(?:ver(?:\\s+pedido)?|pedido|detalhe(?:s)?)$`));
  if (viewA) {
    const t = parseTableNumber(viewA[1]);
    if (t) return { kind: "VIEW", table: t };
  }
  const viewB = text.match(new RegExp(`^(?:ver(?:\\s+pedido)?|pedido|detalhe(?:s)?)\\s+(?:da\\s+|na\\s+|do\\s+|no\\s+)?mesa\\s+(${NUM_WORD_RE})$`));
  if (viewB) {
    const t = parseTableNumber(viewB[1]);
    if (t) return { kind: "VIEW", table: t };
  }

  // VIEW natural (mantém regex original com dígitos — heurística, não vale a pena complicar com extenso aqui).
  {
    const tableMatch = text.match(/\bmesa\s+(\d+)\b/);
    if (tableMatch) {
      const tokens = text.split(/\s+/);
      const hasViewToken = tokens.some((t) => VIEW_TOKENS.includes(t));
      const hasViewPhrase = VIEW_PHRASES.some((p) => text.includes(p));
      const hasOp = tokens.some((t) => ALL_OPS.includes(t)) || /[+\-]/.test(text);
      const qtyProductRe = /\b(\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\s+(?!mesa\b)[a-z]/;
      const stripped = text.replace(/\bmesa\s+\d+\b/g, " ");
      const hasQtyProduct = qtyProductRe.test(stripped);
      if ((hasViewToken || hasViewPhrase) && !hasOp && !hasQtyProduct) {
        return { kind: "VIEW", table: tableMatch[1] };
      }
    }
  }
  const opAlt = ALL_OPS.map((o) => o.replace(/[+\-]/g, "\\$&")).join("|");

  const classify = (op: string): "ADD" | "REMOVE" =>
    ADD_OPS.includes(op) ? "ADD" : "REMOVE";

  // Números por extenso (1–10)
  const NUM_WORDS: Record<string, number> = {
    um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5,
    seis: 6, sete: 7, oito: 8, nove: 9, dez: 10,
  };
  const parseQty = (token: string): number | null => {
    if (/^\d+$/.test(token)) {
      const n = parseInt(token, 10);
      return n >= 1 ? n : null;
    }
    const w = NUM_WORDS[token];
    return w ?? null;
  };

  // Extrai qty + produto de uma string ("2 coca", "um bovino" ou "coca")
  const extractQtyProduct = (s: string): { qty: number; productText: string } | null => {
    const t = s.trim();
    if (!t) return null;
    const m = t.match(/^(\S+)\s+(.+)$/);
    if (m) {
      const qty = parseQty(m[1]);
      if (qty !== null) return { qty, productText: m[2].trim() };
    }
    return { qty: 1, productText: t };
  };

  // Forma 1 (canônica): "mesa N <op> [qty] <produto>"
  const f1 = text.match(new RegExp(`^mesa\\s+(\\d+)\\s+(${opAlt})\\s+(.+)$`));
  if (f1) {
    const table = f1[1];
    const kind = classify(f1[2]);
    const parsed = extractQtyProduct(f1[3]);
    if (!parsed) return { kind: "PARSE_ERROR", raw };
    return { kind, table, ...parsed };
  }

  // Forma 2: "<op> [qty] <produto> {na|no|da|do|pra|para} mesa N"
  const f2 = text.match(new RegExp(`^(${opAlt})\\s+(.+?)\\s+(?:na|no|da|do|pra|para)\\s+mesa\\s+(\\d+)$`));
  if (f2) {
    const kind = classify(f2[1]);
    const table = f2[3];
    const parsed = extractQtyProduct(f2[2]);
    if (!parsed) return { kind: "PARSE_ERROR", raw };
    return { kind, table, ...parsed };
  }

  // Forma 3: "<op> [qty] <produto> mesa N" (sem preposição)
  const f3 = text.match(new RegExp(`^(${opAlt})\\s+(.+?)\\s+mesa\\s+(\\d+)$`));
  if (f3) {
    const kind = classify(f3[1]);
    const table = f3[3];
    const parsed = extractQtyProduct(f3[2]);
    if (!parsed) return { kind: "PARSE_ERROR", raw };
    return { kind, table, ...parsed };
  }

  // ─── Fallback NOMESA (modo turbo): linha sem "mesa N", mas com operador ou gatilho VIEW ───
  const hasTableHere = /\bmesa\s+\d+\b/.test(text);
  if (!hasTableHere) {
    const tokensHere = text.split(/\s+/);

    // VIEW_NOMESA: gatilho de consulta sem operador e sem qty+produto
    const hasViewToken = tokensHere.some((t) => VIEW_TOKENS.includes(t));
    const hasViewPhrase = VIEW_PHRASES.some((p) => text.includes(p));
    const hasOpHere = tokensHere.some((t) => ALL_OPS.includes(t)) || /[+\-]/.test(text);
    const qtyProductRe = /\b(\d+|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez)\s+[a-z]/;
    const hasQtyProduct = qtyProductRe.test(text);

    if ((hasViewToken || hasViewPhrase) && !hasOpHere && !hasQtyProduct) {
      return { kind: "VIEW_NOMESA" };
    }

    // ADD_NOMESA / REMOVE_NOMESA: começa com operador, seguido de [qty] <produto>
    const fNo = text.match(new RegExp(`^(${opAlt})\\s+(.+)$`));
    if (fNo) {
      const op = fNo[1];
      const kind = ADD_OPS.includes(op) ? "ADD_NOMESA" : "REMOVE_NOMESA";
      const parsed = extractQtyProduct(fNo[2]);
      if (parsed) return { kind, qty: parsed.qty, productText: parsed.productText };
    }
  }

  // Hint para mensagem de erro mais útil.
  // Semântica:
  //   no_op       = tem mesa, faltou ação (+/-/mais/tira…)
  //   no_table    = tem ação, faltou mesa
  //   no_product  = tem mesa e ação, faltou produto/qty reconhecível
  //   generic     = não deu pra identificar nada
  const tokensAll = text.split(/\s+/);
  const hasOpAny = tokensAll.some((t) => ALL_OPS.includes(t)) || /[+\-]/.test(text);
  const hasTable = /\bmesa\s+\d+\b/.test(text);
  let hint: "no_op" | "no_product" | "no_table" | "no_qty" | "generic" = "generic";
  if (hasTable && hasOpAny) hint = "no_product";
  else if (hasTable && !hasOpAny) hint = "no_op";
  else if (!hasTable && hasOpAny) hint = "no_table";
  return { kind: "PARSE_ERROR", raw, hint };
}

// ─────────────────────────── modo turbo: resolver contexto ───────────────────────────

async function resolveWithContext(
  cmd: Command,
  chatId: number,
  userId?: number,
  chatType?: ChatType,
): Promise<Command> {
  if (cmd.kind === "ADD_NOMESA" || cmd.kind === "REMOVE_NOMESA") {
    const table = await getLastTable(chatId, userId, chatType);
    const originalKind = cmd.kind === "ADD_NOMESA" ? "ADD" : "REMOVE";
    if (!table) return { kind: "NEEDS_TABLE", originalKind };
    return { kind: originalKind, table, qty: cmd.qty, productText: cmd.productText, fromContext: true };
  }
  if (cmd.kind === "VIEW_NOMESA") {
    const table = await getLastTable(chatId, userId, chatType);
    if (!table) return { kind: "NEEDS_TABLE", originalKind: "VIEW" };
    return { kind: "VIEW", table, fromContext: true };
  }
  return cmd;
}

// ─────────────────────────── domain ───────────────────────────

type Product = {
  id: string;
  name: string;
  price: number;
  active: boolean;
  category: string;
};

type OrderRow = {
  id: string;
  table_name: string;
  original_table_name: string | null;
  status: string;
  version: number;
  total: number | null;
};

type OrderItem = {
  id?: string;
  order_id?: string;
  product_id: string | null;
  product_name: string;
  product_price: number;
  quantity: number;
  note: string | null;
  subtotal: number;
  waiter_name?: string | null;
};

type ProductGroup = {
  id: string;
  name: string;
  trigger_product_name: string;
  member_names: string[];
  category: string;
  icon?: string;
};

type ProductResolution =
  | { kind: "found"; product: Product; fuzzyFrom?: string }
  | { kind: "ambiguous"; candidates: Product[] }
  | { kind: "not_found" }
  | { kind: "is_group_trigger"; group: ProductGroup; variants: string[] }
  | { kind: "out_of_stock"; product: Product }
  | { kind: "no_linked_product"; itemName: string };

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// ─────────────────────────── TEST MODE ───────────────────────────
// Ativado por env TEST_MODE=true + TEST_CHAT_ID=<id>.
// Quando o chat atual é o de teste:
//  - bypass de whitelist
//  - sendTelegram/answerCallback/editTelegramMessage NÃO chamam Telegram (capturam em buffer)
//  - p_should_print sempre false (não enfileira impressão)
//  - mesa de teste isolada: prefixo "T-" → cleanup deleta apenas estas
const TEST_MODE = (Deno.env.get("TEST_MODE") ?? "").toLowerCase() === "true";
const TEST_CHAT_ID_RAW = Deno.env.get("TEST_CHAT_ID");
const TEST_CHAT_ID = TEST_CHAT_ID_RAW ? Number(TEST_CHAT_ID_RAW) : null;
const TEST_TABLE_PREFIX = "999"; // mesas 9990-9999 reservadas para testes

type CapturedMessage = { chatId: number; text: string; keyboard?: InlineButton[][]; kind: "send" | "edit" | "answer"; messageId?: number };
let testCaptureBuffer: CapturedMessage[] = [];
let currentChatIsTest = false;

function isTestChat(chatId: number | undefined | null): boolean {
  return TEST_MODE && TEST_CHAT_ID !== null && chatId === TEST_CHAT_ID;
}

function setTestContext(chatId: number | undefined | null) {
  currentChatIsTest = isTestChat(chatId);
}

function clearTestContext() {
  currentChatIsTest = false;
}

// shouldPrint(): chamado pelas RPCs. Em test mode, força false.
function shouldPrint(defaultValue = true): boolean {
  return currentChatIsTest ? false : defaultValue;
}

function drainTestBuffer(): CapturedMessage[] {
  const out = testCaptureBuffer;
  testCaptureBuffer = [];
  return out;
}

async function cleanupTestData(): Promise<{ orders_deleted: number; items_deleted: number; settings_deleted: number }> {
  // Deleta pedidos da mesa de teste (qualquer table_name começando com T-).
  const { data: testOrders } = await sb
    .from("orders")
    .select("id")
    .or(`table_name.like.${TEST_TABLE_PREFIX}_,original_table_name.like.${TEST_TABLE_PREFIX}_`);
  const ids = (testOrders ?? []).map((o: any) => o.id);
  let itemsDeleted = 0;
  if (ids.length > 0) {
    const { count } = await sb.from("order_items").delete({ count: "exact" }).in("order_id", ids);
    itemsDeleted = count ?? 0;
    await sb.from("orders").delete().in("id", ids);
  }
  // Limpa contexto de mesa do chat de teste
  let settingsDeleted = 0;
  if (TEST_CHAT_ID !== null) {
    const { count } = await sb
      .from("settings")
      .delete({ count: "exact" })
      .like("key", `telegram_last_table:${TEST_CHAT_ID}%`);
    settingsDeleted = count ?? 0;
  }
  return { orders_deleted: ids.length, items_deleted: itemsDeleted, settings_deleted: settingsDeleted };
}

async function getAllowedChats(): Promise<Set<number> | null> {
  const { data } = await sb
    .from("settings")
    .select("value")
    .eq("key", "telegram_allowed_chats")
    .maybeSingle();
  let baseSet: Set<number> | null = null;
  if (data?.value) {
    try {
      const arr = JSON.parse(data.value);
      if (Array.isArray(arr)) baseSet = new Set(arr.map((x) => Number(x)));
    } catch {
      baseSet = new Set(
        String(data.value)
          .split(",")
          .map((s) => Number(s.trim()))
          .filter((n) => !Number.isNaN(n)),
      );
    }
  }
  // Em TEST_MODE, garante que o chat de teste é sempre permitido (sem mexer no settings real).
  if (TEST_MODE && TEST_CHAT_ID !== null) {
    if (!baseSet) baseSet = new Set();
    baseSet.add(TEST_CHAT_ID);
  }
  return baseSet;
}

async function getProductGroups(): Promise<ProductGroup[]> {
  const { data } = await sb
    .from("settings")
    .select("value")
    .eq("key", "product_groups")
    .maybeSingle();
  if (!data?.value) return [];
  try {
    const arr = JSON.parse(data.value);
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function resolveTable(table: string): Promise<OrderRow | null> {
  const { data } = await sb
    .from("orders")
    .select("id, table_name, original_table_name, status, version, total")
    .in("status", ["new", "preparing", "done"])
    .or(`original_table_name.eq.${table},and(original_table_name.is.null,table_name.eq.${table})`)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as OrderRow) ?? null;
}

async function resolveProduct(text: string): Promise<ProductResolution> {
  // Aplica singularize antes de buscar (cocas->coca, bovinos->bovino, aguas->agua).
  const singular = singularize(normalize(text));
  const norm = singular;

  // 1. find_inventory_item_by_text (slug/aliases exato)
  const { data: invExact } = await sb.rpc("find_inventory_item_by_text", { p_text: singular });
  let inventoryItem: any = Array.isArray(invExact) && invExact.length > 0 ? invExact[0] : null;

  // 2. Fallback: busca direta em products por nome
  if (!inventoryItem) {
    const { data: prods } = await sb
      .from("products")
      .select("id, name, price, active, category")
      .eq("active", true);
    const all: Product[] = (prods ?? []) as Product[];
    const matches = all.filter((p) => normalize(p.name).includes(norm));

    if (matches.length === 0) {
      // Fuzzy match (Levenshtein ≤2) sobre products antes de cair em inventory_items.
      const userTokens = norm.split(/\s+/).filter((t) => t.length > 3 && !/\d/.test(t));
      if (userTokens.length > 0) {
        const fuzzyHits: Product[] = [];
        for (const p of all) {
          const candTokens = normalize(p.name).split(/\s+/).filter((t) => t.length > 2);
          let hit = false;
          for (const ut of userTokens) {
            for (const ct of candTokens) {
              if (Math.abs(ut.length - ct.length) > 2) continue;
              if (levenshtein(ut, ct) <= 2) { hit = true; break; }
            }
            if (hit) break;
          }
          if (hit) fuzzyHits.push(p);
        }
        if (fuzzyHits.length === 1) {
          const r = await checkGroupOrReturn(fuzzyHits[0]);
          if (r.kind === "found") return { ...r, fuzzyFrom: text.trim() };
          return r;
        }
        if (fuzzyHits.length >= 2 && fuzzyHits.length <= 5) {
          return { kind: "ambiguous", candidates: fuzzyHits };
        }
      }

      // Tenta também inventory_items por nome
      const { data: invFuzzy } = await sb
        .from("inventory_items")
        .select("*")
        .eq("is_active", true);
      const invMatches = (invFuzzy ?? []).filter((i: any) => normalize(i.name).includes(norm));
      if (invMatches.length === 1 && invMatches[0].product_id) {
        inventoryItem = invMatches[0];
      } else if (invMatches.length === 1 && !invMatches[0].product_id) {
        return { kind: "no_linked_product", itemName: invMatches[0].name };
      } else {
        return { kind: "not_found" };
      }
    } else if (matches.length === 1) {
      return await checkGroupOrReturn(matches[0]);
    } else if (matches.length <= 5) {
      return { kind: "ambiguous", candidates: matches };
    } else {
      return { kind: "ambiguous", candidates: matches.slice(0, 5) };
    }
  }

  // Tem inventory item — resolver produto
  if (!inventoryItem.product_id) {
    return { kind: "no_linked_product", itemName: inventoryItem.name };
  }
  const { data: prod } = await sb
    .from("products")
    .select("id, name, price, active, category")
    .eq("id", inventoryItem.product_id)
    .maybeSingle();
  if (!prod) return { kind: "not_found" };
  if (!prod.active) return { kind: "out_of_stock", product: prod as Product };
  return await checkGroupOrReturn(prod as Product);
}

async function checkGroupOrReturn(product: Product): Promise<ProductResolution> {
  const groups = await getProductGroups();
  const isTrigger = groups.find(
    (g) => normalize(g.trigger_product_name) === normalize(product.name),
  );
  if (isTrigger) {
    return { kind: "is_group_trigger", group: isTrigger, variants: isTrigger.member_names };
  }
  return { kind: "found", product };
}

// Sugere até 3 produtos próximos (token-by-token, ranqueado por nº de matches).
async function suggestProducts(text: string): Promise<Product[]> {
  const norm = singularize(normalize(text));
  const tokens = norm.split(/\s+/).filter((t) => t.length >= 3 && !/^\d+$/.test(t));
  if (tokens.length === 0) return [];
  const { data: prods } = await sb
    .from("products")
    .select("id, name, price, active, category")
    .eq("active", true);
  const all = (prods ?? []) as Product[];
  return all
    .map((p) => {
      const n = normalize(p.name);
      const hits = tokens.reduce((acc, t) => acc + (n.includes(t) ? 1 : 0), 0);
      return { p, hits };
    })
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 3)
    .map((s) => s.p);
}

// ─────────────────────────── merge logic ───────────────────────────

function applyAdd(items: OrderItem[], product: Product, qty: number): OrderItem[] {
  const out = items.map((i) => ({ ...i }));
  const idx = out.findIndex(
    (i) => i.product_id === product.id && (i.note ?? "") === "",
  );
  if (idx >= 0) {
    out[idx].quantity += qty;
    out[idx].subtotal = out[idx].quantity * out[idx].product_price;
  } else {
    out.push({
      product_id: product.id,
      product_name: product.name,
      product_price: product.price,
      quantity: qty,
      note: null,
      subtotal: product.price * qty,
    });
  }
  return out;
}

type RemoveResult =
  | { kind: "ok"; items: OrderItem[]; removedQty: number }
  | { kind: "not_in_order" }
  | { kind: "partial"; items: OrderItem[]; removedQty: number; requested: number };

function applyRemove(items: OrderItem[], product: Product, qty: number): RemoveResult {
  const out = items.map((i) => ({ ...i }));
  const idx = out.findIndex((i) => i.product_id === product.id);
  if (idx < 0) return { kind: "not_in_order" };

  const existing = out[idx].quantity;
  const removed = Math.min(qty, existing);
  const newQty = existing - removed;
  if (newQty <= 0) {
    out.splice(idx, 1);
  } else {
    out[idx].quantity = newQty;
    out[idx].subtotal = newQty * out[idx].product_price;
  }
  if (removed < qty) return { kind: "partial", items: out, removedQty: removed, requested: qty };
  return { kind: "ok", items: out, removedQty: removed };
}

function computeDelta(before: OrderItem[], after: OrderItem[]): OrderItem[] {
  const delta: OrderItem[] = [];
  for (const a of after) {
    const b = before.find(
      (x) => x.product_id === a.product_id && (x.note ?? "") === (a.note ?? ""),
    );
    const diff = (a.quantity ?? 0) - (b?.quantity ?? 0);
    if (diff > 0) {
      delta.push({
        product_id: a.product_id,
        product_name: a.product_name,
        product_price: a.product_price,
        quantity: diff,
        note: a.note,
        subtotal: a.product_price * diff,
      });
    }
  }
  return delta;
}

// ─────────────────────────── retry ───────────────────────────

async function withVersionRetry<T>(fn: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastErr: any;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      return await fn();
    } catch (e: any) {
      lastErr = e;
      const msg = String(e?.message ?? e);
      if (!msg.includes("version_conflict")) throw e;
      if (i === maxAttempts) break;
      await sleep(150 * i);
    }
  }
  throw lastErr;
}

// ─────────────────────────── execute ───────────────────────────

async function executeAdd(
  table: string,
  product: Product,
  qty: number,
  waiter: string,
): Promise<string> {
  return await withVersionRetry(async () => {
    const order = await resolveTable(table);
    if (!order) {
      // Criar pedido novo
      const item = {
        product_id: product.id,
        product_name: product.name,
        product_price: product.price,
        quantity: qty,
        note: null,
        subtotal: product.price * qty,
      };
      try {
        await sb.rpc("create_order", {
          p_table_name: table,
          p_original_table_name: table,
          p_waiter_name: waiter,
          p_total: product.price * qty,
          p_items: [item],
          p_should_print: shouldPrint(true),
        });
        return `✅ Mesa ${table} criada com ${qty}× ${product.name} — ${fmtBRL(product.price * qty)}`;
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        if (msg.includes("table_already_in_use")) {
          // race — força retry pegando o pedido recém-criado
          throw new Error("version_conflict: race on create");
        }
        throw e;
      }
    }

    // Atualizar pedido existente
    const { data: items } = await sb
      .from("order_items")
      .select("*")
      .eq("order_id", order.id);
    const before: OrderItem[] = (items ?? []) as OrderItem[];
    const after = applyAdd(before, product, qty);
    const delta = computeDelta(before, after);
    const total = after.reduce((s, i) => s + Number(i.subtotal), 0);

    await sb.rpc("update_order_items", {
      p_order_id: order.id,
      p_total: total,
      p_items: after.map((i) => ({
        product_id: i.product_id,
        product_name: i.product_name,
        product_price: i.product_price,
        quantity: i.quantity,
        note: i.note,
        subtotal: i.subtotal,
        waiter_name: waiter,
      })),
      p_delta_items: delta.length > 0 ? delta : null,
      p_print_type: "extra",
      p_expected_version: order.version,
      p_should_print: shouldPrint(true),
    });

    const itemCount = after.reduce((s, i) => s + i.quantity, 0);
    return (
      `✅ Mesa ${table} → +${qty} ${product.name} (${fmtBRL(product.price * qty)})\n` +
      `   Total da mesa: ${fmtBRL(total)} (${itemCount} itens)`
    );
  });
}

async function executeRemove(
  table: string,
  product: Product,
  qty: number,
  waiter: string,
): Promise<string> {
  return await withVersionRetry(async () => {
    const order = await resolveTable(table);
    if (!order) return `⚠️ Mesa ${table} não tem pedido aberto.`;

    const { data: items } = await sb.from("order_items").select("*").eq("order_id", order.id);
    const before: OrderItem[] = (items ?? []) as OrderItem[];
    const result = applyRemove(before, product, qty);

    if (result.kind === "not_in_order") {
      return `⚠️ Mesa ${table} não tem "${product.name}".`;
    }

    const after = result.items;
    const total = after.reduce((s, i) => s + Number(i.subtotal), 0);

    await sb.rpc("update_order_items", {
      p_order_id: order.id,
      p_total: total,
      p_items: after.map((i) => ({
        product_id: i.product_id,
        product_name: i.product_name,
        product_price: i.product_price,
        quantity: i.quantity,
        note: i.note,
        subtotal: i.subtotal,
        waiter_name: waiter,
      })),
      p_delta_items: null,
      p_print_type: null,
      p_expected_version: order.version,
      p_should_print: shouldPrint(false),
    });

    const itemCount = after.reduce((s, i) => s + i.quantity, 0);
    let msg = `➖ Mesa ${table} → -${result.removedQty} ${product.name}\n` +
      `   Total da mesa: ${fmtBRL(total)} (${itemCount} itens)`;
    if (result.kind === "partial") {
      msg = `⚠️ Removidos ${result.removedQty} (mesa só tinha ${result.removedQty}).\n` + msg;
    }
    return msg;
  });
}

async function executeView(table: string): Promise<string> {
  const order = await resolveTable(table);
  if (!order) return `⚠️ Mesa ${table} não tem pedido aberto.`;
  const { data: items } = await sb
    .from("order_items")
    .select("*")
    .eq("order_id", order.id);
  const list = (items ?? []) as OrderItem[];
  if (list.length === 0) return `📋 Mesa ${table}: pedido vazio.`;
  const lines = list.map(
    (i) => `   ${i.quantity}× ${i.product_name} — ${fmtBRL(Number(i.subtotal))}`,
  );
  const total = list.reduce((s, i) => s + Number(i.subtotal), 0);
  return (
    `📋 Mesa ${table}:\n` +
    lines.join("\n") +
    `\n   ───────────────\n   Total: ${fmtBRL(total)}`
  );
}

// ─────────────────────────── batch / undo helpers ───────────────────────────

type BatchOp = { kind: "ADD" | "REMOVE"; product: Product; qty: number; rawQty: number };
type BatchOutcome = {
  ok: boolean;
  text: string;
  ops: UndoOp[];          // operações realmente aplicadas (para undo)
  total: number;
  itemCount: number;
  conflict?: boolean;
  errMsg?: string;
};

// Executa N operações ADD/REMOVE para a mesma mesa, em UMA transação update_order_items.
// Imprime delta consolidado uma única vez (apenas itens com diff>0).
async function executeBatchForTable(
  table: string,
  ops: BatchOp[],
  waiter: string,
  printEnabled: boolean,
): Promise<BatchOutcome> {
  return await withVersionRetry(async () => {
    const order = await resolveTable(table);
    const undoOps: UndoOp[] = [];

    if (!order) {
      // Sem pedido — só ADDs criam mesa. REMOVEs viram aviso.
      const adds = ops.filter((o) => o.kind === "ADD");
      const removes = ops.filter((o) => o.kind === "REMOVE");
      if (adds.length === 0) {
        return {
          ok: false,
          text: `⚠️ Mesa ${table} não tem pedido aberto (nenhum ADD para criar).`,
          ops: [],
          total: 0,
          itemCount: 0,
        };
      }
      // Agrega ADDs no mesmo product_id
      let acc: OrderItem[] = [];
      for (const o of adds) {
        acc = applyAdd(acc, o.product, o.qty);
        undoOps.push({ op: "a", productId: o.product.id, productName: o.product.name, qty: o.qty });
      }
      const total = acc.reduce((s, i) => s + Number(i.subtotal), 0);
      try {
        await sb.rpc("create_order", {
          p_table_name: table,
          p_original_table_name: table,
          p_waiter_name: waiter,
          p_total: total,
          p_items: acc.map((i) => ({
            product_id: i.product_id,
            product_name: i.product_name,
            product_price: i.product_price,
            quantity: i.quantity,
            note: i.note,
            subtotal: i.subtotal,
          })),
          p_should_print: shouldPrint(printEnabled),
        });
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        if (msg.includes("table_already_in_use")) throw new Error("version_conflict: race on create");
        throw e;
      }
      const lines = adds.map((o) => `   +${o.qty} ${o.product.name}`);
      const removedNote = removes.length > 0
        ? `\n   ⚠️ Ignorados ${removes.length} REMOVE (mesa não existia).`
        : "";
      return {
        ok: true,
        text: `✅ Mesa ${table} criada:\n${lines.join("\n")}${removedNote}`,
        ops: undoOps,
        total,
        itemCount: acc.reduce((s, i) => s + i.quantity, 0),
      };
    }

    // Pedido existe — aplica todas as ops em memória
    const { data: items } = await sb.from("order_items").select("*").eq("order_id", order.id);
    const before: OrderItem[] = (items ?? []) as OrderItem[];
    let working = before.map((i) => ({ ...i }));
    const summaryLines: string[] = [];

    for (const o of ops) {
      if (o.kind === "ADD") {
        working = applyAdd(working, o.product, o.qty);
        summaryLines.push(`   +${o.qty} ${o.product.name}`);
        undoOps.push({ op: "a", productId: o.product.id, productName: o.product.name, qty: o.qty });
      } else {
        const r = applyRemove(working, o.product, o.qty);
        if (r.kind === "not_in_order") {
          summaryLines.push(`   ⚠️ ${o.product.name} não estava no pedido`);
        } else {
          working = r.items;
          summaryLines.push(
            r.kind === "partial"
              ? `   -${r.removedQty} ${o.product.name} (pediu ${o.qty})`
              : `   -${r.removedQty} ${o.product.name}`,
          );
          undoOps.push({ op: "r", productId: o.product.id, productName: o.product.name, qty: r.removedQty });
        }
      }
    }

    const after = working;
    const delta = computeDelta(before, after);
    const total = after.reduce((s, i) => s + Number(i.subtotal), 0);
    const itemCount = after.reduce((s, i) => s + i.quantity, 0);

    await sb.rpc("update_order_items", {
      p_order_id: order.id,
      p_total: total,
      p_items: after.map((i) => ({
        product_id: i.product_id,
        product_name: i.product_name,
        product_price: i.product_price,
        quantity: i.quantity,
        note: i.note,
        subtotal: i.subtotal,
        waiter_name: waiter,
      })),
      p_delta_items: printEnabled && delta.length > 0 ? delta : null,
      p_print_type: printEnabled && delta.length > 0 ? "extra" : null,
      p_expected_version: order.version,
      p_should_print: shouldPrint(printEnabled && delta.length > 0),
    });

    return {
      ok: true,
      text: `✅ Mesa ${table} (${ops.length} ações):\n${summaryLines.join("\n")}\n   Total: ${fmtBRL(total)} (${itemCount} itens)`,
      ops: undoOps,
      total,
      itemCount,
    };
  });
}

// Inverte ops e aplica como uma única transação SEM imprimir.
async function executeUndoOps(table: string, ops: UndoOp[], waiter: string): Promise<string> {
  // Mapeia ops originais para inversas: 'a' (foi ADD) → REMOVE, 'r' (foi REMOVE) → ADD
  const products = await fetchProductsByIds(ops.map((o) => o.productId));
  const byId = new Map(products.map((p) => [p.id, p]));
  const inverseOps: BatchOp[] = [];
  for (const o of ops) {
    const p = byId.get(o.productId);
    if (!p) continue;
    inverseOps.push({
      kind: o.op === "a" ? "REMOVE" : "ADD",
      product: p,
      qty: o.qty,
      rawQty: o.qty,
    });
  }
  if (inverseOps.length === 0) return "↩️ Nada para desfazer.";
  const result = await executeBatchForTable(table, inverseOps, waiter, /*printEnabled*/ false);
  if (!result.ok) return `↩️ Falha ao desfazer: ${result.text}`;
  return `↩️ Operação desfeita (mesa ${table}). Total atual: ${fmtBRL(result.total)}.`;
}

async function fetchProductsByIds(ids: string[]): Promise<Product[]> {
  if (ids.length === 0) return [];
  const { data } = await sb
    .from("products")
    .select("id, name, price, active, category")
    .in("id", ids);
  return (data ?? []) as Product[];
}

// ─────────────────────────── telegram ───────────────────────────

async function sendTelegram(chatId: number, text: string, keyboard?: InlineButton[][]) {
  if (isTestChat(chatId)) {
    testCaptureBuffer.push({ chatId, text, keyboard, kind: "send" });
    return;
  }
  try {
    const body: any = { chat_id: chatId, text };
    if (keyboard && keyboard.length > 0) {
      body.reply_markup = { inline_keyboard: keyboard };
    }
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) console.error("sendMessage falhou:", res.status, await res.text());
  } catch (e) {
    console.error("sendTelegram erro:", e);
  }
}

async function answerCallback(callbackId: string, text?: string) {
  if (currentChatIsTest) {
    testCaptureBuffer.push({ chatId: TEST_CHAT_ID ?? 0, text: text ?? "", kind: "answer" });
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${TOKEN}/answerCallbackQuery`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callback_query_id: callbackId, text: text ?? "" }),
    });
  } catch (e) {
    console.error("answerCallback erro:", e);
  }
}

async function editTelegramMessage(chatId: number, messageId: number, text: string) {
  if (isTestChat(chatId)) {
    testCaptureBuffer.push({ chatId, text, kind: "edit", messageId });
    return;
  }
  try {
    await fetch(`https://api.telegram.org/bot${TOKEN}/editMessageText`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        reply_markup: { inline_keyboard: [] },
      }),
    });
  } catch (e) {
    console.error("editTelegramMessage erro:", e);
  }
}

// ─────────────────────────── auto-pick determinístico ───────────────────────────

const SIZE_TOKENS = ["350", "473", "269", "600", "1l", "2l", "1.5l", "473ml", "600ml", "350ml"];
const MOD_TOKENS = ["zero", "diet", "light", "lata", "long", "longneck", "gelada"];

function tokensFromText(text: string): string[] {
  const norm = singularize(normalize(text));
  return norm.split(/\s+/).filter(Boolean);
}

function scoreCandidate(userTokens: string[], candidateName: string): number {
  const cand = normalize(candidateName);
  const candTokens = cand.split(/\s+/);
  let score = 0;

  // Tamanho mencionado pelo usuário precisa estar no candidato
  const userSizes = userTokens.filter((t) => SIZE_TOKENS.includes(t));
  for (const sz of userSizes) {
    if (cand.includes(sz)) score += 10;
    else score -= 10;
  }

  // Modificadores
  const userMods = userTokens.filter((t) => MOD_TOKENS.includes(t));
  const candHasZero = /\bzero\b/.test(cand);
  const candHasDiet = /\bdiet\b/.test(cand);
  const candHasLight = /\blight\b/.test(cand);

  for (const m of userMods) {
    if (candTokens.includes(m)) score += 5;
    else score -= 5;
  }
  if (!userMods.includes("zero") && candHasZero) score -= 5;
  if (!userMods.includes("diet") && candHasDiet) score -= 5;
  if (!userMods.includes("light") && candHasLight) score -= 5;

  // Bônus por tokens livres ≥3 letras que casam
  const free = userTokens.filter(
    (t) => t.length >= 3 && !SIZE_TOKENS.includes(t) && !MOD_TOKENS.includes(t),
  );
  for (const t of free) {
    if (cand.includes(t)) score += 1;
  }

  return score;
}

function autoPickFromCandidates<T extends { name: string }>(
  productText: string,
  candidates: T[],
): T | null {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];
  const tokens = tokensFromText(productText);
  if (tokens.length === 0) return null;

  const scored = candidates
    .map((c) => ({ cand: c, score: scoreCandidate(tokens, c.name) }))
    .sort((a, b) => b.score - a.score);

  if (scored[0].score <= 0) return null;
  if (scored[0].score - scored[1].score < 5) return null;
  return scored[0].cand;
}

async function fetchProductsByNames(names: string[]): Promise<Product[]> {
  if (names.length === 0) return [];
  const { data } = await sb
    .from("products")
    .select("id, name, price, active, category")
    .eq("active", true);
  const all = (data ?? []) as Product[];
  const set = new Set(names.map((n) => normalize(n)));
  return all.filter((p) => set.has(normalize(p.name)));
}

// callback_data: "a|<table>|<product_id>|<qty>" | "r|..." | "x"
function buildChoiceKeyboard(
  kind: "ADD" | "REMOVE",
  table: string,
  qty: number,
  candidates: Product[],
): InlineButton[][] {
  const op = kind === "ADD" ? "a" : "r";
  const rows: InlineButton[][] = candidates.slice(0, 8).map((p) => [
    {
      text: `${qty}× ${p.name} — ${fmtBRL(p.price * qty)}`,
      callback_data: `${op}|${table}|${p.id}|${qty}`,
    },
  ]);
  rows.push([{ text: "❌ Cancelar", callback_data: "x" }]);
  return rows;
}

const HELP_TEXT =
  `🤖 Como usar:\n\n` +
  `📌 Adicionar:\n` +
  `  • mesa 3 + 2 coca 350\n` +
  `  • mesa 1 mais um bovino\n` +
  `  • adiciona 2 cocas 350 na mesa 3\n` +
  `  • acrescenta tres bovinos na mesa 2\n\n` +
  `📌 Remover:\n` +
  `  • mesa 1 - 1 agua\n` +
  `  • tira duas aguas da mesa 1\n` +
  `  • remove 1 tulipa mesa 3\n\n` +
  `📌 Consultar:\n` +
  `  • mesa 4 ver pedido\n\n` +
  `💨 Atalhos (até 15 min após usar uma mesa):\n` +
  `  • mais um boi\n` +
  `  • + 1 coca 350\n` +
  `  • tira uma agua\n` +
  `  • ver pedido / total / consultar\n\n` +
  `💡 Aceita números por extenso (um, dois… até dez) e plural simples (cocas, bovinos, aguas).\n` +
  `Em caso de dúvida no produto, o bot pede para especificar.\n\n` +
  `🔍 Modo preview:\n` +
  `Comece a mensagem com "preview" para ver como cada linha seria interpretada SEM executar.\n` +
  `Ex:\n  preview\n  mesa 1 + 2 coca 350\n  tira 1 agua da mesa 1`;

const NEEDS_TABLE_TEXT =
  `⚠️ Não sei qual mesa usar. Envie no formato completo, ex: \`mesa 1 + 1 coca 350\` ` +
  `(ou use uma mesa nos últimos 15 min).`;

// ─────────────────────────── preview (dry-run) ───────────────────────────

async function previewCommand(cmd: Command, chatId: number): Promise<string> {
  if (cmd.kind === "HELP") return `ℹ️ (preview) Mostraria a ajuda.`;
  if (cmd.kind === "REPORT") return `📊 (preview) Geraria o relatório do dia.`;
  if (cmd.kind === "STOCK_CRITICAL") return `📦 (preview) Listaria itens em estoque crítico.`;
  if (cmd.kind === "NOTIFY_TOGGLE") return `🔔 (preview) ${cmd.on ? "Ativaria" : "Desativaria"} as notificações.`;
  if (cmd.kind === "TABLE_STATUS") return `📋 (preview) Mostraria o resumo rápido da mesa ${cmd.table}.`;
  if (cmd.kind === "PARSE_ERROR") {
    return `❓ (preview) Não interpretaria: "${cmd.raw}" — faltou mesa, ação ou produto.`;
  }

  // Resolver contexto para *_NOMESA antes de exibir.
  let ctxNote = "";
  let working: Command = cmd;
  if (cmd.kind === "ADD_NOMESA" || cmd.kind === "REMOVE_NOMESA" || cmd.kind === "VIEW_NOMESA") {
    const ctxTable = await getLastTable(chatId);
    if (!ctxTable) {
      return `⚠️ (preview) Nenhuma mesa em contexto. Envie a mesa explícita.`;
    }
    ctxNote = ` (mesa ${ctxTable} do contexto)`;
    if (cmd.kind === "VIEW_NOMESA") {
      working = { kind: "VIEW", table: ctxTable, fromContext: true };
    } else {
      const k = cmd.kind === "ADD_NOMESA" ? "ADD" : "REMOVE";
      working = { kind: k, table: ctxTable, qty: cmd.qty, productText: cmd.productText, fromContext: true };
    }
  }
  if (working.kind === "NEEDS_TABLE") {
    return `⚠️ (preview) Nenhuma mesa em contexto. Envie a mesa explícita.`;
  }
  if (working.kind === "VIEW") {
    return `📋 (preview${ctxNote}) Mostraria o pedido da mesa ${working.table}.`;
  }
  if (working.kind !== "ADD" && working.kind !== "REMOVE") {
    return `❓ (preview) Comando não suportado.`;
  }

  // ADD/REMOVE — resolve produto sem executar mutação
  const resolution = await resolveProduct(working.productText);
  const op = working.kind === "ADD" ? "+" : "-";
  const verbo = working.kind === "ADD" ? "Adicionaria" : "Removeria";

  switch (resolution.kind) {
    case "not_found": {
      const sugg = await suggestProducts(working.productText);
      const tail = sugg.length > 0 ? ` Sugestões: ${sugg.map((s) => s.name).join(", ")}.` : "";
      return `❓ (preview${ctxNote}) Mesa ${working.table} ${op}${working.qty} "${working.productText}" → produto não encontrado.${tail}`;
    }
    case "ambiguous": {
      const list = resolution.candidates.map((p) => p.name).join(" | ");
      return `🤔 (preview${ctxNote}) Mesa ${working.table} ${op}${working.qty} "${working.productText}" → ambíguo: ${list}.`;
    }
    case "is_group_trigger": {
      const variants = resolution.variants.join(" | ");
      return `📦 (preview${ctxNote}) Mesa ${working.table} ${op}${working.qty} "${working.productText}" → grupo "${resolution.group.name}" com variantes: ${variants}.`;
    }
    case "out_of_stock":
      return `❌ (preview${ctxNote}) Mesa ${working.table} ${op}${working.qty} ${resolution.product.name} → esgotado.`;
    case "no_linked_product":
      return `⚠️ (preview${ctxNote}) "${resolution.itemName}" sem produto vinculado.`;
    case "found":
      return `✅ (preview${ctxNote}) ${verbo} na Mesa ${working.table}: ${op}${working.qty} ${resolution.product.name} (${fmtBRL(resolution.product.price)}).`;
  }
}

// ─────────────────────────── handler ───────────────────────────

type HandlerReply = { text: string; keyboard?: InlineButton[][]; successTable?: string };

function isViewSuccess(text: string): boolean {
  return !text.startsWith("⚠️ Mesa ") || !text.includes("não tem pedido aberto");
}

function isMutationSuccess(kind: "ADD" | "REMOVE", text: string): boolean {
  if (kind === "ADD") return text.startsWith("✅ Mesa ");
  return text.startsWith("➖ Mesa ") || text.startsWith("⚠️ Removidos ");
}

function ctxPrefix(cmd: Extract<Command, { kind: "ADD" | "REMOVE" | "VIEW" }>): string {
  return cmd.fromContext ? `📍 (mesa ${cmd.table}, contexto)\n` : "";
}

async function handleCommand(cmd: Command, waiter: string): Promise<HandlerReply> {
  if (cmd.kind === "HELP") return { text: HELP_TEXT };
  if (cmd.kind === "PARSE_ERROR") {
    let body = `Faltou identificar mesa, ação ou produto.`;
    if (cmd.hint === "no_op") {
      body = `Identifiquei a mesa, mas faltou a ação (+, -, mais, tira…).`;
    } else if (cmd.hint === "no_table") {
      body = `Identifiquei a ação, mas faltou dizer qual mesa.`;
    } else if (cmd.hint === "no_product") {
      body = `Identifiquei a mesa e a ação, mas faltou o produto (ou a quantidade).`;
    }
    return {
      text:
        `❓ Não consegui interpretar: "${cmd.raw}"\n\n` +
        `${body} Exemplos:\n` +
        `  • mesa 3 + 2 coca 350\n` +
        `  • tira 1 agua da mesa 1\n` +
        `  • mesa 4 ver pedido\n\n` +
        `Envie "ajuda" para ver todos os formatos.`,
    };
  }
  if (cmd.kind === "NEEDS_TABLE") {
    return { text: NEEDS_TABLE_TEXT };
  }
  if (cmd.kind === "SET_TABLE") {
    return {
      text: `📍 Mesa ${cmd.table} definida para os próximos comandos (15 min).`,
      successTable: cmd.table,
    };
  }
  if (cmd.kind === "REPORT") {
    try {
      const r = await fetch(`${SUPABASE_URL}/functions/v1/daily-waiter-report`, {
        method: "POST",
        headers: { "Authorization": `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" },
        body: "{}",
      });
      const data = await r.json().catch(() => ({}));
      return { text: data?.preview || "📊 Relatório enviado." };
    } catch (e) {
      return { text: `❌ Falha ao gerar relatório: ${String((e as any)?.message ?? e)}` };
    }
  }
  if (cmd.kind === "STOCK_CRITICAL") {
    const { data } = await sb.from("inventory_items")
      .select("name,current_stock,min_stock,unit")
      .eq("is_active", true)
      .order("current_stock", { ascending: true })
      .limit(50);
    const crit = (data ?? []).filter((i: any) =>
      Number(i.current_stock) <= 0 ||
      (Number(i.min_stock) > 0 && Number(i.current_stock) <= Number(i.min_stock))
    );
    if (crit.length === 0) return { text: "✅ Nenhum item em estoque crítico." };
    const lines = crit.map((i: any) => {
      const icon = Number(i.current_stock) <= 0 ? "🚨" : "⚠️";
      return `${icon} ${i.name}: ${i.current_stock} ${i.unit || ""} (mín ${i.min_stock})`;
    });
    return { text: `📦 *Estoque crítico (${crit.length})*\n\n` + lines.join("\n") };
  }
  if (cmd.kind === "NOTIFY_TOGGLE") {
    const newVal = JSON.stringify({
      orders: cmd.on, payments: cmd.on, stock_critical: cmd.on, daily_report: cmd.on,
      cash_closed: cmd.on, stale_tables: cmd.on,
    });
    await sb.from("settings").upsert({ key: "telegram_notify_config", value: newVal }, { onConflict: "key" });
    return { text: cmd.on ? "🔔 Notificações ATIVADAS." : "🔕 Notificações DESATIVADAS." };
  }
  if (cmd.kind === "TABLE_STATUS") {
    const { data: orders } = await sb
      .from("orders")
      .select("id,table_name,waiter_name,status,total,created_at,updated_at")
      .in("status", ["new", "preparing", "done"])
      .or(`table_name.eq.${cmd.table},original_table_name.eq.${cmd.table}`)
      .order("created_at", { ascending: false })
      .limit(1);
    const order = orders?.[0];
    if (!order) return { text: `Mesa ${cmd.table} está livre.` };
    const { data: items } = await sb.from("order_items")
      .select("product_name,quantity")
      .eq("order_id", order.id);
    const now = Date.now();
    const openedMin = Math.floor((now - new Date(order.created_at).getTime()) / 60000);
    const idleMin = Math.floor((now - new Date(order.updated_at).getTime()) / 60000);
    const fmtDur = (m: number) => m >= 60 ? `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}` : `${m}min`;
    const itemLines = (items ?? []).map((i: any) => `• ${i.quantity}× ${i.product_name}`).join("\n");
    const statusLabel = order.status === "new" ? "novo" : order.status === "preparing" ? "preparando" : "pronto";
    return {
      text:
        `📋 *Mesa ${order.table_name}*\n` +
        `Garçom: ${order.waiter_name || "—"}\n` +
        `Aberta há ${fmtDur(openedMin)} · último item há ${fmtDur(idleMin)}\n` +
        (itemLines ? itemLines + "\n" : "") +
        `Total: *${fmtBRL(Number(order.total || 0))}*\n` +
        `Status: ${statusLabel}`,
    };
  }
  if (cmd.kind === "UNDO") {
    cleanupUndos();
    const chatId = _undoChatId();
    // Carrega stack persistido (multi-isolate safe). Inclui tokens criados em outros isolates.
    const dbStack = await loadChatUndoStackFromDb(chatId);
    if (dbStack.length === 0) return { text: "↩️ Nada para desfazer." };
    const toProcess = cmd.all ? dbStack : [dbStack[dbStack.length - 1]];
    const results: string[] = [];
    const consumedTokens: string[] = [];
    for (const entry of toProcess) {
      try {
        const r = await executeUndoOps(entry.table, entry.ops, waiter);
        results.push(r);
      } catch (e: any) {
        results.push(`❌ Falha ao desfazer mesa ${entry.table}: ${String(e?.message ?? e)}`);
      }
      consumedTokens.push(entry.token);
      pendingUndos.delete(entry.token);
      consumedUndos.set(entry.token, Date.now());
    }
    await deleteUndoTokensFromDb(consumedTokens);
    // Limpa stack in-memory desses tokens.
    const remaining = (chatUndoStack.get(chatId) ?? []).filter((t) => !consumedTokens.includes(t));
    if (remaining.length === 0) chatUndoStack.delete(chatId);
    else chatUndoStack.set(chatId, remaining);
    if (results.length === 0) return { text: "↩️ Nada para desfazer." };
    return { text: results.join("\n") };
  }
  if (cmd.kind === "ADD_NOMESA" || cmd.kind === "REMOVE_NOMESA" || cmd.kind === "VIEW_NOMESA") {
    // Não deveria chegar aqui (resolveWithContext converte antes), defensivo:
    return { text: NEEDS_TABLE_TEXT };
  }
  if (cmd.kind === "VIEW") {
    const text = await executeView(cmd.table);
    return { text: ctxPrefix(cmd) + text, successTable: isViewSuccess(text) ? cmd.table : undefined };
  }

  // ADD/REMOVE
  const prefix = ctxPrefix(cmd);
  const resolution = await resolveProduct(cmd.productText);
  switch (resolution.kind) {
    case "not_found": {
      const sugg = await suggestProducts(cmd.productText);
      if (sugg.length > 0) {
        const keyboard = buildChoiceKeyboard(cmd.kind, cmd.table, cmd.qty, sugg);
        return {
          text: prefix + `❓ Não achei "${cmd.productText}" no cardápio. Talvez:`,
          keyboard,
        };
      }
      return {
        text: prefix + `❓ Não achei "${cmd.productText}" no cardápio.\nVerifique o nome e tente de novo.`,
      };
    }
    case "ambiguous": {
      const picked = autoPickFromCandidates(cmd.productText, resolution.candidates);
      if (picked) {
        return await runExecute(cmd, picked, waiter);
      }
      const keyboard = buildChoiceKeyboard(cmd.kind, cmd.table, cmd.qty, resolution.candidates);
      const op = cmd.kind === "ADD" ? "+" : "-";
      return {
        text: prefix + `🤔 Mesa ${cmd.table} ${op}${cmd.qty} "${cmd.productText}" — escolha a opção:`,
        keyboard,
      };
    }
    case "is_group_trigger": {
      const variantProducts = await fetchProductsByNames(resolution.variants);
      const picked = autoPickFromCandidates(cmd.productText, variantProducts);
      if (picked) {
        return await runExecute(cmd, picked, waiter);
      }
      if (variantProducts.length === 0) {
        const variants = resolution.variants.map((v) => `  • ${v}`).join("\n");
        return {
          text: prefix +
            `📦 "${resolution.group.name}" tem variantes:\n${variants}\n\n` +
            `Reenvie escolhendo uma das opções acima.`,
        };
      }
      const keyboard = buildChoiceKeyboard(cmd.kind, cmd.table, cmd.qty, variantProducts);
      const op = cmd.kind === "ADD" ? "+" : "-";
      return {
        text: prefix + `📦 Mesa ${cmd.table} ${op}${cmd.qty} "${resolution.group.name}" — escolha a variante:`,
        keyboard,
      };
    }
    case "out_of_stock":
      return {
        text: prefix + `❌ ${resolution.product.name} está marcado como esgotado.\nTente uma variante alternativa, se houver.`,
      };
    case "no_linked_product":
      return {
        text: prefix + `⚠️ "${resolution.itemName}" existe no estoque mas não está vinculado a nenhum produto do cardápio.`,
      };
    case "found":
      return await runExecute(cmd, resolution.product, waiter, resolution.fuzzyFrom);
  }
}

async function runExecute(
  cmd: Extract<Command, { kind: "ADD" | "REMOVE" }>,
  product: Product,
  waiter: string,
  fuzzyFrom?: string,
): Promise<HandlerReply> {
  const prefix = ctxPrefix(cmd);
  try {
    const text = cmd.kind === "ADD"
      ? await executeAdd(cmd.table, product, cmd.qty, waiter)
      : await executeRemove(cmd.table, product, cmd.qty, waiter);
    const success = isMutationSuccess(cmd.kind, text);
    let extras = "";
    if (fuzzyFrom && success) extras += `\n   (interpretado de "${fuzzyFrom}")`;
    if (success) extras += "\n" + (await formatPrintStatus(cmd.table));
    let keyboard: InlineButton[][] | undefined;
    if (success) {
      const op = cmd.kind === "ADD" ? "a" : "r";
      keyboard = buildUndoSingleKeyboard(cmd.table, product.id, cmd.qty, op);
      // Também registra no stack textual de undo do chat (para `undo` por mensagem).
      registerBatchUndo(_undoChatId(), cmd.table, [{ op, productId: product.id, productName: product.name, qty: cmd.qty }]);
    }
    return {
      text: prefix + text + extras,
      successTable: success ? cmd.table : undefined,
      keyboard,
    };
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes("version_conflict")) {
      return { text: prefix + `⏳ Mesa ${cmd.table} está sendo editada agora. Aguarde 5s e reenvie.` };
    }
    console.error("execute error:", e);
    return { text: prefix + `❌ Erro ao processar: ${msg}` };
  }
}

// Contexto de chatId para registrar undo no stack textual a partir de funções que não recebem chatId.
let _undoCurrentChatId = 0;
function _undoChatId(): number { return _undoCurrentChatId; }
function setUndoChatContext(chatId: number) { _undoCurrentChatId = chatId; }

// Lê print_status atual da mesa para feedback "🖨️ enviado / ⚠️ aguardando".
async function formatPrintStatus(table: string): Promise<string> {
  const order = await resolveTable(table);
  if (!order) return "";
  const { data } = await sb
    .from("orders")
    .select("print_status, print_last_error")
    .eq("id", order.id)
    .maybeSingle();
  const ps = (data as any)?.print_status as string | undefined;
  const err = (data as any)?.print_last_error as string | undefined;
  if (!ps) return "";
  if (ps === "pending" || ps === "printing") return "   🖨️ enviado para impressão";
  if (ps === "printed") return "   🖨️ impresso";
  if (ps === "failed") return `   ❌ falha na impressão${err ? ` (${err})` : ""}`;
  return `   ⚠️ status: ${ps}`;
}

// Dedupe de callbacks pra evitar duplo-clique
const seenCallbacks = new Map<string, number>();
function isCallbackDuplicate(id: string): boolean {
  const now = Date.now();
  for (const [k, t] of seenCallbacks) if (now - t > 5 * 60_000) seenCallbacks.delete(k);
  if (seenCallbacks.has(id)) return true;
  seenCallbacks.set(id, now);
  return false;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function handleCallbackQuery(cb: any): Promise<void> {
  const cbId: string = cb.id;
  const chatId: number | undefined = cb.message?.chat?.id;
  const messageId: number | undefined = cb.message?.message_id;
  const data: string | undefined = cb.data;
  const username: string | undefined = cb.from?.username;
  const userId: number | undefined = cb.from?.id;
  const chatType: ChatType = cb.message?.chat?.type;
  if (!chatId || !messageId || !data) {
    await answerCallback(cbId);
    return;
  }
  if (isCallbackDuplicate(cbId)) {
    await answerCallback(cbId);
    return;
  }

  // Whitelist
  const allowed = await getAllowedChats();
  if (!allowed || !allowed.has(chatId)) {
    await answerCallback(cbId, "Chat não autorizado");
    return;
  }

  if (data === "x") {
    await answerCallback(cbId, "Cancelado");
    await editTelegramMessage(chatId, messageId, "❌ Cancelado.");
    return;
  }

  // ─── UNDO single: u|table|productId|qty|op ───
  if (data.startsWith("u|")) {
    cleanupUndos();
    const parts = data.split("|");
    if (parts.length !== 5) {
      await answerCallback(cbId, "Inválido");
      return;
    }
    const [, table, productId, qtyStr, originalOp] = parts;
    const qty = parseInt(qtyStr, 10);
    if (!UUID_RE.test(productId) || !Number.isFinite(qty) || qty < 1 || qty > 99 || !table || (originalOp !== "a" && originalOp !== "r")) {
      await answerCallback(cbId, "Dados inválidos");
      return;
    }
    if (consumedUndos.has(data)) {
      await answerCallback(cbId, "Já desfeito");
      return;
    }
    const waiter = username ? `Telegram (@${username}) [undo]` : "Telegram [undo]";
    await answerCallback(cbId);
    try {
      const result = await executeUndoOps(table, [{ op: originalOp as "a" | "r", productId, productName: "", qty }], waiter);
      consumedUndos.set(data, Date.now());
      await editTelegramMessage(chatId, messageId, `↩️ Operação desfeita.\n${result}`);
    } catch (e: any) {
      await editTelegramMessage(chatId, messageId, `❌ Erro ao desfazer: ${String(e?.message ?? e)}`);
    }
    return;
  }

  // ─── UNDO batch: ub|token ───
  if (data.startsWith("ub|")) {
    cleanupUndos();
    const token = data.slice(3);
    const entry = pendingUndos.get(token);
    if (!entry) {
      await answerCallback(cbId, "Expirado");
      await editTelegramMessage(chatId, messageId, "⏱ Desfazer expirado.");
      return;
    }
    const waiter = username ? `Telegram (@${username}) [undo]` : "Telegram [undo]";
    await answerCallback(cbId);
    try {
      const result = await executeUndoOps(entry.table, entry.ops, waiter);
      pendingUndos.delete(token);
      consumedUndos.set(token, Date.now());
      await editTelegramMessage(chatId, messageId, `↩️ Operação desfeita.\n${result}`);
    } catch (e: any) {
      await editTelegramMessage(chatId, messageId, `❌ Erro ao desfazer: ${String(e?.message ?? e)}`);
    }
    return;
  }

  // ─── ADD/REMOVE escolha: a|... ou r|... ───
  const parts = data.split("|");
  if (parts.length !== 4 || (parts[0] !== "a" && parts[0] !== "r")) {
    await answerCallback(cbId, "Comando inválido");
    return;
  }
  const [op, table, productId, qtyStr] = parts;
  const qty = parseInt(qtyStr, 10);
  if (!UUID_RE.test(productId) || !Number.isFinite(qty) || qty < 1 || qty > 99 || !table) {
    await answerCallback(cbId, "Dados inválidos");
    return;
  }

  // Busca produto pelo id
  const { data: prod } = await sb
    .from("products")
    .select("id, name, price, active, category")
    .eq("id", productId)
    .maybeSingle();
  if (!prod) {
    await answerCallback(cbId, "Produto não encontrado");
    await editTelegramMessage(chatId, messageId, "❌ Produto não encontrado.");
    return;
  }
  if (!prod.active) {
    await answerCallback(cbId, "Esgotado");
    await editTelegramMessage(chatId, messageId, `❌ ${prod.name} está esgotado.`);
    return;
  }

  const waiter = username ? `Telegram (@${username}) [botão]` : "Telegram [botão]";
  await answerCallback(cbId);

  let resultText: string;
  let success = false;
  try {
    resultText = op === "a"
      ? await executeAdd(table, prod as Product, qty, waiter)
      : await executeRemove(table, prod as Product, qty, waiter);
    success = op === "a"
      ? isMutationSuccess("ADD", resultText)
      : isMutationSuccess("REMOVE", resultText);
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    resultText = msg.includes("version_conflict")
      ? `⏳ Mesa ${table} está sendo editada agora. Tente novamente.`
      : `❌ Erro ao processar: ${msg}`;
  }
  if (success) {
    await setLastTable(chatId, table, userId, chatType);
    const status = await formatPrintStatus(table);
    if (status) resultText += "\n" + status;
  }
  await editTelegramMessage(chatId, messageId, resultText);

  // Após escolha bem-sucedida via botão, oferece undo numa NOVA mensagem
  // (não dá pra adicionar keyboard no editMessageText sem perder os botões antigos cleanly).
  if (success) {
    const undoKb = buildUndoSingleKeyboard(table, productId, qty, op as "a" | "r");
    await sendTelegram(chatId, `↩️ Quer desfazer essa ação?`, undoKb);
  }
}

function testOrPlain(): Response {
  if (currentChatIsTest) {
    const captured = drainTestBuffer();
    clearTestContext();
    return new Response(JSON.stringify({ ok: true, captured }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  clearTestContext();
  return new Response("ok", { status: 200, headers: corsHeaders });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // ── TEST MODE endpoints (GET) ──
  if (req.method === "GET") {
    const url = new URL(req.url);
    const op = url.searchParams.get("test");
    if (op) {
      if (!TEST_MODE) {
        return new Response(JSON.stringify({ error: "TEST_MODE disabled" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (op === "ping") {
        return new Response(JSON.stringify({ test_mode: true, test_chat_id: TEST_CHAT_ID }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (op === "cleanup") {
        const r = await cleanupTestData();
        return new Response(JSON.stringify({ ok: true, ...r }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (op === "drain") {
        return new Response(JSON.stringify({ buffer: drainTestBuffer() }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      return new Response(JSON.stringify({ error: "unknown op" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
  }

  if (!TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN not configured");
    return testOrPlain();
  }

  try {
    const update = await req.json();
    console.log("Update:", JSON.stringify(update));

    // Callback de botão inline
    if (update?.callback_query) {
      const cbChatId: number | undefined = update.callback_query?.message?.chat?.id;
      setTestContext(cbChatId);
      try {
        await handleCallbackQuery(update.callback_query);
      } catch (e) {
        console.error("callback erro:", e);
      }
      if (currentChatIsTest) {
        const captured = drainTestBuffer();
        clearTestContext();
        return new Response(JSON.stringify({ ok: true, captured }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      clearTestContext();
      return testOrPlain();
    }

    const message = update?.message ?? update?.edited_message;
    const chatId: number | undefined = message?.chat?.id;
    const text: string | undefined = message?.text;
    const fromBot: boolean = message?.from?.is_bot === true;
    const username: string | undefined = message?.from?.username;
    const userId: number | undefined = message?.from?.id;
    const chatType: ChatType = message?.chat?.type;
    const updateId: number | undefined = update?.update_id;

    if (fromBot || !chatId || !text) {
      return testOrPlain();
    }
    setTestContext(chatId);
    setUndoChatContext(chatId);
    if (typeof updateId === "number" && isDuplicate(updateId)) {
      return testOrPlain();
    }

    // Whitelist
    const allowed = await getAllowedChats();
    if (!allowed || !allowed.has(chatId)) {
      console.warn("Chat não autorizado:", chatId);
      await sendTelegram(
        chatId,
        `🚫 Chat não autorizado.\nID deste chat: ${chatId}\n\nPeça ao admin para liberar em settings.telegram_allowed_chats.`,
      );
      return testOrPlain();
    }

    // NOTE: Rate limiting removido. O backend não tem primitivos confiáveis de
    // rate limit (Edge Functions multi-isolate invalidam contadores in-memory).
    // Não há proteção real contra flood — a ser tratado em infra dedicada.

    // ─── Vinculação Telegram → garçom do Palm ───
    // /resetar — só admin (chat privado de admin é o primeiro chat_id em telegram_allowed_chats que é positivo, ou liberado pelo dono)
    const trimmed = text.trim();
    const trimmedLower = trimmed.toLowerCase();
    if (typeof userId === "number" && (trimmedLower === "/resetar" || trimmedLower === "resetar garcons" || trimmedLower === "resetar garçons")) {
      // Apenas em chat privado (DM) — evita reset acidental em grupo.
      if (isGroupChat(chatType)) {
        await sendTelegram(chatId, "⚠️ O comando de reset só pode ser usado em conversa privada com o bot.");
        return testOrPlain();
      }
      const removed = await clearAllWaiterBindings();
      await sendTelegram(chatId, `🧹 Vinculações de garçons resetadas (${removed}).\nCada usuário precisará escolher o nome novamente na próxima mensagem.`);
      return testOrPlain();
    }

    // /trocar ou /quemsoueu (whoami)
    if (typeof userId === "number" && (trimmedLower === "/trocar" || trimmedLower === "trocar garcom" || trimmedLower === "trocar garçom")) {
      const { error } = await sb.from("telegram_user_bindings").delete().eq("telegram_user_id", userId);
      if (error) console.warn("trocar:", error.message);
      const names = await listWaiterNames();
      await sendTelegram(chatId, "🔄 Vínculo removido.\n\n" + buildWaiterPickerMessage(names, username));
      return testOrPlain();
    }
    if (typeof userId === "number" && (trimmedLower === "/quemsoueu" || trimmedLower === "quem sou eu")) {
      const w = await getWaiterBinding(userId);
      await sendTelegram(chatId, w ? `👤 Você está identificado como *${w}*.\nPara trocar: \`/trocar\`` : "❓ Você ainda não escolheu seu nome. Mande qualquer mensagem que eu te mostro a lista.");
      return testOrPlain();
    }

    // Resolve garçom: precisa de userId E vinculação. Sem userId, comportamento antigo.
    let waiter: string;
    if (typeof userId === "number") {
      let bound = await getWaiterBinding(userId);
      if (!bound) {
        // Em grupo, ignora silenciosamente para não poluir — onboarding é em DM.
        if (isGroupChat(chatType)) {
          await sendTelegram(chatId, `⚠️ @${username ?? "usuário"}, você ainda não está vinculado a um garçom.\nMe chame em conversa privada para escolher seu nome.`);
          return testOrPlain();
        }
        // DM: tenta interpretar a mensagem como escolha de nome
        const picked = await tryBindFromText(userId, text, username);
        if (picked) {
          await sendTelegram(chatId, `✅ Pronto! Você está identificado como *${picked}*.\n\nAgora pode mandar comandos:\n  • mesa 5 + 2 coca\n  • mesa 5 status\n  • ajuda\n\nPara trocar: \`/trocar\``);
          return testOrPlain();
        }
        // Não bateu — mostra a lista
        const names = await listWaiterNames();
        await sendTelegram(chatId, buildWaiterPickerMessage(names, username));
        return testOrPlain();
      }
      waiter = bound;
    } else {
      waiter = username ? `Telegram (@${username})` : "Telegram";
    }

    // Detecta modo preview
    let workingText = text;
    let isPreview = false;
    const rawLines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    if (rawLines.length > 0 && /^preview\b/i.test(rawLines[0])) {
      isPreview = true;
      const firstRest = rawLines[0].replace(/^preview\b[:\s-]*/i, "").trim();
      const remaining = firstRest ? [firstRest, ...rawLines.slice(1)] : rawLines.slice(1);
      workingText = remaining.join("\n");
    }

    const lines = workingText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    if (isPreview && lines.length === 0) {
      await sendTelegram(
        chatId,
        `🔍 Modo preview ativo, mas nenhum comando informado.\nEnvie:\n  preview\n  mesa 1 + 1 coca 350`,
      );
      return testOrPlain();
    }

    if (lines.length > 10) {
      await sendTelegram(
        chatId,
        `⚠️ Máx. 10 comandos por mensagem. Você enviou ${lines.length}. Divida em mensagens menores.`,
      );
      return testOrPlain();
    }

    if (isPreview) {
      // Preview nunca emite botões — texto consolidado. Usa contexto mas NÃO grava.
      const results: string[] = [];
      for (const line of lines) {
        try {
          const cmd = parseCommand(line);
          results.push(await previewCommand(cmd, chatId));
        } catch (e) {
          console.error("preview line error:", line, e);
          results.push(`❌ "${line}": erro inesperado`);
        }
      }
      const header =
        lines.length === 1
          ? `🔍 Preview (nada foi executado):\n`
          : `🔍 Preview de ${lines.length} comandos (nada foi executado):\n`;
      await sendTelegram(chatId, header + "\n" + results.join("\n\n"));
      return testOrPlain();
    }

    if (lines.length <= 1) {
      const parsed = parseCommand(lines[0] ?? text);
      const cmd = await resolveWithContext(parsed, chatId, userId, chatType);
      const reply = await handleCommand(cmd, waiter);
      await sendTelegram(chatId, reply.text, reply.keyboard);
      if (reply.successTable) await setLastTable(chatId, reply.successTable, userId, chatType);
    } else {
      // Multi-comando: tenta consolidar ADD/REMOVE da mesma mesa em UMA impressão.
      // 1ª passada: parse + resolveContext + resolveProduct (sem mutação) por linha.
      type Slot =
        | { kind: "batchable"; line: string; table: string; op: BatchOp; cmdKind: "ADD" | "REMOVE"; fuzzyFrom?: string }
        | { kind: "standalone"; line: string; reply: HandlerReply };

      const slots: Slot[] = [];

      for (const line of lines) {
        try {
          const parsed = parseCommand(line);
          const cmd = await resolveWithContext(parsed, chatId, userId, chatType);

          if (cmd.kind === "ADD" || cmd.kind === "REMOVE") {
            const resolution = await resolveProduct(cmd.productText);
            let chosen: Product | null = null;
            let fuzzyFrom: string | undefined;

            if (resolution.kind === "found") {
              chosen = resolution.product;
              fuzzyFrom = resolution.fuzzyFrom;
            } else if (resolution.kind === "ambiguous") {
              chosen = autoPickFromCandidates(cmd.productText, resolution.candidates);
            } else if (resolution.kind === "is_group_trigger") {
              const variantProducts = await fetchProductsByNames(resolution.variants);
              chosen = autoPickFromCandidates(cmd.productText, variantProducts);
            }

            if (chosen) {
              slots.push({
                kind: "batchable",
                line,
                table: cmd.table,
                cmdKind: cmd.kind,
                op: { kind: cmd.kind, product: chosen, qty: cmd.qty, rawQty: cmd.qty },
                fuzzyFrom,
              });
              continue;
            }

            // Não conseguiu resolver sem ambiguidade — vai standalone com botões.
            const reply = await handleCommand(cmd, waiter);
            slots.push({ kind: "standalone", line, reply });
          } else {
            const reply = await handleCommand(cmd, waiter);
            slots.push({ kind: "standalone", line, reply });
            if (reply.successTable) await setLastTable(chatId, reply.successTable, userId, chatType);
          }
        } catch (e) {
          console.error("line parse error:", line, e);
          slots.push({ kind: "standalone", line, reply: { text: `❌ "${line}": erro inesperado` } });
        }
      }

      // Agrupa batchable por mesa.
      const batchByTable = new Map<string, { ops: BatchOp[]; lines: string[]; fuzzyNotes: string[] }>();
      const ordered: { type: "batch_ref"; table: string } | { type: "standalone"; reply: HandlerReply; line: string }[] = [];
      // Construímos resultados na ordem original; cada mesa de batch entra UMA vez (na primeira ocorrência).
      const tableFirstIdx = new Map<string, number>();
      const renderedSlots: Array<{ type: "batch"; table: string } | { type: "standalone"; reply: HandlerReply; line: string }> = [];

      for (const s of slots) {
        if (s.kind === "batchable") {
          if (!batchByTable.has(s.table)) {
            batchByTable.set(s.table, { ops: [], lines: [], fuzzyNotes: [] });
            tableFirstIdx.set(s.table, renderedSlots.length);
            renderedSlots.push({ type: "batch", table: s.table });
          }
          const bucket = batchByTable.get(s.table)!;
          bucket.ops.push(s.op);
          bucket.lines.push(s.line);
          if (s.fuzzyFrom) bucket.fuzzyNotes.push(`"${s.fuzzyFrom}"→${s.op.product.name}`);
        } else {
          renderedSlots.push({ type: "standalone", reply: s.reply, line: s.line });
        }
      }

      // Executa cada batch.
      const batchResults = new Map<string, { text: string; keyboard?: InlineButton[][] }>();
      const pendingChoices: HandlerReply[] = [];

      for (const [table, bucket] of batchByTable) {
        try {
          const result = await executeBatchForTable(table, bucket.ops, waiter, /*shouldPrint*/ true);
          let line = result.text;
          if (bucket.fuzzyNotes.length > 0) {
            line += `\n   (interpretado: ${bucket.fuzzyNotes.join(", ")})`;
          }
          if (result.ok) {
            line += "\n" + (await formatPrintStatus(table));
            await setLastTable(chatId, table, userId, chatType);
          }
          let keyboard: InlineButton[][] | undefined;
          if (result.ok && result.ops.length > 0) {
            const token = registerBatchUndo(chatId, table, result.ops);
            keyboard = buildUndoBatchKeyboard(token);
          }
          batchResults.set(table, { text: line, keyboard });
        } catch (e: any) {
          const msg = String(e?.message ?? e);
          const errLine = msg.includes("version_conflict")
            ? `⏳ Mesa ${table}: conflito de versão. Aguarde 5s e reenvie.`
            : `❌ Mesa ${table}: ${msg}`;
          batchResults.set(table, { text: errLine });
        }
      }

      // Coleta standalone com botões para envio em mensagens separadas.
      for (const r of renderedSlots) {
        if (r.type === "standalone" && r.reply.keyboard && r.reply.keyboard.length > 0) {
          pendingChoices.push(r.reply);
        }
      }

      // Monta texto consolidado.
      const textBlocks: string[] = [];
      for (const r of renderedSlots) {
        if (r.type === "batch") {
          textBlocks.push(batchResults.get(r.table)?.text ?? `(mesa ${r.table})`);
        } else {
          if (r.reply.keyboard && r.reply.keyboard.length > 0) {
            textBlocks.push(`🤔 "${r.line}" → escolha abaixo.`);
          } else {
            textBlocks.push(r.reply.text);
          }
        }
      }

      const header = `📊 ${lines.length} comandos processados:\n`;
      await sendTelegram(chatId, header + "\n" + textBlocks.join("\n\n"));

      // Botões de undo (1 por mesa batched) em mensagens separadas.
      for (const [, res] of batchResults) {
        if (res.keyboard) {
          await sendTelegram(chatId, `↩️ Desfazer mesa?`, res.keyboard);
        }
      }

      // Mensagens separadas com botões de escolha.
      for (const choice of pendingChoices) {
        await sendTelegram(chatId, choice.text, choice.keyboard);
      }
    }
  } catch (err) {
    console.error("Erro processando update:", err);
  }

  return testOrPlain();
});
