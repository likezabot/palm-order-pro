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

// ─────────────── Voice (Telegram voice → Lovable AI transcribe) ───────────────
// Baixa o arquivo de voz pelo Bot API e transcreve via Lovable AI Gateway
// (Gemini suporta áudio nativo). Retorna o texto transcrito ou null em erro.
async function transcribeTelegramVoice(fileId: string): Promise<string | null> {
  const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
  if (!LOVABLE_API_KEY) {
    console.error("transcribeVoice: LOVABLE_API_KEY ausente");
    return null;
  }
  try {
    // 1) getFile
    const gfRes = await fetch(`https://api.telegram.org/bot${TOKEN}/getFile`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    });
    const gfJson = await gfRes.json();
    const filePath: string | undefined = gfJson?.result?.file_path;
    if (!gfRes.ok || !filePath) {
      console.error("transcribeVoice getFile falhou:", gfRes.status, gfJson);
      return null;
    }
    // 2) download bytes
    const dlRes = await fetch(`https://api.telegram.org/file/bot${TOKEN}/${filePath}`);
    if (!dlRes.ok) {
      console.error("transcribeVoice download falhou:", dlRes.status);
      return null;
    }
    const buf = new Uint8Array(await dlRes.arrayBuffer());
    // 3) base64 (chunked p/ evitar stack overflow)
    let bin = "";
    const CHUNK = 0x8000;
    for (let i = 0; i < buf.length; i += CHUNK) {
      bin += String.fromCharCode.apply(null, Array.from(buf.subarray(i, i + CHUNK)));
    }
    const b64 = btoa(bin);
    // Telegram voice é OGG/Opus
    const mime = "audio/ogg";

    // 4) transcrição via Lovable AI (Gemini 2.5 Flash, áudio nativo)
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Você é um transcritor literal pt-BR de comandos de voz curtos para um sistema de PDV de bar/restaurante. " +
              "Devolva APENAS o texto falado, em minúsculas, sem pontuação, sem comentários, sem aspas. " +
              "Converta números por extenso para dígitos (ex: 'duas cocas' → '2 coca'; 'mesa cinco mais três cervejas' → 'mesa 5 + 3 cerveja'). " +
              "Mantenha verbos de comando como 'mais', 'menos', 'entrada', 'saída', 'ajuste', 'estoque', 'ver pedido', 'mesa N'. " +
              "PRESERVE verbos no passado como 'acabou', 'terminou', 'zerou', 'esgotou' (NÃO converta para infinitivo). " +
              "Se não houver fala clara, devolva uma única palavra: vazio.",
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Transcreva este áudio:" },
              { type: "input_audio", input_audio: { data: b64, format: "ogg" } },
            ],
          },
        ],
      }),
    });
    if (!aiRes.ok) {
      const errTxt = await aiRes.text().catch(() => "");
      console.error("transcribeVoice Lovable AI falhou:", aiRes.status, errTxt.slice(0, 300));
      return null;
    }
    const aiJson = await aiRes.json();
    const raw: string = aiJson?.choices?.[0]?.message?.content ?? "";
    const txt = String(raw).trim().replace(/^["'`]+|["'`]+$/g, "").trim();
    if (!txt || txt.toLowerCase() === "vazio") return null;
    return txt;
  } catch (e) {
    console.error("transcribeVoice erro:", e);
    return null;
  }
}

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
      "Peça ao admin para abrir o módulo *Admin* e criar seu nome em Garçons.\n\n" +
      "Quando cadastrar, toque em 🔄 abaixo.";
  }
  return greet +
    `Toque no seu nome 👇  _(${names.length} cadastrado${names.length === 1 ? "" : "s"} no Palm)_\n` +
    "Se não estiver na lista, peça ao admin pra cadastrar e toque em 🔄.";
}
// Botões clicáveis com nomes dos garçons. Layout em grade 2 colunas (1 col se houver ≤3 nomes).
// callback_data: pw|<nome-base64url> — assim sobrevive a reordenações/inclusões entre o envio e o clique.
function encodeWaiterName(name: string): string {
  // base64url sem padding, ASCII-safe pro callback_data (limite 64 bytes)
  const b64 = btoa(unescape(encodeURIComponent(name)));
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function decodeWaiterName(token: string): string | null {
  try {
    const b64 = token.replace(/-/g, "+").replace(/_/g, "/");
    return decodeURIComponent(escape(atob(b64)));
  } catch { return null; }
}
function buildWaiterPickerKeyboard(names: string[]): InlineButton[][] {
  const rows: InlineButton[][] = [];
  const cols = names.length > 3 ? 2 : 1;
  const max = Math.min(names.length, 30);
  for (let i = 0; i < max; i += cols) {
    const row: InlineButton[] = [];
    for (let j = 0; j < cols && i + j < max; j++) {
      const n = names[i + j];
      const enc = encodeWaiterName(n);
      // 60 bytes de callback_data é o limite seguro (pw| = 3 chars + token)
      if (`pw|${enc}`.length <= 60) {
        row.push({ text: `👤 ${n}`, callback_data: `pw|${enc}` });
      }
    }
    if (row.length > 0) rows.push(row);
  }
  rows.push([{ text: "🔄 Atualizar lista", callback_data: "pw_refresh" }]);
  return rows;
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

// ─── Stock undo (60s, in-memory) ───
type StockUndoEntry = {
  itemId: string;
  itemName: string;
  unit: string;
  type: "in" | "out" | "adjustment";
  qty: number;
  previousStock: number; // valor ANTES do movimento (usado em adjustment)
  ts: number;
};
const pendingStockUndos = new Map<string, StockUndoEntry>();
function cleanupStockUndos() {
  const now = Date.now();
  for (const [k, v] of pendingStockUndos) if (now - v.ts > UNDO_TTL_MS) pendingStockUndos.delete(k);
}
function registerStockUndo(entry: Omit<StockUndoEntry, "ts">): string {
  cleanupStockUndos();
  const token = genUndoToken();
  pendingStockUndos.set(token, { ...entry, ts: Date.now() });
  return token;
}
function buildStockUndoKeyboard(token: string): InlineButton[][] {
  return [[{ text: "↩️ Desfazer (60s)", callback_data: `us|${token}` }]];
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
  // Whitelist: palavras curtas críticas que NÃO devem virar outra coisa.
  // "bois" (plural de boi) cairia em "bol" pela regra ois→ol e quebraria
  // o match com aliases curtos como "boi".
  const SHORT_WHITELIST = new Set(["bois", "pois", "dois", "sois", "vois"]);
  if (SHORT_WHITELIST.has(tok)) {
    if (tok === "bois") return "boi";
    return tok;
  }
  // Regras de plural:
  if (/oes$/.test(tok)) return tok.replace(/oes$/, "ao"); // medalhoes -> medalhao
  if (/ais$/.test(tok)) return tok.replace(/ais$/, "al"); // animais->animal
  if (/eis$/.test(tok)) return tok.replace(/eis$/, "el"); // pasteis -> pastel
  if (/ois$/.test(tok)) {
    // Palavras ≤4 letras terminadas em "ois" (bois, dois, sois) singularizam
    // tirando só o "s". A regra ois→ol vale para palavras maiores
    // (lencois→lencol, anzois→anzol, caracois→caracol).
    if (tok.length <= 4) return tok.slice(0, -1);
    return tok.replace(/ois$/, "ol");
  }
  if (/uis$/.test(tok)) return tok.replace(/uis$/, "ul"); // pauis -> paul
  if (/ns$/.test(tok)) return tok.replace(/ns$/, "m");    // garagens -> garagem
  if (/(res|zes|ses)$/.test(tok)) return tok.slice(0, -2); // colheres -> colher
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
  | { kind: "STOCK_MOVEMENT"; type: "in" | "out" | "adjustment"; qty: number; itemText: string; unit?: string }
  | { kind: "STOCK_OUT_NOW"; itemText: string }
  | { kind: "STOCK_QUERY"; itemText: string }
  | { kind: "STOCK_LIST" }
  | { kind: "NOTIFY_TOGGLE"; on: boolean }
  | { kind: "TABLE_STATUS"; table: string }
  | { kind: "PRODUCT_HIDE"; query: string }
  | { kind: "PRODUCT_SHOW"; query: string }
  | { kind: "PRODUCT_LIST"; mode: "hidden" | "visible" | "all" }
  | { kind: "PRODUCT_PICK"; choice: number }
  | { kind: "HELP" }
  | { kind: "PARSE_ERROR"; raw: string; hint?: "no_op" | "no_product" | "no_table" | "no_qty" | "generic" };

// Operadores compartilhados (usados pelo parser e pelo fallback NOMESA).
const ADD_OPS = ["+", "add", "adiciona", "adicionar", "coloca", "colocar", "poe", "manda", "mandar", "bota", "botar", "mais", "soma", "somar", "inclui", "incluir", "acrescenta", "acrescentar"];
const REM_OPS = ["-", "remove", "remover", "tira", "tirar", "retira", "retirar", "cancela", "cancelar", "menos", "subtrai", "subtrair", "exclui", "excluir", "desconta", "descontar"];
const ALL_OPS = [...ADD_OPS, ...REM_OPS];

// ─────────────────────────── multi-command splitter ───────────────────────────
// Aceita múltiplos comandos numa linha via separadores: \n, ;, " // ", " | ".
// Também faz split conservador quando aparece outro "mesa N" no meio da linha,
// somente se cada lado contém um operador/ação reconhecível (evita quebrar
// produtos com "mesa" no nome).
function splitCommands(raw: string): string[] {
  if (!raw) return [];
  // Normaliza separadores explícitos para \n
  const text = raw.replace(/\s*\/\/\s*/g, "\n").replace(/\s+\|\s+/g, "\n").replace(/\s*;\s*/g, "\n");

  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const result: string[] = [];

  const wordOps = ALL_OPS.filter((o) => /^[a-z]/.test(o)).join("|");
  const hasActionRE = new RegExp(
    `(?:\\b(?:${wordOps})\\b|[+\\-]\\s*\\d|\\b(?:ver|pedido|consumo|status|situacao|situação|o\\s+que\\s+tem)\\b)`,
    "i",
  );
  const tableRE = /\bmesa\s+\d+\b/gi;

  for (const line of lines) {
    const matches = [...line.matchAll(tableRE)];
    if (matches.length < 2) {
      result.push(line);
      continue;
    }
    const parts: string[] = [];
    let lastEnd = 0;
    for (let i = 1; i < matches.length; i++) {
      const start = matches[i].index!;
      parts.push(line.slice(lastEnd, start).trim());
      lastEnd = start;
    }
    parts.push(line.slice(lastEnd).trim());
    const allHaveAction = parts.every((p) => p.length > 0 && hasActionRE.test(p));
    if (allHaveAction) {
      for (const p of parts) result.push(p);
    } else {
      result.push(line);
    }
  }
  return result;
}
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

// Parser solto para linhas de continuação em modo de operação herdada.
// Aceita "<qty> [unit] <produto>" OU "<produto> <qty> [unit]".
const STOCK_UNIT_RE_GLOBAL = "(?:kg|g|l|ml|un|unidade|unidades)";
function parseStockTailLoose(raw: string): { qty: number; unit?: string; itemText: string } | null {
  const t = normalize(raw);
  if (!t) return null;
  const m1 = t.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${STOCK_UNIT_RE_GLOBAL})?\\s+(.+)$`));
  if (m1) {
    const qty = parseFloat(m1[1].replace(",", "."));
    if (Number.isFinite(qty) && qty > 0) {
      return { qty, unit: m1[2] || undefined, itemText: m1[3].trim() };
    }
  }
  const m2 = t.match(new RegExp(`^(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s*(${STOCK_UNIT_RE_GLOBAL})?$`));
  if (m2) {
    const qty = parseFloat(m2[2].replace(",", "."));
    if (Number.isFinite(qty) && qty > 0) {
      return { qty, unit: m2[3] || undefined, itemText: m2[1].trim() };
    }
  }
  return null;
}

function parseCommand(raw: string): Command {
  const text = normalize(raw);
  if (!text) return { kind: "PARSE_ERROR", raw };

  if (/^(?:\/start|\/help|ajuda|help|comandos?|menu|ola|oi|opa|bom\s+dia|boa\s+tarde|boa\s+noite|\?+|o\s+que\s+(?:faz|voce\s+faz)|como\s+usar|me\s+ajuda|socorro)$/.test(text)) {
    return { kind: "HELP" };
  }

  // UNDO: aceita "undo", "desfazer", "errei", "oops", "voltar atras", etc.
  const undoMatch = text.match(/^(?:undo|desfa(?:zer|z|ca)|volta(?:r)?(?:\s+atras|\s+atrás)?|anula(?:r)?|cancela(?:r)?\s+ultima?|reverter|errei|oops|apaga(?:r)?\s+ultim[oa]|tira(?:r)?\s+ultim[oa])(?:\s+(tudo|todos|todas|all|geral))?$/);
  if (undoMatch) return { kind: "UNDO", all: !!undoMatch[1] };

  // RELATÓRIO: muitas formas de pedir o resumo do dia
  if (/^(?:relatorio|relatório|ranking|fechamento|resumo(?:\s+(?:do\s+)?dia)?|fecha(?:r)?\s+dia|balanco|balanço|me\s+(?:da|de)\s+o?\s*relatorio|gera(?:r)?\s+relatorio|report|dia|como\s+foi\s+o\s+dia|vendas\s+hoje|total\s+do\s+dia|caixa)$/.test(text)) {
    return { kind: "REPORT" };
  }

  // ESTOQUE: LISTAR todos (antes de CRÍTICO porque "lista estoque" / "inventario" é mais específico)
  if (/^(?:lista\s+estoque|listar\s+estoque|estoque\s+(?:completo|todo|tudo|geral)|inventario|inventário|tudo\s+do\s+estoque|todos\s+(?:os\s+)?itens|itens\s+(?:do\s+)?estoque)$/.test(text)) {
    return { kind: "STOCK_LIST" };
  }

  // ESTOQUE CRÍTICO
  if (/^(?:estoque(?:\s+(?:critico|crítico|baixo|zerado|acabando|em\s+falta))?|criticos|críticos|alertas?(?:\s+(?:de\s+)?estoque)?|o\s+que\s+(?:ta|esta)\s+acabando|o\s+que\s+falta|falta(?:ndo)?\s+(?:o\s+)?que|precisa\s+repor|lista\s+critica)$/.test(text)) {
    return { kind: "STOCK_CRITICAL" };
  }

  // ─── ESTOQUE: movimentações e consulta de saldo ───
  const STOCK_UNIT_RE = "(?:kg|g|l|ml|un|unidade|unidades)";
  const parseStockTail = (tail: string, qtyRequired: boolean): { qty: number; unit?: string; itemText: string } | null => {
    const t = tail.trim();
    if (!t) return null;
    // Formato canônico: <qty> [unit] <produto>
    const m = t.match(new RegExp(`^(\\d+(?:[.,]\\d+)?)\\s*(${STOCK_UNIT_RE})?\\s+(.+)$`));
    if (m) {
      const qty = parseFloat(m[1].replace(",", "."));
      if (Number.isFinite(qty) && qty > 0) {
        return { qty, unit: m[2] || undefined, itemText: m[3].trim() };
      }
    }
    // Número por extenso na frente
    const m2 = t.match(/^(\S+)\s+(.+)$/);
    if (m2) {
      const qty = NUM_WORDS_GLOBAL[m2[1]];
      if (qty !== undefined) return { qty, itemText: m2[2].trim() };
    }
    // Fallback: ordem invertida "<produto> <qty> [unit]" (ex.: "medalhão 20", "coca 5kg")
    const m3 = t.match(new RegExp(`^(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s*(${STOCK_UNIT_RE})?$`));
    if (m3) {
      const qty = parseFloat(m3[2].replace(",", "."));
      if (Number.isFinite(qty) && qty > 0) {
        return { qty, unit: m3[3] || undefined, itemText: m3[1].trim() };
      }
    }
    if (!qtyRequired) return { qty: 1, itemText: t };
    return null;
  };

  // ESGOTADO AGORA: "acabou X", "acabou o X", "não tem mais X", "terminou X", "zerou X", "sem X"
  // Detectado ANTES do stockOut pra capturar formas sem quantidade.
  const stockOutNow = text.match(/^(?:acabou|acabaram|terminou|terminaram|zerou|zeraram|nao\s+tem\s+mais|sem\s+mais|esgotou|esgotaram)\s+(?:o\s+|a\s+|os\s+|as\s+|um\s+|uma\s+|de\s+|do\s+|da\s+)?(.+?)$/) ||
                      text.match(/^sem\s+(?!mais\b)(.+?)$/);
  if (stockOutNow) {
    const itemText = stockOutNow[1].trim();
    // Só aceita se NÃO tiver número (senão é STOCK_MOVEMENT comum)
    if (itemText && !/\d/.test(itemText)) {
      return { kind: "STOCK_OUT_NOW", itemText };
    }
  }

  // ENTRADA: "entrada 10 coca", "entrada de estoque medalhão 20", "entrou 5kg picanha", "+ 10 coca"
  const stockIn = text.match(/^(?:entrada|entrou|recebi|chegou|comprei|repor|abasteci|abastecer|entregou|subir|subiu|reposicao|reposição)(?:\s+(?:de|do|no|ao|em|para|pra)\s+estoque)?\s+(.+)$/) ||
                   text.match(/^\+\s+(\d.+)$/);
  if (stockIn) {
    const parsed = parseStockTail(stockIn[1], true);
    if (parsed) return { kind: "STOCK_MOVEMENT", type: "in", qty: parsed.qty, itemText: parsed.itemText, unit: parsed.unit };
  }

  // SAÍDA: "saida 2 coca", "saida do estoque 5 coca", "usei 1kg picanha", "vendi 3 coca"
  // (removido "acabou" — agora é STOCK_OUT_NOW acima)
  const stockOut = text.match(/^(?:saida|saída|saiu|usei|gastei|tirei|consumi|baixa|vendi|quebrou|quebrei|descartei|descartar|perdi|perda)(?:\s+(?:de|do|no|em|para|pra)\s+estoque)?\s+(.+?)(?:\s+(?:do|de|no)\s+estoque)?$/);
  if (stockOut) {
    const parsed = parseStockTail(stockOut[1], true);
    if (parsed) return { kind: "STOCK_MOVEMENT", type: "out", qty: parsed.qty, itemText: parsed.itemText, unit: parsed.unit };
  }

  // AJUSTE forma 1: "ajuste coca 50", "setar coca para 50", "atualiza coca = 30", "contei coca 50", "marca coca 50"
  const stockAdj1 = text.match(new RegExp(`^(?:ajuste|ajustar|setar|set|fica(?:r)?\\s+com|atualiza(?:r)?|corrige|corrigir|contei|contar|marca(?:r)?|inventario|inventário)\\s+(.+?)\\s+(?:para\\s+|=\\s*|com\\s+|em\\s+)?(\\d+(?:[.,]\\d+)?)\\s*(${STOCK_UNIT_RE})?$`));
  if (stockAdj1) {
    const qty = parseFloat(stockAdj1[2].replace(",", "."));
    if (Number.isFinite(qty) && qty >= 0) {
      return { kind: "STOCK_MOVEMENT", type: "adjustment", qty, itemText: stockAdj1[1].trim(), unit: stockAdj1[3] || undefined };
    }
  }
  // AJUSTE forma 2: "tem 12 coca", "tem 5kg picanha"
  const stockAdj2 = text.match(new RegExp(`^tem\\s+(\\d+(?:[.,]\\d+)?)\\s*(${STOCK_UNIT_RE})?\\s+(?:de\\s+)?(.+)$`));
  if (stockAdj2) {
    const qty = parseFloat(stockAdj2[1].replace(",", "."));
    if (Number.isFinite(qty) && qty >= 0) {
      return { kind: "STOCK_MOVEMENT", type: "adjustment", qty, itemText: stockAdj2[3].trim(), unit: stockAdj2[2] || undefined };
    }
  }

  // CONSULTA: "estoque coca", "saldo picanha", "quanto tem de coca", "quanta coca tem", "tem coca?", "qtd coca", "ver estoque coca"
  const stockQry = text.match(/^(?:estoque|saldo|quanto\s+tem(?:\s+de)?|quanta?\s+(.+?)\s+tem\??$|qtd|quantidade(?:\s+de)?|ver\s+estoque|consulta(?:r)?\s+estoque)\s+(.+?)\??$/);
  if (stockQry) {
    // Suporta "quanta X tem?" — captura no grupo 1; "estoque X" no grupo 2
    const itemText = (stockQry[1] || stockQry[2] || "").trim();
    if (itemText) return { kind: "STOCK_QUERY", itemText };
  }
  // "tem coca?" sozinho (só com ponto de interrogação)
  const stockQry2 = text.match(/^tem\s+(.+?)\?$/);
  if (stockQry2) {
    return { kind: "STOCK_QUERY", itemText: stockQry2[1].trim() };
  }


  // NOTIFICAÇÕES on/off + atalhos diretos (silencia/muta/volta avisos)
  const notifM = text.match(/^(?:notificacoes|notificações|notif|alertas|avisos)\s+(on|off|ligar?|desligar?|ativa(?:r)?|desativa(?:r)?|sim|nao|não)$/);
  if (notifM) {
    const v = notifM[1];
    const on = ["on", "ligar", "liga", "ativar", "ativa", "sim"].includes(v);
    return { kind: "NOTIFY_TOGGLE", on };
  }
  if (/^(?:silencia(?:r)?|muta(?:r)?|silenciar\s+alertas|parar\s+avisos|para\s+avisos)$/.test(text)) {
    return { kind: "NOTIFY_TOGGLE", on: false };
  }
  if (/^(?:desmuta(?:r)?|volta(?:r)?\s+avisos|ativa(?:r)?\s+avisos|liga(?:r)?\s+avisos)$/.test(text)) {
    return { kind: "NOTIFY_TOGGLE", on: true };
  }

  // STATUS de mesa — bem permissivo:
  //   "mesa 5 status", "status mesa 5", "status 5", "status da mesa cinco",
  //   "situacao mesa 3", "como ta a mesa 4 status", "info mesa 2"
  // Aceita dígitos OU número por extenso (até 30, incluindo "vinte e um").
  const STATUS_WORDS = "(?:status|situacao|situação|info|informacao|informação|estado|andamento|tudo\\s+certo|como\\s+(?:ta|esta))";
  const NUM_WORD_RE = "(?:\\d+|vinte\\s+e\\s+(?:um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove)|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze|treze|quatorze|catorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte|trinta)";
  const stPatterns = [
    new RegExp(`^mesa\\s+(${NUM_WORD_RE})\\s+${STATUS_WORDS}$`),
    new RegExp(`^${STATUS_WORDS}\\s+(?:da\\s+|do\\s+|na\\s+|no\\s+|a\\s+)?mesa\\s+(${NUM_WORD_RE})$`),
    new RegExp(`^${STATUS_WORDS}\\s+(${NUM_WORD_RE})$`),
  ];
  for (const re of stPatterns) {
    const m = text.match(re);
    if (m) {
      const t = parseTableNumber(m[1]);
      if (t) return { kind: "TABLE_STATUS", table: t };
    }
  }

  // SET_TABLE: "mesa N" sozinho, "vou pra mesa N", "na mesa N", "pegando mesa N", "mesa N agora"
  const setT = text.match(new RegExp(`^mesa\\s+(${NUM_WORD_RE})(?:\\s+agora)?$`)) ||
               text.match(new RegExp(`^(?:vou\\s+pra|vou\\s+para|na|no|pegando|peguei|assumindo|assumi)\\s+mesa\\s+(${NUM_WORD_RE})$`));
  if (setT) {
    const t = parseTableNumber(setT[1]);
    if (t) return { kind: "SET_TABLE", table: t };
  }

  // VIEW: "mesa N ver pedido" / "mesa N o que tem" / "mesa N consumo" / "ver [pedido] [da/na] mesa N"
  const viewA = text.match(new RegExp(`^mesa\\s+(${NUM_WORD_RE})\\s+(?:ver(?:\\s+pedido)?|pedido|detalhe(?:s)?|consumo|o\\s+que\\s+tem)$`));
  if (viewA) {
    const t = parseTableNumber(viewA[1]);
    if (t) return { kind: "VIEW", table: t };
  }
  const viewB = text.match(new RegExp(`^(?:ver(?:\\s+pedido)?|pedido|detalhe(?:s)?|consumo|o\\s+que\\s+tem)\\s+(?:da\\s+|na\\s+|do\\s+|no\\s+)?mesa\\s+(${NUM_WORD_RE})$`));
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
  const original = normalize(text);
  const singular = singularize(original);
  const norm = singular;

  // 1. find_inventory_item_by_text (slug/aliases exato) — tenta singularizado
  const { data: invExact } = await sb.rpc("find_inventory_item_by_text", { p_text: singular });
  let inventoryItem: any = Array.isArray(invExact) && invExact.length > 0 ? invExact[0] : null;

  // 1b. Fallback: tenta também com a forma ORIGINAL (sem singularize) caso
  // a singularização tenha mutilado um alias curto (ex.: "bois" → "boi").
  if (!inventoryItem && original && original !== singular) {
    const { data: invExactOrig } = await sb.rpc("find_inventory_item_by_text", { p_text: original });
    if (Array.isArray(invExactOrig) && invExactOrig.length > 0) {
      inventoryItem = invExactOrig[0];
    }
  }

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

async function editTelegramMessage(chatId: number, messageId: number, text: string, keyboard?: InlineButton[][]) {
  if (isTestChat(chatId)) {
    testCaptureBuffer.push({ chatId, text, kind: "edit", messageId, keyboard });
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
        reply_markup: { inline_keyboard: keyboard ?? [] },
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

// ─────────────────────────── ESTOQUE ───────────────────────────
type StockItem = {
  id: string;
  name: string;
  slug: string;
  unit: string;
  current_stock: number;
  min_stock: number;
  product_id: string | null;
};

type StockResolution =
  | { kind: "found"; item: StockItem }
  | { kind: "ambiguous"; candidates: StockItem[] }
  | { kind: "not_found" };

async function resolveStockItem(text: string): Promise<StockResolution> {
  const singular = singularize(normalize(text));
  if (!singular) return { kind: "not_found" };

  // 1. Match exato via RPC (slug/aliases)
  const { data: invExact } = await sb.rpc("find_inventory_item_by_text", { p_text: singular });
  if (Array.isArray(invExact) && invExact.length > 0) {
    return { kind: "found", item: invExact[0] as StockItem };
  }

  // 2. Match por inclusão de tokens em todos os itens ativos
  const { data: all } = await sb
    .from("inventory_items")
    .select("id,name,slug,unit,current_stock,min_stock,product_id,aliases")
    .eq("is_active", true);
  const items: StockItem[] = (all ?? []) as StockItem[];

  const matches = items.filter((i) => {
    const n = normalize(i.name);
    return n.includes(singular) || singular.includes(n);
  });

  if (matches.length === 1) return { kind: "found", item: matches[0] };
  if (matches.length >= 2 && matches.length <= 8) return { kind: "ambiguous", candidates: matches };
  if (matches.length > 8) return { kind: "ambiguous", candidates: matches.slice(0, 8) };

  // 3. Fuzzy Levenshtein ≤2 nos tokens significativos
  const userTokens = singular.split(/\s+/).filter((t) => t.length > 3 && !/\d/.test(t));
  if (userTokens.length > 0) {
    const fuzzyHits: StockItem[] = [];
    for (const it of items) {
      const candTokens = normalize(it.name).split(/\s+/).filter((t) => t.length > 2);
      let hit = false;
      for (const ut of userTokens) {
        for (const ct of candTokens) {
          if (Math.abs(ut.length - ct.length) > 2) continue;
          if (levenshtein(ut, ct) <= 2) { hit = true; break; }
        }
        if (hit) break;
      }
      if (hit) fuzzyHits.push(it);
    }
    if (fuzzyHits.length === 1) return { kind: "found", item: fuzzyHits[0] };
    if (fuzzyHits.length >= 2 && fuzzyHits.length <= 8) return { kind: "ambiguous", candidates: fuzzyHits };
  }

  return { kind: "not_found" };
}

function fmtStockQty(n: number, unit: string): string {
  const v = Number.isInteger(n) ? n.toString() : n.toFixed(2).replace(/\.?0+$/, "");
  return `${v} ${unit || ""}`.trim();
}

// callback_data: s|<type>|<itemId>|<qty>  (type ∈ in/out/adj)
function buildStockChoiceKeyboard(type: "in" | "out" | "adjustment", qty: number, items: StockItem[]): InlineButton[][] {
  const code = type === "in" ? "in" : type === "out" ? "out" : "adj";
  const rows: InlineButton[][] = items.slice(0, 8).map((it) => [{
    text: `${it.name} (${fmtStockQty(it.current_stock, it.unit)})`,
    callback_data: `s|${code}|${it.id}|${qty}`,
  }]);
  rows.push([{ text: "❌ Cancelar", callback_data: "x" }]);
  return rows;
}

async function executeStockMovement(
  item: StockItem,
  type: "in" | "out" | "adjustment",
  qty: number,
  waiter: string,
): Promise<{ text: string; previousStock: number; newStock: number }> {
  const previousStock = Number(item.current_stock);
  const note = `Telegram (${waiter})`;
  const { data, error } = await sb.rpc("apply_inventory_movement", {
    p_item_id: item.id,
    p_type: type,
    p_quantity: qty,
    p_note: note,
    p_source: "telegram",
  });
  if (error) throw new Error(error.message);
  const result = data as any;
  const newStock = Number(result?.new_stock ?? previousStock);
  const min = Number(item.min_stock);
  const verb = type === "in" ? "Entrada" : type === "out" ? "Saída" : "Ajuste";
  const icon = type === "in" ? "📥" : type === "out" ? "📤" : "🔧";
  const qtyStr = fmtStockQty(qty, item.unit);
  let text = `${icon} ${verb}: ${qtyStr} de *${item.name}*\n   Saldo: ${fmtStockQty(newStock, item.unit)}`;
  if (newStock <= 0) {
    text += `\n🚨 Item zerado!`;
  } else if (min > 0 && newStock <= min) {
    text += `\n⚠️ Atingiu o crítico (mín ${fmtStockQty(min, item.unit)})`;
  }
  return { text, previousStock, newStock };
}

async function executeStockUndo(entry: StockUndoEntry, waiter: string): Promise<string> {
  // IN  → reverte com OUT da mesma quantidade
  // OUT → reverte com IN da mesma quantidade
  // ADJUSTMENT → aplica novo ADJUSTMENT com previousStock
  const note = `Telegram undo (${waiter})`;
  let invType: "in" | "out" | "adjustment";
  let invQty: number;
  if (entry.type === "in") { invType = "out"; invQty = entry.qty; }
  else if (entry.type === "out") { invType = "in"; invQty = entry.qty; }
  else { invType = "adjustment"; invQty = entry.previousStock; }

  const { data, error } = await sb.rpc("apply_inventory_movement", {
    p_item_id: entry.itemId,
    p_type: invType,
    p_quantity: invQty,
    p_note: note,
    p_source: "telegram",
  });
  if (error) throw new Error(error.message);
  const newStock = Number((data as any)?.new_stock ?? 0);
  return `↩️ Estoque revertido: *${entry.itemName}* → ${fmtStockQty(newStock, entry.unit)}`;
}

async function executeStockQuery(item: StockItem): Promise<string> {
  const min = Number(item.min_stock);
  const cur = Number(item.current_stock);
  let icon = "📦";
  if (cur <= 0) icon = "🚨";
  else if (min > 0 && cur <= min) icon = "⚠️";
  const minLine = min > 0 ? ` (mín ${fmtStockQty(min, item.unit)})` : "";
  return `${icon} *${item.name}*: ${fmtStockQty(cur, item.unit)}${minLine}`;
}

const HELP_TEXT =
  `🤖 *Como usar*\n\n` +
  `📌 *PEDIDOS*\n` +
  `  • mesa 3 + 2 coca 350\n` +
  `  • adiciona 2 cocas na mesa 3\n` +
  `  • mesa 1 - 1 agua\n` +
  `  • tira duas aguas da mesa 1\n\n` +
  `🔍 *CONSULTA*\n` +
  `  • mesa 4 ver pedido\n` +
  `  • mesa 4 o que tem / consumo\n` +
  `  • status mesa 4 / mesa 4 como ta\n\n` +
  `📦 *ESTOQUE*\n` +
  `  • *gerenciar estoque* / menu estoque → modo guiado com botões\n` +
  `  • entrada 10 coca / repor 10 coca\n` +
  `  • saida 2 picanha / vendi 3 coca / acabou 1 prato\n` +
  `  • ajuste coca 50 / contei 50 coca\n` +
  `  • estoque coca / quanto tem de coca\n` +
  `  • lista estoque / inventario → todos os itens\n` +
  `  • estoque (sozinho) / alertas → críticos\n\n` +
  `🛠 *OUTROS*\n` +
  `  • errei / desfazer / oops → desfaz último\n` +
  `  • relatorio / caixa / vendas hoje → resumo do dia\n` +
  `  • silencia / volta avisos → notificações\n` +
  `  • mesa 5 / vou pra mesa 5 → fixa mesa do contexto\n\n` +
  `🧩 *Vários comandos numa mensagem*\n` +
  `Separe com quebra de linha, \`;\`, \` | \` ou \` // \`. Ex:\n` +
  `  mesa 1 +1 coca; mesa 1 +2 cerva\n` +
  `  mesa 1 +1 coca | mesa 2 +1 cerva\n\n` +
  `💨 *Atalhos* (até 15 min após usar uma mesa):\n` +
  `  • mais um boi / + 1 coca 350 / tira uma agua / ver pedido\n\n` +
  `💡 Aceita números por extenso (um, dois… dez) e plural simples.\n` +
  `🔍 Comece com "preview" para simular sem executar.`;


const NEEDS_TABLE_TEXT =
  `⚠️ Não sei qual mesa usar. Envie no formato completo, ex: \`mesa 1 + 1 coca 350\` ` +
  `(ou use uma mesa nos últimos 15 min).`;

// ─────────────────────────── preview (dry-run) ───────────────────────────

async function previewCommand(cmd: Command, chatId: number): Promise<string> {
  if (cmd.kind === "HELP") return `ℹ️ (preview) Mostraria a ajuda.`;
  if (cmd.kind === "REPORT") return `📊 (preview) Geraria o relatório do dia.`;
  if (cmd.kind === "STOCK_CRITICAL") return `📦 (preview) Listaria itens em estoque crítico.`;
  if (cmd.kind === "STOCK_MOVEMENT") {
    const verb = cmd.type === "in" ? "Somaria" : cmd.type === "out" ? "Subtrairia" : "Definiria saldo de";
    return `📦 (preview) ${verb} ${cmd.qty}${cmd.unit ? " " + cmd.unit : ""} em "${cmd.itemText}".`;
  }
  if (cmd.kind === "STOCK_OUT_NOW") return `🚨 (preview) Marcaria "${cmd.itemText}" como esgotado (estoque = 0).`;
  if (cmd.kind === "STOCK_QUERY") return `📦 (preview) Mostraria saldo de "${cmd.itemText}".`;
  if (cmd.kind === "STOCK_LIST") return `📦 (preview) Listaria todos os itens do estoque (até 30).`;
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
  if (cmd.kind === "STOCK_LIST") {
    const { data } = await sb.from("inventory_items")
      .select("name,current_stock,min_stock,unit")
      .eq("is_active", true)
      .order("name", { ascending: true })
      .limit(30);
    const items = data ?? [];
    if (items.length === 0) return { text: "📦 Nenhum item ativo no estoque." };
    const lines = items.map((i: any) => {
      const cur = Number(i.current_stock);
      const min = Number(i.min_stock);
      let icon = "•";
      if (cur <= 0) icon = "🚨";
      else if (min > 0 && cur <= min) icon = "⚠️";
      return `${icon} ${i.name}: ${cur} ${i.unit || ""}`.trim();
    });
    const more = items.length === 30 ? `\n\n_(mostrando 30 itens. Use \`estoque <nome>\` para ver um específico.)_` : "";
    return { text: `📦 *Estoque (${items.length})*\n\n` + lines.join("\n") + more };
  }
  if (cmd.kind === "STOCK_QUERY") {
    const res = await resolveStockItem(cmd.itemText);
    if (res.kind === "not_found") {
      return { text: `❓ Não achei "${cmd.itemText}" no estoque.\nUse \`estoque\` (sozinho) para ver itens críticos.` };
    }
    if (res.kind === "ambiguous") {
      const list = res.candidates.slice(0, 5).map((i) => `  • ${i.name} — ${fmtStockQty(Number(i.current_stock), i.unit)}`).join("\n");
      return { text: `🤔 Vários itens batem com "${cmd.itemText}":\n${list}\n\nSeja mais específico (ex: \`estoque coca 350\`).` };
    }
    return { text: await executeStockQuery(res.item) };
  }
  if (cmd.kind === "STOCK_OUT_NOW") {
    const res = await resolveStockItem(cmd.itemText);
    if (res.kind === "not_found") {
      return {
        text: `❓ Não achei "${cmd.itemText}" no estoque. Tente \`lista estoque\` pra ver os nomes.`,
      };
    }
    if (res.kind === "ambiguous") {
      const list = res.candidates.slice(0, 5).map((i) => `  • ${i.name}`).join("\n");
      return { text: `🤔 Vários itens batem com "${cmd.itemText}":\n${list}\n\nSeja mais específico (ex: \`acabou coca 350\`).` };
    }
    try {
      const out = await executeStockMovement(res.item, "adjustment", 0, waiter);
      const token = registerStockUndo({
        itemId: res.item.id,
        itemName: res.item.name,
        unit: res.item.unit,
        type: "adjustment",
        qty: 0,
        previousStock: out.previousStock,
      });
      return {
        text: `✅ Marquei *${res.item.name}* como esgotado (estoque = 0). PALM já mostra a tarja.`,
        keyboard: buildStockUndoKeyboard(token),
      };
    } catch (e: any) {
      return { text: `❌ Erro ao marcar esgotado: ${String(e?.message ?? e)}` };
    }
  }
  if (cmd.kind === "STOCK_MOVEMENT") {
    const res = await resolveStockItem(cmd.itemText);
    if (res.kind === "not_found") {
      return {
        text: `❓ Não achei "${cmd.itemText}" no estoque.\n` +
              `Verifique o nome ou cadastre o item no Palm primeiro.`,
      };
    }
    if (res.kind === "ambiguous") {
      const verbo = cmd.type === "in" ? "Entrada" : cmd.type === "out" ? "Saída" : "Ajuste";
      return {
        text: `🤔 ${verbo} de ${cmd.qty}${cmd.unit ? " " + cmd.unit : ""} "${cmd.itemText}" — qual item?`,
        keyboard: buildStockChoiceKeyboard(cmd.type, cmd.qty, res.candidates),
      };
    }
    try {
      const out = await executeStockMovement(res.item, cmd.type, cmd.qty, waiter);
      const token = registerStockUndo({
        itemId: res.item.id,
        itemName: res.item.name,
        unit: res.item.unit,
        type: cmd.type,
        qty: cmd.qty,
        previousStock: out.previousStock,
      });
      return { text: out.text, keyboard: buildStockUndoKeyboard(token) };
    } catch (e: any) {
      return { text: `❌ Erro no estoque: ${String(e?.message ?? e)}` };
    }
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

  // ─── WIZARD callbacks (wz|...) ───
  if (data.startsWith("wz|")) {
    const bound = typeof userId === "number" ? await getWaiterBinding(userId) : null;
    const waiter = bound ?? (username ? `Telegram (@${username})` : "Telegram");
    const handled = await wzHandleCallback(cb, waiter);
    if (handled) return;
  }

  // ─── VOICE CONFIRM (vc|ok|<token> | vc|no|<token>) ───
  if (data.startsWith("vc|")) {
    const [, op, token] = data.split("|");
    if (!token) {
      await answerCallback(cbId, "Inválido");
      return;
    }
    // Carrega state
    const { data: stateRow } = await sb
      .from("telegram_chat_state")
      .select("step, data, expires_at")
      .eq("chat_id", chatId)
      .maybeSingle();
    if (!stateRow || stateRow.step !== "voice_confirm" || (stateRow.data as any)?.token !== token) {
      await answerCallback(cbId, "Expirado");
      await editTelegramMessage(chatId, messageId, "⏱ Confirmação expirada.");
      return;
    }
    if (new Date(stateRow.expires_at).getTime() < Date.now()) {
      await sb.from("telegram_chat_state").delete().eq("chat_id", chatId);
      await answerCallback(cbId, "Expirado");
      await editTelegramMessage(chatId, messageId, "⏱ Confirmação expirada.");
      return;
    }
    // Limpa state imediatamente
    await sb.from("telegram_chat_state").delete().eq("chat_id", chatId);

    if (op === "no") {
      await answerCallback(cbId, "Cancelado");
      await editTelegramMessage(chatId, messageId, `🎤 Ouvi: "${(stateRow.data as any).transcript}"\n\n❌ Cancelado.`);
      return;
    }
    if (op === "ok") {
      const line: string = (stateRow.data as any).line;
      const transcript: string = (stateRow.data as any).transcript;
      const waiter: string = (stateRow.data as any).waiter ?? (username ? `Telegram (@${username})` : "Telegram");
      await answerCallback(cbId, "Executando…");
      try {
        const parsed = parseCommand(line);
        const cmd = await resolveWithContext(parsed, chatId, userId, chatType);
        const reply = await handleCommand(cmd, waiter);
        await editTelegramMessage(chatId, messageId, `🎤 Ouvi: "${transcript}"\n\n${reply.text}`, reply.keyboard);
      } catch (e: any) {
        await editTelegramMessage(chatId, messageId, `🎤 Ouvi: "${transcript}"\n\n❌ Erro: ${String(e?.message ?? e)}`);
      }
      return;
    }
    await answerCallback(cbId, "Op desconhecida");
    return;
  }

  if (data === "x") {
    await answerCallback(cbId, "Cancelado");
    await editTelegramMessage(chatId, messageId, "❌ Cancelado.");
    return;
  }

  // ─── REFRESH lista de garçons (botão 🔄) ───
  if (data === "pw_refresh") {
    const names = await listWaiterNames();
    await answerCallback(cbId, names.length ? `${names.length} garçom(ns)` : "Nenhum cadastrado");
    await editTelegramMessage(
      chatId,
      messageId,
      buildWaiterPickerMessage(names, username),
      buildWaiterPickerKeyboard(names),
    );
    return;
  }

  // ─── PICK WAITER: pw|<base64url(nome)> ───
  if (data.startsWith("pw|")) {
    if (typeof userId !== "number") {
      await answerCallback(cbId, "Sem usuário");
      return;
    }
    const picked = decodeWaiterName(data.slice(3));
    if (!picked) {
      await answerCallback(cbId, "Opção inválida");
      return;
    }
    // Revalida em tempo real: o garçom ainda existe no Palm?
    const names = await listWaiterNames();
    if (!names.includes(picked)) {
      await answerCallback(cbId, "Garçom não existe mais");
      await editTelegramMessage(
        chatId,
        messageId,
        `⚠️ *${picked}* não está mais cadastrado no Palm.\nEscolha outro:`,
        buildWaiterPickerKeyboard(names),
      );
      return;
    }
    await setWaiterBinding(userId, picked, username);
    await answerCallback(cbId, `Olá, ${picked}!`);
    await editTelegramMessage(
      chatId,
      messageId,
      `✅ Pronto! Você está identificado como *${picked}*.\n\nAgora pode mandar comandos:\n  • mesa 5 + 2 coca\n  • mesa 5 status\n  • ajuda\n\nPara trocar: /trocar`,
    );
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
    const bound = typeof userId === "number" ? await getWaiterBinding(userId) : null;
    const waiter = bound ?? (username ? `Telegram (@${username}) [undo]` : "Telegram [undo]");
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
    const bound = typeof userId === "number" ? await getWaiterBinding(userId) : null;
    const waiter = bound ?? (username ? `Telegram (@${username}) [undo]` : "Telegram [undo]");
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

  // ─── STOCK UNDO: us|<token> ───
  if (data.startsWith("us|")) {
    cleanupStockUndos();
    const token = data.slice(3);
    const entry = pendingStockUndos.get(token);
    if (!entry) {
      await answerCallback(cbId, "Expirado");
      await editTelegramMessage(chatId, messageId, "⏱ Desfazer expirado.");
      return;
    }
    const bound = typeof userId === "number" ? await getWaiterBinding(userId) : null;
    const waiter = bound ?? (username ? `@${username}` : "Telegram");
    await answerCallback(cbId);
    try {
      const result = await executeStockUndo(entry, waiter);
      pendingStockUndos.delete(token);
      await editTelegramMessage(chatId, messageId, `↩️ Operação revertida.\n${result}`);
    } catch (e: any) {
      await editTelegramMessage(chatId, messageId, `❌ Erro ao desfazer: ${String(e?.message ?? e)}`);
    }
    return;
  }

  // ─── STOCK CHOICE: s|<type>|<itemId>|<qty> ───
  if (data.startsWith("s|")) {
    const sParts = data.split("|");
    if (sParts.length !== 4) {
      await answerCallback(cbId, "Inválido");
      return;
    }
    const [, typeCode, itemId, qtyStr] = sParts;
    const type: "in" | "out" | "adjustment" | null =
      typeCode === "in" ? "in" : typeCode === "out" ? "out" : typeCode === "adj" ? "adjustment" : null;
    const qty = parseFloat(qtyStr);
    if (!type || !UUID_RE.test(itemId) || !Number.isFinite(qty) || qty < 0) {
      await answerCallback(cbId, "Dados inválidos");
      return;
    }
    const { data: itemData } = await sb
      .from("inventory_items")
      .select("id,name,slug,unit,current_stock,min_stock,product_id")
      .eq("id", itemId)
      .maybeSingle();
    if (!itemData) {
      await answerCallback(cbId, "Item não encontrado");
      await editTelegramMessage(chatId, messageId, "❌ Item de estoque não encontrado.");
      return;
    }
    const bound = typeof userId === "number" ? await getWaiterBinding(userId) : null;
    const waiter = bound ?? (username ? `@${username} [botão]` : "Telegram [botão]");
    await answerCallback(cbId);
    try {
      const out = await executeStockMovement(itemData as StockItem, type, qty, waiter);
      const token = registerStockUndo({
        itemId: itemData.id,
        itemName: itemData.name,
        unit: itemData.unit,
        type, qty,
        previousStock: out.previousStock,
      });
      await editTelegramMessage(chatId, messageId, out.text);
      await sendTelegram(chatId, `↩️ Quer desfazer essa ação?`, buildStockUndoKeyboard(token));
    } catch (e: any) {
      await editTelegramMessage(chatId, messageId, `❌ Erro no estoque: ${String(e?.message ?? e)}`);
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

  const bound = typeof userId === "number" ? await getWaiterBinding(userId) : null;
  const waiter = bound ?? (username ? `Telegram (@${username}) [botão]` : "Telegram [botão]");
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

// ═══════════════════════════════════════════════════════════════
// WIZARD DE ESTOQUE v2 — fluxo robusto com navegação, contexto e carrinho
// ═══════════════════════════════════════════════════════════════

type WzAction = "in" | "out" | "adj";
type WzScope =
  | { kind: "single"; itemId: string; itemName: string; unit: string; currentStock: number; minStock: number; category?: string }
  | { kind: "all" }
  | { kind: "category"; category: string };

type WzCartEntry = {
  itemId: string;
  itemName: string;
  unit: string;
  type: "in" | "out" | "adjustment";
  qty: number;
  previousStock: number; // saldo no momento da adição (preview)
  projectedStock: number; // saldo após aplicar
};

type WzData = {
  action?: WzAction;
  scope?: WzScope;
  qty?: number;
  qtySuggestions?: number[];
  // Stack para botão "Voltar" — guarda steps anteriores e seu data
  history?: { step: WzStep; data: Omit<WzData, "history"> }[];
  // Modo carrinho
  cart?: WzCartEntry[];
  // Modo "fazer outra" — repete a ação do step
  repeatAction?: WzAction;
};

type WzStep =
  | "main_menu"
  | "awaiting_item"          // escolher item para single op (com top movidos + busca)
  | "awaiting_search"        // aguardando texto livre de busca
  | "awaiting_scope"         // escolher escopo all/category quando sem item
  | "awaiting_qty"           // mostrar sugestões de qty
  | "awaiting_qty_text"      // aguardando texto livre numérico
  | "awaiting_review"        // tela de confirmação single
  | "awaiting_mass_review"   // tela de confirmação operação em massa
  | "cart_main"              // menu do carrinho
  | "cart_adding_item"       // adicionando item ao carrinho (escopo single)
  | "cart_adding_qty";       // adicionando qty ao carrinho

const WZ_TTL_MIN_DEFAULT = 5;
const WZ_TTL_MIN_CART = 30;

async function wzGet(chatId: number): Promise<{ step: WzStep; data: WzData } | null> {
  // Limpa expirados em paralelo (best-effort)
  sb.from("telegram_chat_state").delete().lt("expires_at", new Date().toISOString()).then();
  const { data, error } = await sb
    .from("telegram_chat_state")
    .select("step, data, expires_at")
    .eq("chat_id", chatId)
    .maybeSingle();
  if (error || !data) return null;
  if (new Date(data.expires_at as string).getTime() < Date.now()) {
    await sb.from("telegram_chat_state").delete().eq("chat_id", chatId);
    return null;
  }
  return { step: data.step as WzStep, data: (data.data ?? {}) as WzData };
}

async function wzSet(chatId: number, step: WzStep, data: WzData): Promise<void> {
  const isCart = step === "cart_main" || step === "cart_adding_item" || step === "cart_adding_qty" || (data.cart && data.cart.length > 0);
  const ttl = isCart ? WZ_TTL_MIN_CART : WZ_TTL_MIN_DEFAULT;
  const expires = new Date(Date.now() + ttl * 60_000).toISOString();
  const { error } = await sb
    .from("telegram_chat_state")
    .upsert({ chat_id: chatId, step, data, expires_at: expires, updated_at: new Date().toISOString() }, { onConflict: "chat_id" });
  if (error) console.error("wzSet:", error.message);
}

async function wzClear(chatId: number): Promise<void> {
  await sb.from("telegram_chat_state").delete().eq("chat_id", chatId);
}

// Push current step+data into history before transitioning
function wzPushHistory(currentStep: WzStep, currentData: WzData): WzData["history"] {
  const hist = [...(currentData.history ?? [])];
  // não empurra duplicado consecutivo
  const last = hist[hist.length - 1];
  if (!last || last.step !== currentStep) {
    const { history: _h, ...rest } = currentData;
    hist.push({ step: currentStep, data: rest });
  }
  // limita stack pra não inchar
  if (hist.length > 8) hist.shift();
  return hist;
}

function wzActionLabel(a: WzAction): string {
  return a === "in" ? "📥 Entrada" : a === "out" ? "📤 Saída" : "✏️ Ajuste";
}
function wzActionVerb(a: WzAction): "in" | "out" | "adjustment" {
  return a === "in" ? "in" : a === "out" ? "out" : "adjustment";
}
function wzActionEmoji(a: WzAction | "in" | "out" | "adjustment"): string {
  if (a === "in") return "📥";
  if (a === "out") return "📤";
  return "✏️";
}

function wzNavRow(opts: { back?: boolean; home?: boolean; cancel?: boolean } = { back: true, cancel: true }): InlineButton[] {
  const row: InlineButton[] = [];
  if (opts.back) row.push({ text: "← Voltar", callback_data: "wz|back" });
  if (opts.home) row.push({ text: "🏠 Menu", callback_data: "wz|home" });
  if (opts.cancel) row.push({ text: "❌ Cancelar", callback_data: "wz|cancel" });
  return row;
}

// ─── Tela 1: Menu principal rico ───
async function wzMainMenuV2(chatId: number, messageId?: number, extraInfo?: string) {
  // Conta itens, críticos, zerados, categorias
  const { data: items } = await sb
    .from("inventory_items")
    .select("id, current_stock, min_stock, category, is_active")
    .eq("is_active", true);
  const arr = (items ?? []) as any[];
  const total = arr.length;
  let critical = 0;
  let zero = 0;
  for (const it of arr) {
    const cur = Number(it.current_stock);
    const min = Number(it.min_stock);
    if (cur <= 0) zero++;
    else if (min > 0 && cur <= min) critical++;
  }

  // Tem rascunho de carrinho?
  const state = await wzGet(chatId);
  const cartCount = state?.data.cart?.length ?? 0;

  let text = `📦 *Gerenciar Estoque*\n`;
  text += `Saldo total: ${total} item(ns) ativo(s)`;
  if (critical > 0) text += ` · ⚠️ ${critical} crítico(s)`;
  if (zero > 0) text += ` · 🚨 ${zero} zerado(s)`;
  if (cartCount > 0) text += `\n🧾 Carrinho: ${cartCount} item(ns) no rascunho`;
  if (extraInfo) text += `\n\n${extraInfo}`;
  text += `\n\nO que deseja fazer?`;

  const rows: InlineButton[][] = [
    [{ text: "📥 Entrada", callback_data: "wz|act|in" }, { text: "📤 Saída", callback_data: "wz|act|out" }],
    [{ text: "✏️ Ajuste", callback_data: "wz|act|adj" }, { text: cartCount > 0 ? `🧾 Carrinho (${cartCount})` : "🧾 Contagem (multi)", callback_data: "wz|cart|view" }],
    [{ text: "🔍 Buscar item", callback_data: "wz|search" }, { text: "📂 Por categoria", callback_data: "wz|cats" }],
  ];
  const lastRow: InlineButton[] = [];
  if (critical + zero > 0) lastRow.push({ text: `🚨 Críticos (${critical + zero})`, callback_data: "wz|act|crit" });
  lastRow.push({ text: "📋 Listar tudo", callback_data: "wz|act|list" });
  rows.push(lastRow);
  rows.push([{ text: "❌ Fechar", callback_data: "wz|cancel" }]);

  await wzSet(chatId, "main_menu", { cart: state?.data.cart });

  if (messageId !== undefined) await editTelegramMessage(chatId, messageId, text, rows);
  else await sendTelegram(chatId, text, rows);
}

// ─── Helpers de busca/contexto ───

// Categorias canônicas do cardápio (espelha src/lib/types.ts).
const MENU_CATEGORIES = ["refeicoes", "espetos", "bebidas", "cervejas"] as const;
const MENU_CATEGORY_LABELS: Record<string, string> = {
  refeicoes: "Refeições",
  espetos: "Espetos",
  bebidas: "Bebidas",
  cervejas: "Cervejas",
};
function wzCategoryLabel(slug: string): string {
  return MENU_CATEGORY_LABELS[slug] ?? (slug.charAt(0).toUpperCase() + slug.slice(1));
}

async function wzListCategoriesWithCount(): Promise<{ name: string; label: string; count: number }[]> {
  const { data } = await sb.from("inventory_items").select("category").eq("is_active", true);
  const counts = new Map<string, number>();
  for (const r of (data ?? []) as any[]) {
    const c = r.category || "outros";
    counts.set(c, (counts.get(c) ?? 0) + 1);
  }
  // Mostra as 4 categorias do cardápio na ordem canônica, suprimindo as vazias
  // (refeições, por exemplo, deixaram de ter estoque próprio).
  const result = MENU_CATEGORIES
    .map((name) => ({
      name,
      label: wzCategoryLabel(name),
      count: counts.get(name) ?? 0,
    }))
    .filter((c) => c.count > 0);
  // Anexa categorias legacy não canônicas que ainda tenham itens (ex: "outros").
  for (const [name, count] of counts.entries()) {
    if (!MENU_CATEGORIES.includes(name as any) && count > 0) {
      result.push({ name, label: wzCategoryLabel(name), count });
    }
  }
  return result;
}

async function wzTopMovedItems(action: WzAction, limit = 5): Promise<any[]> {
  const movType = wzActionVerb(action);
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data } = await sb
    .from("inventory_movements")
    .select("item_id")
    .eq("movement_type", movType)
    .gte("created_at", since)
    .limit(300);
  const counts = new Map<string, number>();
  for (const r of (data ?? []) as any[]) {
    counts.set(r.item_id, (counts.get(r.item_id) ?? 0) + 1);
  }
  const topIds = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
  if (topIds.length === 0) return [];
  const { data: items } = await sb
    .from("inventory_items")
    .select("id, name, unit, current_stock, min_stock, category")
    .eq("is_active", true)
    .in("id", topIds);
  const map = new Map<string, any>();
  for (const it of (items ?? []) as any[]) map.set(it.id, it);
  return topIds.map((id) => map.get(id)).filter(Boolean);
}

async function wzSearchItems(query: string, limit = 8): Promise<any[]> {
  const q = query.trim();
  if (!q) return [];
  // tenta exato via RPC
  const { data: exact } = await sb.rpc("find_inventory_item_by_text", { p_text: q });
  const arr = (exact ?? []) as any[];
  if (arr.length === 1) return arr;
  // ilike
  const { data } = await sb
    .from("inventory_items")
    .select("id, name, unit, current_stock, min_stock, category")
    .eq("is_active", true)
    .ilike("name", `%${q}%`)
    .order("name")
    .limit(limit);
  return (data ?? []) as any[];
}

function wzItemButtonLabel(it: any): string {
  return `${it.name} · ${fmtStockQty(Number(it.current_stock), it.unit || "")}`;
}

// ─── Tela 2: Escolha de item ───

const WZ_ITEMS_PAGE_SIZE = 12;

async function wzListAllActiveItems(): Promise<any[]> {
  const { data } = await sb
    .from("inventory_items")
    .select("id, name, unit, current_stock, min_stock, category")
    .eq("is_active", true)
    .order("name")
    .limit(500);
  return (data ?? []) as any[];
}

async function wzShowItemPicker(chatId: number, messageId: number | undefined, action: WzAction, currentStep: WzStep, currentData: WzData, extraText?: string, page = 0) {
  const [top, all] = await Promise.all([wzTopMovedItems(action, 5), wzListAllActiveItems()]);
  const topIds = new Set(top.map((it) => it.id));
  const rest = all.filter((it) => !topIds.has(it.id));

  const totalPages = Math.max(1, Math.ceil(rest.length / WZ_ITEMS_PAGE_SIZE));
  const safePage = Math.max(0, Math.min(page, totalPages - 1));
  const pageItems = rest.slice(safePage * WZ_ITEMS_PAGE_SIZE, (safePage + 1) * WZ_ITEMS_PAGE_SIZE);

  const lines: string[] = [`${wzActionLabel(action)} · escolha o item`];
  lines.push(``);
  lines.push(`💡 Toque em um item abaixo ou digite parte do nome para buscar.`);
  if (extraText) lines.push(`\n${extraText}`);

  const rows: InlineButton[][] = [];

  if (top.length > 0) {
    rows.push([{ text: `⭐ Mais usados (30d)`, callback_data: "wz|noop" }]);
    for (const it of top) {
      rows.push([{ text: wzItemButtonLabel(it), callback_data: `wz|item|${it.id}` }]);
    }
  }

  if (pageItems.length > 0) {
    rows.push([{ text: `📋 Todos os itens (${rest.length})`, callback_data: "wz|noop" }]);
    for (const it of pageItems) {
      rows.push([{ text: wzItemButtonLabel(it), callback_data: `wz|item|${it.id}` }]);
    }
  }

  if (totalPages > 1) {
    const navRow: InlineButton[] = [];
    if (safePage > 0) navRow.push({ text: "◀️ Anterior", callback_data: `wz|page|${safePage - 1}` });
    navRow.push({ text: `${safePage + 1}/${totalPages}`, callback_data: "wz|noop" });
    if (safePage < totalPages - 1) navRow.push({ text: "Próxima ▶️", callback_data: `wz|page|${safePage + 1}` });
    rows.push(navRow);
  }

  rows.push([
    { text: "🔍 Buscar (digitar)", callback_data: "wz|search" },
    { text: "📂 Por categoria", callback_data: "wz|cats" },
  ]);
  rows.push([{ text: "🌐 Aplicar em TODOS", callback_data: "wz|scope|all" }]);
  rows.push(wzNavRow({ back: true, home: true, cancel: true }));

  const history = wzPushHistory(currentStep, currentData);
  await wzSet(chatId, "awaiting_item", { ...currentData, action, page: safePage, history });

  const text = lines.join("\n");
  if (messageId !== undefined) await editTelegramMessage(chatId, messageId, text, rows);
  else await sendTelegram(chatId, text, rows);
}

async function wzShowCategoryPicker(chatId: number, messageId: number | undefined, action: WzAction | undefined, currentStep: WzStep, currentData: WzData) {
  const cats = await wzListCategoriesWithCount();
  const rows: InlineButton[][] = [];
  for (let i = 0; i < cats.length; i += 2) {
    const row: InlineButton[] = [];
    for (let j = 0; j < 2 && i + j < cats.length; j++) {
      const c = cats[i + j];
      const enc = encodeURIComponent(c.name).slice(0, 30);
      row.push({ text: `📂 ${c.label} (${c.count})`, callback_data: action ? `wz|scope|cat|${enc}` : `wz|catview|${enc}` });
    }
    rows.push(row);
  }
  rows.push(wzNavRow({ back: true, home: true, cancel: true }));

  const history = wzPushHistory(currentStep, currentData);
  await wzSet(chatId, action ? "awaiting_scope" : "awaiting_item", { ...currentData, action, history });

  const text = action ? `${wzActionLabel(action)} · escolha a categoria` : `📂 Categorias\nEscolha uma para ver os itens.`;
  if (messageId !== undefined) await editTelegramMessage(chatId, messageId, text, rows);
  else await sendTelegram(chatId, text, rows);
}

// ─── Tela 3: Quantidade (contextual) ───

async function wzSmartQtySuggestions(action: WzAction, scope: WzScope): Promise<number[]> {
  const movType = wzActionVerb(action);
  let q = sb.from("inventory_movements").select("quantity").eq("movement_type", movType).order("created_at", { ascending: false }).limit(60);
  if (scope.kind === "single") q = q.eq("item_id", scope.itemId);
  const { data } = await q;
  const counts = new Map<number, number>();
  for (const r of (data ?? []) as any[]) {
    const n = Number(r.quantity);
    if (!Number.isFinite(n) || n <= 0) continue;
    const k = Math.round(n * 100) / 100;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  const top = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([n]) => n);
  const defaults = action === "adj" ? [0, 10, 50, 100] : [1, 5, 10, 24];
  for (const d of defaults) if (top.length < 4 && !top.includes(d)) top.push(d);
  return top.slice(0, 4).sort((a, b) => a - b);
}

async function wzAskQty(chatId: number, messageId: number | undefined, action: WzAction, scope: WzScope, currentStep: WzStep, currentData: WzData) {
  const sugg = await wzSmartQtySuggestions(action, scope);

  const lines: string[] = [];
  if (scope.kind === "single") {
    const min = scope.minStock || 0;
    lines.push(`${wzActionLabel(action)} · *${scope.itemName}*`);
    lines.push(`Saldo atual: ${fmtStockQty(scope.currentStock, scope.unit)}` + (min > 0 ? ` · Mín: ${fmtStockQty(min, scope.unit)}` : ""));
    lines.push("");
    if (action === "in") lines.push(`Quanto adicionar?`);
    else if (action === "out") lines.push(`Quanto tirar?`);
    else lines.push(`Ajustar saldo *para qual valor*?`);
  } else if (scope.kind === "all") {
    lines.push(`${wzActionLabel(action)} → *TODOS os itens ativos*`);
    lines.push("");
    lines.push(action === "adj" ? `Ajustar saldo de todos para qual valor?` : `Quantas unidades em cada item?`);
  } else {
    lines.push(`${wzActionLabel(action)} → categoria *${wzCategoryLabel(scope.category)}*`);
    lines.push("");
    lines.push(action === "adj" ? `Ajustar saldo dos itens para qual valor?` : `Quantas unidades em cada item?`);
  }

  // Botões de quantidade contextuais
  const prefix = action === "in" ? "+" : action === "out" ? "-" : "=";
  const qtyButtons: InlineButton[] = sugg.map((n) => ({
    text: `${prefix}${n}`,
    callback_data: `wz|qty|${n}`,
  }));
  // quebra em 2 linhas se > 3
  const qtyRows: InlineButton[][] = qtyButtons.length > 3
    ? [qtyButtons.slice(0, Math.ceil(qtyButtons.length / 2)), qtyButtons.slice(Math.ceil(qtyButtons.length / 2))]
    : [qtyButtons];

  const extraRows: InlineButton[][] = [];
  if (scope.kind === "single") {
    if (action === "out" && scope.currentStock > 0 && scope.currentStock <= 10) {
      extraRows.push([{ text: `📤 Tirar tudo (${fmtStockQty(scope.currentStock, scope.unit)})`, callback_data: `wz|qty|${scope.currentStock}` }]);
    }
    if (action === "adj") {
      extraRows.push([
        { text: `Manter (${scope.currentStock})`, callback_data: `wz|qty|${scope.currentStock}` },
        { text: `Zerar (0)`, callback_data: `wz|qty|0` },
      ]);
    }
  }
  extraRows.push([{ text: "✏️ Digitar valor", callback_data: "wz|qty|other" }]);
  extraRows.push(wzNavRow({ back: true, home: true, cancel: true }));

  const rows = [...qtyRows, ...extraRows];

  const history = wzPushHistory(currentStep, currentData);
  await wzSet(chatId, "awaiting_qty", { ...currentData, action, scope, qtySuggestions: sugg, history });

  const text = lines.join("\n");
  if (messageId !== undefined) await editTelegramMessage(chatId, messageId, text, rows);
  else await sendTelegram(chatId, text, rows);
}

// ─── Tela 4: Review (single) ───

async function wzShowReviewSingle(chatId: number, messageId: number | undefined, action: WzAction, scope: Extract<WzScope, { kind: "single" }>, qty: number, currentStep: WzStep, currentData: WzData) {
  const verb = action === "in" ? "Entrada" : action === "out" ? "Saída" : "Ajuste";
  const projected = action === "in" ? scope.currentStock + qty : action === "out" ? scope.currentStock - qty : qty;

  const lines: string[] = [];
  lines.push(`✅ *Revisar*`);
  lines.push(`*${scope.itemName}*`);
  lines.push(`Operação: ${wzActionEmoji(action)} ${verb} de ${fmtStockQty(qty, scope.unit)}`);
  lines.push(`Saldo: ${fmtStockQty(scope.currentStock, scope.unit)} → *${fmtStockQty(projected, scope.unit)}*`);
  if (action === "out" && projected < 0) lines.push(`\n⚠️ Saldo ficará negativo!`);
  if (projected <= 0) lines.push(`\n🚨 Item ficará zerado.`);
  else if (scope.minStock > 0 && projected <= scope.minStock) lines.push(`\n⚠️ Item ficará abaixo do mínimo (${fmtStockQty(scope.minStock, scope.unit)}).`);

  const rows: InlineButton[][] = [
    [{ text: "✅ Confirmar", callback_data: "wz|confirm" }],
    [{ text: "➕ Confirmar e fazer outra", callback_data: "wz|repeat" }],
    [{ text: "🧾 Adicionar ao carrinho", callback_data: "wz|cart|add" }],
    wzNavRow({ back: true, home: true, cancel: true }),
  ];

  const history = wzPushHistory(currentStep, currentData);
  await wzSet(chatId, "awaiting_review", { ...currentData, action, scope, qty, history });

  const text = lines.join("\n");
  if (messageId !== undefined) await editTelegramMessage(chatId, messageId, text, rows);
  else await sendTelegram(chatId, text, rows);
}

// ─── Tela operação em massa: preview detalhado ───

async function wzMassOpItems(scope: WzScope): Promise<any[]> {
  let q = sb.from("inventory_items").select("id, name, current_stock, min_stock, unit, category").eq("is_active", true).limit(200);
  if (scope.kind === "category") q = q.eq("category", scope.category);
  const { data } = await q;
  return (data ?? []) as any[];
}

async function wzShowMassReview(chatId: number, messageId: number | undefined, action: WzAction, scope: WzScope, qty: number, currentStep: WzStep, currentData: WzData, fullList = false) {
  const items = await wzMassOpItems(scope);
  if (items.length === 0) {
    if (messageId !== undefined) await editTelegramMessage(chatId, messageId, "❌ Nenhum item encontrado para esse escopo.", [wzNavRow({ back: true, home: true, cancel: true })]);
    else await sendTelegram(chatId, "❌ Nenhum item encontrado para esse escopo.");
    return;
  }
  const verb = action === "in" ? "Entrada de +" : action === "out" ? "Saída de -" : "Ajuste para ";
  const scopeLabel = scope.kind === "all" ? "todos os itens ativos" : `categoria *${wzCategoryLabel((scope as any).category)}*`;
  const previewLimit = fullList ? Math.min(items.length, 30) : 5;

  const lines: string[] = [];
  lines.push(`⚠️ *Operação em massa*`);
  lines.push(`${wzActionEmoji(action)} ${verb}${qty} em *${items.length}* item(ns) (${scopeLabel})`);
  lines.push("");
  lines.push(`*Preview${fullList ? " completo" : " (top 5)"}:*`);
  for (let i = 0; i < previewLimit; i++) {
    const it = items[i];
    const cur = Number(it.current_stock);
    const proj = action === "in" ? cur + qty : action === "out" ? cur - qty : qty;
    lines.push(`• ${it.name}: ${fmtStockQty(cur, it.unit || "")} → ${fmtStockQty(proj, it.unit || "")}`);
  }
  if (items.length > previewLimit) lines.push(`… +${items.length - previewLimit} item(ns)`);

  const rows: InlineButton[][] = [
    [{ text: `✅ Aplicar em ${items.length} item(ns)`, callback_data: "wz|confirm" }],
  ];
  if (!fullList && items.length > 5) rows.push([{ text: "👁 Ver lista completa", callback_data: "wz|massview" }]);
  rows.push(wzNavRow({ back: true, home: true, cancel: true }));

  const history = wzPushHistory(currentStep, currentData);
  await wzSet(chatId, "awaiting_mass_review", { ...currentData, action, scope, qty, history });

  if (messageId !== undefined) await editTelegramMessage(chatId, messageId, lines.join("\n"), rows);
  else await sendTelegram(chatId, lines.join("\n"), rows);
}

// ─── Execução ───

async function wzExecuteSingle(action: WzAction, scope: Extract<WzScope, { kind: "single" }>, qty: number, waiter: string): Promise<{ text: string; previousStock: number; newStock: number }> {
  const movType = wzActionVerb(action);
  const previousStock = scope.currentStock;
  const { data, error } = await sb.rpc("apply_inventory_movement", {
    p_item_id: scope.itemId,
    p_type: movType,
    p_quantity: qty,
    p_note: `Telegram wizard (${waiter})`,
    p_source: "telegram",
  });
  if (error) throw new Error(error.message);
  const newStock = Number((data as any)?.new_stock ?? previousStock);
  const verb = action === "in" ? "Entrada" : action === "out" ? "Saída" : "Ajuste";
  let text = `✅ *Pronto*\n${wzActionEmoji(action)} ${scope.itemName}: ${fmtStockQty(previousStock, scope.unit)} → *${fmtStockQty(newStock, scope.unit)}*\nMovimento: ${verb} · Telegram (${waiter})`;
  if (newStock <= 0) text += `\n🚨 Item zerado!`;
  else if (scope.minStock > 0 && newStock <= scope.minStock) text += `\n⚠️ Atingiu o crítico (mín ${fmtStockQty(scope.minStock, scope.unit)})`;
  return { text, previousStock, newStock };
}

async function wzExecuteMass(action: WzAction, scope: WzScope, qty: number, waiter: string): Promise<string> {
  const movType = wzActionVerb(action);
  const items = await wzMassOpItems(scope);
  if (items.length === 0) return "❌ Nenhum item encontrado.";

  let success = 0;
  const failures: string[] = [];
  const lines: string[] = [];
  for (const it of items) {
    try {
      const { data, error } = await sb.rpc("apply_inventory_movement", {
        p_item_id: it.id,
        p_type: movType,
        p_quantity: qty,
        p_note: `Telegram wizard massa (${waiter})`,
        p_source: "telegram",
      });
      if (error) throw new Error(error.message);
      success++;
      const newStock = Number((data as any)?.new_stock ?? 0);
      if (lines.length < 15) lines.push(`• ${it.name}: ${fmtStockQty(newStock, it.unit || "")}`);
    } catch (e: any) {
      failures.push(`${it.name}: ${String(e?.message ?? e)}`);
    }
  }
  const verb = action === "in" ? "Entrada" : action === "out" ? "Saída" : "Ajuste";
  let text = `${wzActionEmoji(action)} ${verb} de *${qty}* aplicada em *${success}/${items.length}* item(ns).`;
  if (lines.length > 0) text += "\n\n" + lines.join("\n");
  if (success > 15) text += `\n... e mais ${success - 15} item(ns).`;
  if (failures.length > 0) text += `\n\n⚠️ Falhas (${failures.length}):\n` + failures.slice(0, 5).join("\n");
  return text;
}

// ─── Modo Carrinho ───

async function wzShowCart(chatId: number, messageId: number | undefined) {
  const state = await wzGet(chatId);
  const cart = state?.data.cart ?? [];

  if (cart.length === 0) {
    const text = `🧾 *Contagem (multi)*\n\nCarrinho vazio.\nAdicione itens pra fazer várias operações de uma vez (ex: contagem física semanal).`;
    const rows: InlineButton[][] = [
      [{ text: "➕ Adicionar item", callback_data: "wz|cart|addnew" }],
      [{ text: "🏠 Menu estoque", callback_data: "wz|home" }],
    ];
    await wzSet(chatId, "cart_main", { cart: [] });
    if (messageId !== undefined) await editTelegramMessage(chatId, messageId, text, rows);
    else await sendTelegram(chatId, text, rows);
    return;
  }

  const lines: string[] = [`🧾 *Contagem (multi)*`, `${cart.length} item(ns) no rascunho · ainda não aplicado`, ``];
  cart.slice(0, 20).forEach((c, i) => {
    const arrow = c.type === "in" ? "+" : c.type === "out" ? "-" : "→";
    lines.push(`${i + 1}. ${c.itemName}: ${fmtStockQty(c.previousStock, c.unit)} ${arrow}${fmtStockQty(c.qty, c.unit)} = *${fmtStockQty(c.projectedStock, c.unit)}*`);
  });
  if (cart.length > 20) lines.push(`… +${cart.length - 20} item(ns)`);

  const rows: InlineButton[][] = [
    [{ text: "➕ Adicionar item", callback_data: "wz|cart|addnew" }],
    [{ text: `✅ Aplicar todos (${cart.length})`, callback_data: "wz|cart|apply" }],
    [{ text: "🗑 Limpar", callback_data: "wz|cart|clear" }, { text: "🏠 Menu", callback_data: "wz|home" }],
    [{ text: "❌ Sair sem salvar", callback_data: "wz|cancel" }],
  ];

  await wzSet(chatId, "cart_main", { cart });
  if (messageId !== undefined) await editTelegramMessage(chatId, messageId, lines.join("\n"), rows);
  else await sendTelegram(chatId, lines.join("\n"), rows);
}

async function wzCartApply(chatId: number, messageId: number, waiter: string) {
  const state = await wzGet(chatId);
  const cart = state?.data.cart ?? [];
  if (cart.length === 0) {
    await editTelegramMessage(chatId, messageId, "Carrinho vazio.");
    return;
  }
  let success = 0;
  const failures: string[] = [];
  const resultLines: string[] = [];
  for (const c of cart) {
    try {
      const { data, error } = await sb.rpc("apply_inventory_movement", {
        p_item_id: c.itemId,
        p_type: c.type,
        p_quantity: c.qty,
        p_note: `Telegram carrinho (${waiter})`,
        p_source: "telegram",
      });
      if (error) throw new Error(error.message);
      success++;
      const newStock = Number((data as any)?.new_stock ?? 0);
      if (resultLines.length < 20) {
        const arrow = c.type === "in" ? "📥" : c.type === "out" ? "📤" : "✏️";
        resultLines.push(`${arrow} ${c.itemName}: ${fmtStockQty(c.previousStock, c.unit)} → ${fmtStockQty(newStock, c.unit)}`);
      }
    } catch (e: any) {
      failures.push(`${c.itemName}: ${String(e?.message ?? e)}`);
    }
  }
  await wzClear(chatId);
  let text = `✅ *Carrinho aplicado*\n${success}/${cart.length} operação(ões) com sucesso\n\n` + resultLines.join("\n");
  if (cart.length > 20) text += `\n... e mais ${cart.length - 20} operações.`;
  if (failures.length > 0) text += `\n\n⚠️ Falhas (${failures.length}):\n` + failures.slice(0, 5).join("\n");
  await editTelegramMessage(chatId, messageId, text, [[{ text: "🏠 Menu estoque", callback_data: "wz|home" }]]);
}

// ─── Triggers e roteamento ───

function wzIsTrigger(text: string): boolean {
  const t = normalize(text);
  return /^(?:gerenciar\s+estoque|menu\s+estoque|estoque\s+menu|wizard\s+estoque|estoque\s+(?:guiad[oa]|interativo)|abrir\s+estoque|controle\s+(?:de\s+)?estoque|me\s+ajuda\s+(?:com\s+)?(?:o\s+)?estoque|gerenciar|contagem|contagem\s+estoque|fazer\s+contagem)$/.test(t);
}

function wzIsBackOrCancelText(text: string): "back" | "cancel" | "menu" | null {
  const t = normalize(text).trim();
  if (/^\/?(cancelar|cancela|sair|fim)$/.test(t)) return "cancel";
  if (/^\/?(voltar|volta|atras)$/.test(t)) return "back";
  if (/^\/?(menu|home|inicio)$/.test(t)) return "menu";
  return null;
}

async function wzStartMenu(chatId: number, messageId?: number) {
  await wzMainMenuV2(chatId, messageId);
}

// Resolve: se step single sem item ainda → mostra picker; se item já tá → vai pra qty
async function wzPickActionAndAdvance(chatId: number, messageId: number | undefined, action: WzAction, currentStep: WzStep, currentData: WzData) {
  // Vai para item picker (Tela 2)
  await wzShowItemPicker(chatId, messageId, action, currentStep, currentData);
}

// Pop history e renderiza a tela anterior
async function wzGoBack(chatId: number, messageId: number, waiter: string): Promise<boolean> {
  const state = await wzGet(chatId);
  if (!state) return false;
  const hist = state.data.history ?? [];
  if (hist.length === 0) {
    await wzMainMenuV2(chatId, messageId);
    return true;
  }
  const prev = hist[hist.length - 1];
  const newHistory = hist.slice(0, -1);
  const newData: WzData = { ...prev.data, history: newHistory, cart: state.data.cart };

  // Re-renderiza a tela anterior usando os dados restaurados
  if (prev.step === "main_menu") {
    await wzMainMenuV2(chatId, messageId);
    return true;
  }
  if (prev.step === "awaiting_item" && newData.action) {
    await wzShowItemPicker(chatId, messageId, newData.action, "awaiting_item", { ...newData, history: newHistory });
    return true;
  }
  if (prev.step === "awaiting_scope" && newData.action) {
    await wzShowCategoryPicker(chatId, messageId, newData.action, "awaiting_scope", { ...newData, history: newHistory });
    return true;
  }
  if (prev.step === "awaiting_qty" && newData.action && newData.scope) {
    await wzAskQty(chatId, messageId, newData.action, newData.scope, "awaiting_qty", { ...newData, history: newHistory });
    return true;
  }
  if (prev.step === "awaiting_review" && newData.action && newData.scope?.kind === "single" && newData.qty !== undefined) {
    await wzShowReviewSingle(chatId, messageId, newData.action, newData.scope, newData.qty, "awaiting_review", { ...newData, history: newHistory });
    return true;
  }
  if (prev.step === "cart_main") {
    await wzShowCart(chatId, messageId);
    return true;
  }
  // fallback
  await wzMainMenuV2(chatId, messageId);
  return true;
}

// ─── Texto livre durante wizard ───

async function wzHandleTextInput(chatId: number, text: string, waiter: string): Promise<boolean> {
  const state = await wzGet(chatId);
  if (!state) return false;

  // Comandos universais de navegação
  const nav = wzIsBackOrCancelText(text);
  if (nav === "cancel") {
    const cart = state.data.cart ?? [];
    if (cart.length > 0) {
      await sendTelegram(chatId, `⚠️ Você tem ${cart.length} item(ns) no carrinho não aplicado(s). Use os botões ❌ Sair sem salvar pra confirmar.`);
      return true;
    }
    await wzClear(chatId);
    await sendTelegram(chatId, "❌ Cancelado.");
    return true;
  }
  if (nav === "menu") {
    await wzMainMenuV2(chatId);
    return true;
  }
  if (nav === "back") {
    // Sem messageId — manda novo
    const hist = state.data.history ?? [];
    if (hist.length === 0) await wzMainMenuV2(chatId);
    else {
      // re-emite o menu da tela anterior via "novo envio" — simplifica
      await wzMainMenuV2(chatId, undefined, "← (use os botões da última tela ou /menu)");
    }
    return true;
  }

  // Busca de item
  if (state.step === "awaiting_search" || state.step === "cart_adding_item") {
    const items = await wzSearchItems(text, 8);
    if (items.length === 0) {
      await sendTelegram(chatId, `❌ Não achei item com "${text.trim()}". Tente outro nome ou /cancelar.`);
      return true;
    }
    if (items.length === 1) {
      const it = items[0];
      const action = state.data.action!;
      const scope: WzScope = {
        kind: "single",
        itemId: it.id,
        itemName: it.name,
        unit: it.unit || "",
        currentStock: Number(it.current_stock),
        minStock: Number(it.min_stock),
        category: it.category,
      };
      const nextStep: WzStep = state.step === "cart_adding_item" ? "cart_adding_qty" : state.step;
      await wzAskQty(chatId, undefined, action, scope, nextStep, { ...state.data, scope });
      return true;
    }
    // múltiplos: lista pra escolher
    const rows: InlineButton[][] = items.map((it) => [{
      text: wzItemButtonLabel(it),
      callback_data: `wz|item|${it.id}`,
    }]);
    rows.push(wzNavRow({ back: true, home: true, cancel: true }));
    await sendTelegram(chatId, `🔍 Achei ${items.length} itens. Escolha:`, rows);
    return true;
  }

  // Quantidade digitada
  if (state.step === "awaiting_qty" || state.step === "awaiting_qty_text" || state.step === "cart_adding_qty") {
    // Aceita expressões: "+24", "-3", "=50", "12", "2.5"
    let s = text.trim().replace(",", ".");
    let prefix = "";
    if (s.startsWith("+") || s.startsWith("-") || s.startsWith("=")) {
      prefix = s[0];
      s = s.slice(1).trim();
    }
    const n = parseFloat(s);
    if (!Number.isFinite(n) || n < 0) {
      await sendTelegram(chatId, `❌ Valor inválido. Digite um número (ex: 10, 2.5, +24, =50).`);
      return true;
    }
    const action = state.data.action!;
    const scope = state.data.scope!;
    if (scope.kind === "single") {
      const isCart = state.step === "cart_adding_qty";
      if (isCart) {
        await wzAddToCart(chatId, undefined, action, scope, n, waiter);
      } else {
        await wzShowReviewSingle(chatId, undefined, action, scope, n, state.step, state.data);
      }
    } else {
      await wzShowMassReview(chatId, undefined, action, scope, n, state.step, state.data);
    }
    return true;
  }

  return false;
}

async function wzAddToCart(chatId: number, messageId: number | undefined, action: WzAction, scope: Extract<WzScope, { kind: "single" }>, qty: number, _waiter: string) {
  const state = await wzGet(chatId);
  const cart = [...(state?.data.cart ?? [])];
  const movType = wzActionVerb(action);
  const previousStock = scope.currentStock;
  const projected = action === "in" ? previousStock + qty : action === "out" ? previousStock - qty : qty;
  cart.push({
    itemId: scope.itemId,
    itemName: scope.itemName,
    unit: scope.unit,
    type: movType,
    qty,
    previousStock,
    projectedStock: projected,
  });
  await wzSet(chatId, "cart_main", { cart });
  await wzShowCart(chatId, messageId);
}

// ─── Callback principal ───

async function wzHandleCallback(cb: any, waiter: string): Promise<boolean> {
  const data: string | undefined = cb.data;
  const chatId: number | undefined = cb.message?.chat?.id;
  const messageId: number | undefined = cb.message?.message_id;
  const cbId: string = cb.id;
  if (!data || !data.startsWith("wz|") || chatId === undefined || messageId === undefined) return false;

  const parts = data.split("|");
  const op = parts[1];

  // ── Universais ──
  if (op === "cancel") {
    const state = await wzGet(chatId);
    const cart = state?.data.cart ?? [];
    await wzClear(chatId);
    await answerCallback(cbId, "Cancelado");
    const msg = cart.length > 0 ? `❌ Cancelado. (Carrinho com ${cart.length} item(ns) descartado.)` : "❌ Cancelado.";
    await editTelegramMessage(chatId, messageId, msg);
    return true;
  }

  if (op === "home") {
    await answerCallback(cbId);
    await wzMainMenuV2(chatId, messageId);
    return true;
  }

  if (op === "back") {
    await answerCallback(cbId);
    await wzGoBack(chatId, messageId, waiter);
    return true;
  }

  // ── Ações principais ──
  if (op === "act") {
    const a = parts[2];
    await answerCallback(cbId);
    if (a === "list") {
      await wzClear(chatId);
      const reply = await handleCommand({ kind: "STOCK_LIST" }, waiter);
      await editTelegramMessage(chatId, messageId, reply.text, [[{ text: "🏠 Menu estoque", callback_data: "wz|home" }]]);
      return true;
    }
    if (a === "crit") {
      await wzClear(chatId);
      const reply = await handleCommand({ kind: "STOCK_CRITICAL" }, waiter);
      await editTelegramMessage(chatId, messageId, reply.text, [[{ text: "🏠 Menu estoque", callback_data: "wz|home" }]]);
      return true;
    }
    if (a === "in" || a === "out" || a === "adj") {
      const state = await wzGet(chatId);
      await wzPickActionAndAdvance(chatId, messageId, a as WzAction, "main_menu", { cart: state?.data.cart });
      return true;
    }
  }

  // ── Buscar item (do menu principal) ──
  if (op === "search") {
    await answerCallback(cbId);
    const state = await wzGet(chatId);
    const action = state?.data.action;
    const isCart = state?.step === "cart_adding_item" || state?.step === "cart_main";
    const newStep: WzStep = isCart ? "cart_adding_item" : "awaiting_search";
    const history = wzPushHistory(state?.step ?? "main_menu", state?.data ?? {});
    await wzSet(chatId, newStep, { ...(state?.data ?? {}), action, history });
    await editTelegramMessage(chatId, messageId, `🔍 Digite parte do nome do item:`);
    return true;
  }

  // ── Categorias do menu principal (sem ação) ──
  if (op === "cats") {
    await answerCallback(cbId);
    const state = await wzGet(chatId);
    await wzShowCategoryPicker(chatId, messageId, state?.data.action, state?.step ?? "main_menu", state?.data ?? {});
    return true;
  }

  // ── Visualizar uma categoria (sem action) ──
  if (op === "catview") {
    await answerCallback(cbId);
    const cat = decodeURIComponent(parts[2] || "");
    const { data: items } = await sb.from("inventory_items")
      .select("id, name, current_stock, min_stock, unit")
      .eq("is_active", true).eq("category", cat)
      .order("name").limit(40);
    const arr = (items ?? []) as any[];
    if (arr.length === 0) {
      await editTelegramMessage(chatId, messageId, `📂 Categoria *${cat}* vazia.`, [wzNavRow({ back: true, home: true, cancel: true })]);
      return true;
    }
    const lines: string[] = [`📂 *${cat}* (${arr.length} item(ns))`, ``];
    for (const it of arr.slice(0, 30)) {
      const cur = Number(it.current_stock);
      const min = Number(it.min_stock);
      let icon = "📦";
      if (cur <= 0) icon = "🚨";
      else if (min > 0 && cur <= min) icon = "⚠️";
      lines.push(`${icon} ${it.name}: ${fmtStockQty(cur, it.unit || "")}`);
    }
    if (arr.length > 30) lines.push(`… +${arr.length - 30} item(ns)`);
    const rows: InlineButton[][] = arr.slice(0, 8).map((it) => [{ text: wzItemButtonLabel(it), callback_data: `wz|item|${it.id}` }]);
    rows.push(wzNavRow({ back: true, home: true, cancel: true }));
    await editTelegramMessage(chatId, messageId, lines.join("\n"), rows);
    return true;
  }

  // ── No-op (rótulos visuais) ──
  if (op === "noop") {
    await answerCallback(cbId);
    return true;
  }

  // ── Paginação da lista de itens ──
  if (op === "page") {
    await answerCallback(cbId);
    const page = parseInt(parts[2] || "0", 10) || 0;
    const state = await wzGet(chatId);
    const action = state?.data.action;
    if (!action) {
      await wzMainMenuV2(chatId, messageId);
      return true;
    }
    const prevHistory = state?.data.history ?? [];
    await wzShowItemPicker(chatId, messageId, action as WzAction, "awaiting_item", { ...(state?.data ?? {}), history: prevHistory.slice(0, -1) }, undefined, page);
    return true;
  }

  // ── Selecionar item da lista ──
  if (op === "item") {
    await answerCallback(cbId);
    const itemId = parts[2];
    const { data: it } = await sb.from("inventory_items")
      .select("id, name, unit, current_stock, min_stock, category")
      .eq("id", itemId).maybeSingle();
    if (!it) {
      await editTelegramMessage(chatId, messageId, "❌ Item não encontrado.", [wzNavRow({ back: true, home: true, cancel: true })]);
      return true;
    }
    const state = await wzGet(chatId);
    let action = state?.data.action;
    if (!action) {
      // sem action → pergunta agora
      const rows: InlineButton[][] = [
        [{ text: "📥 Entrada", callback_data: "wz|act|in" }, { text: "📤 Saída", callback_data: "wz|act|out" }],
        [{ text: "✏️ Ajuste", callback_data: "wz|act|adj" }],
        wzNavRow({ back: true, home: true, cancel: true }),
      ];
      const history = wzPushHistory(state?.step ?? "main_menu", state?.data ?? {});
      await wzSet(chatId, "awaiting_item", {
        ...(state?.data ?? {}),
        scope: { kind: "single", itemId: (it as any).id, itemName: (it as any).name, unit: (it as any).unit || "", currentStock: Number((it as any).current_stock), minStock: Number((it as any).min_stock), category: (it as any).category },
        history,
      });
      await editTelegramMessage(chatId, messageId, `📦 *${(it as any).name}*\nSaldo: ${fmtStockQty(Number((it as any).current_stock), (it as any).unit || "")}\n\nO que fazer?`, rows);
      return true;
    }
    const scope: WzScope = {
      kind: "single",
      itemId: (it as any).id,
      itemName: (it as any).name,
      unit: (it as any).unit || "",
      currentStock: Number((it as any).current_stock),
      minStock: Number((it as any).min_stock),
      category: (it as any).category,
    };
    const nextStep: WzStep = state?.step === "cart_adding_item" ? "cart_adding_qty" : "awaiting_qty";
    await wzAskQty(chatId, messageId, action, scope, nextStep === "cart_adding_qty" ? "cart_adding_item" : "awaiting_item", { ...(state?.data ?? {}), scope });
    return true;
  }

  // ── Escolha de escopo ──
  if (op === "scope") {
    const state = await wzGet(chatId);
    if (!state || !state.data.action) {
      await answerCallback(cbId, "Sessão expirada");
      await wzMainMenuV2(chatId, messageId);
      return true;
    }
    const sub = parts[2];
    if (sub === "all") {
      await answerCallback(cbId);
      await wzAskQty(chatId, messageId, state.data.action, { kind: "all" }, state.step, state.data);
      return true;
    }
    if (sub === "cat") {
      const cat = decodeURIComponent(parts[3] || "");
      await answerCallback(cbId);
      await wzAskQty(chatId, messageId, state.data.action, { kind: "category", category: cat }, state.step, state.data);
      return true;
    }
  }

  // ── Quantidade ──
  if (op === "qty") {
    const state = await wzGet(chatId);
    if (!state || !state.data.action || !state.data.scope) {
      await answerCallback(cbId, "Sessão expirada");
      await wzMainMenuV2(chatId, messageId);
      return true;
    }
    if (parts[2] === "other") {
      await answerCallback(cbId);
      await wzSet(chatId, "awaiting_qty_text", state.data);
      await editTelegramMessage(chatId, messageId, `✏️ Digite a quantidade (ex: 12, 2.5, +24, =50)\n_Você pode usar +N, -N ou =N para deixar claro o tipo._`);
      return true;
    }
    const n = parseFloat(parts[2]);
    if (!Number.isFinite(n) || n < 0) {
      await answerCallback(cbId, "Valor inválido");
      return true;
    }
    await answerCallback(cbId);
    if (state.data.scope.kind === "single") {
      const isCart = state.step === "cart_adding_qty";
      if (isCart) {
        await wzAddToCart(chatId, messageId, state.data.action, state.data.scope, n, waiter);
      } else {
        await wzShowReviewSingle(chatId, messageId, state.data.action, state.data.scope, n, state.step, state.data);
      }
    } else {
      await wzShowMassReview(chatId, messageId, state.data.action, state.data.scope, n, state.step, state.data);
    }
    return true;
  }

  // ── Confirmar (single ou massa) ──
  if (op === "confirm") {
    const state = await wzGet(chatId);
    if (!state || !state.data.action || !state.data.scope || state.data.qty === undefined) {
      await answerCallback(cbId, "Sessão expirada");
      await wzMainMenuV2(chatId, messageId);
      return true;
    }
    await answerCallback(cbId, "Aplicando...");
    if (state.data.scope.kind === "single") {
      try {
        const r = await wzExecuteSingle(state.data.action, state.data.scope, state.data.qty, waiter);
        // Registra undo
        const token = registerStockUndo({
          itemId: state.data.scope.itemId,
          itemName: state.data.scope.itemName,
          unit: state.data.scope.unit,
          type: wzActionVerb(state.data.action),
          qty: state.data.qty,
          previousStock: r.previousStock,
        });
        const cart = state.data.cart;
        await wzClear(chatId);
        // resultado acionável
        const rows: InlineButton[][] = [
          [{ text: "↩️ Desfazer (60s)", callback_data: `us|${token}` }],
          [{ text: "➕ Outra operação no item", callback_data: `wz|item|${state.data.scope.itemId}` }],
          [{ text: "🏠 Menu estoque", callback_data: "wz|home" }],
        ];
        if (cart && cart.length > 0) await wzSet(chatId, "main_menu", { cart });
        await editTelegramMessage(chatId, messageId, r.text, rows);
      } catch (e: any) {
        await editTelegramMessage(chatId, messageId, `❌ Erro: ${String(e?.message ?? e)}`, [[{ text: "🏠 Menu estoque", callback_data: "wz|home" }]]);
      }
      return true;
    }
    // Mass
    try {
      const text = await wzExecuteMass(state.data.action, state.data.scope, state.data.qty, waiter);
      const cart = state.data.cart;
      await wzClear(chatId);
      if (cart && cart.length > 0) await wzSet(chatId, "main_menu", { cart });
      await editTelegramMessage(chatId, messageId, text, [[{ text: "🏠 Menu estoque", callback_data: "wz|home" }]]);
    } catch (e: any) {
      await editTelegramMessage(chatId, messageId, `❌ Erro: ${String(e?.message ?? e)}`, [[{ text: "🏠 Menu estoque", callback_data: "wz|home" }]]);
    }
    return true;
  }

  // ── Confirmar e fazer outra (single) ──
  if (op === "repeat") {
    const state = await wzGet(chatId);
    if (!state || !state.data.action || state.data.scope?.kind !== "single" || state.data.qty === undefined) {
      await answerCallback(cbId, "Sessão expirada");
      return true;
    }
    await answerCallback(cbId, "Aplicando e abrindo nova...");
    try {
      await wzExecuteSingle(state.data.action, state.data.scope, state.data.qty, waiter);
    } catch (e: any) {
      await editTelegramMessage(chatId, messageId, `❌ Erro: ${String(e?.message ?? e)}`);
      return true;
    }
    const action = state.data.action;
    const cart = state.data.cart;
    await wzClear(chatId);
    if (cart) await wzSet(chatId, "main_menu", { cart });
    await wzShowItemPicker(chatId, messageId, action, "main_menu", { cart }, `✅ Aplicado. Escolha o próximo item:`);
    return true;
  }

  // ── Mass: ver lista completa ──
  if (op === "massview") {
    const state = await wzGet(chatId);
    if (!state || !state.data.action || !state.data.scope || state.data.qty === undefined) {
      await answerCallback(cbId, "Sessão expirada");
      return true;
    }
    await answerCallback(cbId);
    await wzShowMassReview(chatId, messageId, state.data.action, state.data.scope, state.data.qty, state.step, state.data, true);
    return true;
  }

  // ── Carrinho ──
  if (op === "cart") {
    const sub = parts[2];
    if (sub === "view") {
      await answerCallback(cbId);
      await wzShowCart(chatId, messageId);
      return true;
    }
    if (sub === "addnew") {
      await answerCallback(cbId);
      const state = await wzGet(chatId);
      const history = wzPushHistory("cart_main", state?.data ?? {});
      // Pergunta o tipo de operação primeiro
      const rows: InlineButton[][] = [
        [{ text: "📥 Entrada", callback_data: "wz|cart|setact|in" }, { text: "📤 Saída", callback_data: "wz|cart|setact|out" }],
        [{ text: "✏️ Ajuste", callback_data: "wz|cart|setact|adj" }],
        [{ text: "← Voltar ao carrinho", callback_data: "wz|cart|view" }, { text: "❌ Cancelar", callback_data: "wz|cancel" }],
      ];
      await wzSet(chatId, "cart_adding_item", { cart: state?.data.cart, history });
      await editTelegramMessage(chatId, messageId, `🧾 *Adicionar ao carrinho*\nQual tipo de operação?`, rows);
      return true;
    }
    if (sub === "setact") {
      const a = parts[3] as WzAction;
      await answerCallback(cbId);
      const state = await wzGet(chatId);
      const history = wzPushHistory("cart_adding_item", state?.data ?? {});
      await wzSet(chatId, "cart_adding_item", { ...(state?.data ?? {}), action: a, history });
      // Mostra picker
      await wzShowItemPicker(chatId, messageId, a, "cart_adding_item", { ...(state?.data ?? {}), action: a, history });
      return true;
    }
    if (sub === "add") {
      // Adicionar do review ao carrinho
      const state = await wzGet(chatId);
      if (!state || !state.data.action || state.data.scope?.kind !== "single" || state.data.qty === undefined) {
        await answerCallback(cbId, "Sessão expirada");
        return true;
      }
      await answerCallback(cbId, "Adicionado ao carrinho");
      await wzAddToCart(chatId, messageId, state.data.action, state.data.scope, state.data.qty, waiter);
      return true;
    }
    if (sub === "apply") {
      await answerCallback(cbId, "Aplicando carrinho...");
      await wzCartApply(chatId, messageId, waiter);
      return true;
    }
    if (sub === "clear") {
      await answerCallback(cbId, "Carrinho limpo");
      await wzSet(chatId, "main_menu", { cart: [] });
      await wzMainMenuV2(chatId, messageId, "🗑 Carrinho limpo.");
      return true;
    }
  }

  return false;
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
    let text: string | undefined = message?.text;
    const fromBot: boolean = message?.from?.is_bot === true;
    const username: string | undefined = message?.from?.username;
    const userId: number | undefined = message?.from?.id;
    const chatType: ChatType = message?.chat?.type;
    const updateId: number | undefined = update?.update_id;

    // Voice (microfone) → transcreve com Lovable AI e segue como texto.
    let voiceTranscript: string | null = null;
    const voiceFileId: string | undefined = message?.voice?.file_id;
    if (!fromBot && chatId && !text && voiceFileId) {
      // Whitelist antes de gastar transcrição
      const allowedEarly = await getAllowedChats();
      if (!allowedEarly || !allowedEarly.has(chatId)) {
        console.warn("Voice de chat não autorizado:", chatId);
        return testOrPlain();
      }
      // Dedupe antes de transcrever também
      if (typeof updateId === "number" && isDuplicate(updateId)) {
        return testOrPlain();
      }
      setTestContext(chatId);
      const transcribed = await transcribeTelegramVoice(voiceFileId);
      if (!transcribed) {
        await sendTelegram(chatId, "🎤 Não consegui entender o áudio. Tente falar mais claro ou mande por texto.");
        clearTestContext();
        return testOrPlain();
      }
      voiceTranscript = transcribed;
      text = transcribed;
    }

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
      await sendTelegram(chatId, "🔄 Vínculo removido.\n\n" + buildWaiterPickerMessage(names, username), buildWaiterPickerKeyboard(names));
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
        // Não bateu — mostra a lista clicável
        const names = await listWaiterNames();
        await sendTelegram(chatId, buildWaiterPickerMessage(names, username), buildWaiterPickerKeyboard(names));
        return testOrPlain();
      }
      waiter = bound;
    } else {
      waiter = username ? `Telegram (@${username})` : "Telegram";
    }

    // ─── WIZARD: gatilho explícito (estoque, gerenciar estoque, etc) ───
    if (wzIsTrigger(trimmed)) {
      await wzStartMenu(chatId);
      return testOrPlain();
    }
    // ─── WIZARD: input livre (qty digitada, nome de item, etc) ───
    if (await wzHandleTextInput(chatId, trimmed, waiter)) {
      return testOrPlain();
    }

    // Detecta modo preview
    let workingText = text;
    let isPreview = false;
    const rawLines = splitCommands(text);
    if (rawLines.length > 0 && /^preview\b/i.test(rawLines[0])) {
      isPreview = true;
      const firstRest = rawLines[0].replace(/^preview\b[:\s-]*/i, "").trim();
      const remaining = firstRest ? [firstRest, ...rawLines.slice(1)] : rawLines.slice(1);
      workingText = remaining.join("\n");
    }

    const lines = splitCommands(workingText);

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

      // Híbrido por confiança: se veio de áudio E é op de estoque (escrita), pede confirmação.
      if (voiceTranscript && parsed.kind === "STOCK_MOVEMENT") {
        const token = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
        await sb.from("telegram_chat_state").upsert({
          chat_id: chatId,
          step: "voice_confirm",
          data: { token, line: lines[0] ?? text, transcript: voiceTranscript, waiter },
          expires_at: new Date(Date.now() + 2 * 60_000).toISOString(),
        });
        const verb = parsed.type === "in" ? "Entrada" : parsed.type === "out" ? "Saída" : "Ajuste";
        const previewTxt =
          `🎤 Ouvi: "${voiceTranscript}"\n\n` +
          `🧾 Vou executar:\n• ${verb} de ${parsed.qty}${parsed.unit ? ` ${parsed.unit}` : ""} ${parsed.itemText}\n\nConfirmar?`;
        await sendTelegram(chatId, previewTxt, [[
          { text: "✅ Executar", callback_data: `vc|ok|${token}` },
          { text: "❌ Cancelar", callback_data: `vc|no|${token}` },
        ]]);
      } else {
        const cmd = await resolveWithContext(parsed, chatId, userId, chatType);
        const reply = await handleCommand(cmd, waiter);
        const prefix = voiceTranscript ? `🎤 Ouvi: "${voiceTranscript}"\n\n` : "";
        await sendTelegram(chatId, prefix + reply.text, reply.keyboard);
        if (reply.successTable) await setLastTable(chatId, reply.successTable, userId, chatType);
      }
      // Multi-comando: tenta consolidar ADD/REMOVE da mesma mesa em UMA impressão.
      // 1ª passada: parse + resolveContext + resolveProduct (sem mutação) por linha.
      type Slot =
        | { kind: "batchable"; line: string; table: string; op: BatchOp; cmdKind: "ADD" | "REMOVE"; fuzzyFrom?: string }
        | { kind: "standalone"; line: string; reply: HandlerReply };

      const slots: Slot[] = [];

      // Modo "operação herdada": se a 1ª linha estabelece um STOCK_MOVEMENT,
      // linhas seguintes que sozinhas não casam com nenhum verbo são tratadas
      // como continuação (mesma operação in/out/adjustment).
      let inheritedStockType: "in" | "out" | "adjustment" | null = null;

      for (const line of lines) {
        try {
          let parsed = parseCommand(line);

          if (parsed.kind === "PARSE_ERROR" && inheritedStockType) {
            const tail = parseStockTailLoose(line);
            if (tail) {
              parsed = {
                kind: "STOCK_MOVEMENT",
                type: inheritedStockType,
                qty: tail.qty,
                itemText: tail.itemText,
                unit: tail.unit,
              };
            }
          }

          if (parsed.kind === "STOCK_MOVEMENT") {
            inheritedStockType = parsed.type;
          }

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
