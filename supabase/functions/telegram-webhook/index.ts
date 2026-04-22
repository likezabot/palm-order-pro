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

// Dedupe (TTL 5min) para retries do Telegram.
const seenUpdates = new Map<number, number>();
function isDuplicate(updateId: number): boolean {
  const now = Date.now();
  for (const [k, t] of seenUpdates) if (now - t > 5 * 60_000) seenUpdates.delete(k);
  if (seenUpdates.has(updateId)) return true;
  seenUpdates.set(updateId, now);
  return false;
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

// ─────────────────────────── rate limit (best-effort, in-memory) ───────────────────────────
const RATE_WINDOW_MS = 60_000;
const RATE_MAX = 10;
const rateBuckets = new Map<number, number[]>();
const rateWarned = new Map<number, number>();
function checkRateLimit(chatId: number): boolean {
  const now = Date.now();
  const arr = (rateBuckets.get(chatId) ?? []).filter((t) => now - t < RATE_WINDOW_MS);
  arr.push(now);
  rateBuckets.set(chatId, arr);
  // Cleanup periódico
  if (rateBuckets.size > 200) {
    for (const [k, v] of rateBuckets) {
      const cleaned = v.filter((t) => now - t < RATE_WINDOW_MS);
      if (cleaned.length === 0) rateBuckets.delete(k);
      else rateBuckets.set(k, cleaned);
    }
  }
  return arr.length <= RATE_MAX;
}
function shouldSendRateWarning(chatId: number): boolean {
  const now = Date.now();
  const last = rateWarned.get(chatId) ?? 0;
  if (now - last < 10_000) return false;
  rateWarned.set(chatId, now);
  return true;
}

// ─────────────────────────── undo (60s, in-memory) ───────────────────────────
const UNDO_TTL_MS = 60_000;
type UndoOp = { op: "a" | "r"; productId: string; productName: string; qty: number };
type UndoToken = { chatId: number; table: string; ops: UndoOp[]; ts: number };
const pendingUndos = new Map<string, UndoToken>();
const consumedUndos = new Map<string, number>();

function cleanupUndos() {
  const now = Date.now();
  for (const [k, v] of pendingUndos) if (now - v.ts > UNDO_TTL_MS) pendingUndos.delete(k);
  for (const [k, t] of consumedUndos) if (now - t > UNDO_TTL_MS) consumedUndos.delete(k);
}
function genUndoToken(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}
function registerBatchUndo(chatId: number, table: string, ops: UndoOp[]): string {
  cleanupUndos();
  if (ops.length === 0) return "";
  const token = genUndoToken();
  pendingUndos.set(token, { chatId, table, ops, ts: Date.now() });
  return token;
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

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─────────────────────────── parser ───────────────────────────

type Command =
  | { kind: "ADD" | "REMOVE"; table: string; qty: number; productText: string; fromContext?: boolean }
  | { kind: "VIEW"; table: string; fromContext?: boolean }
  | { kind: "ADD_NOMESA" | "REMOVE_NOMESA"; qty: number; productText: string }
  | { kind: "VIEW_NOMESA" }
  | { kind: "NEEDS_TABLE"; originalKind: "ADD" | "REMOVE" | "VIEW" }
  | { kind: "HELP" }
  | { kind: "PARSE_ERROR"; raw: string };

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
};
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

  if (text === "/start" || text === "/help" || text === "ajuda" || text === "help") {
    return { kind: "HELP" };
  }

  // VIEW: "mesa N ver pedido" / "mesa N ver" / "mesa N pedido" / "ver [pedido] [da/na] mesa N"
  const viewA = text.match(/^mesa\s+(\d+)\s+(?:ver(?:\s+pedido)?|pedido)$/);
  if (viewA) return { kind: "VIEW", table: viewA[1] };
  const viewB = text.match(/^(?:ver(?:\s+pedido)?|pedido)\s+(?:da\s+|na\s+|do\s+|no\s+)?mesa\s+(\d+)$/);
  if (viewB) return { kind: "VIEW", table: viewB[1] };

  // VIEW natural: "mesa N <gatilho>", "<gatilho> mesa N", "como esta a mesa N", "quanto deu a mesa N" etc.
  // Só dispara se NÃO houver operador ADD/REMOVE nem padrão "<qty> <produto>".
  {
    const tableMatch = text.match(/\bmesa\s+(\d+)\b/);
    if (tableMatch) {
      const tokens = text.split(/\s+/);
      const hasViewToken = tokens.some((t) => VIEW_TOKENS.includes(t));
      const hasViewPhrase = VIEW_PHRASES.some((p) => text.includes(p));
      const hasOp = tokens.some((t) => ALL_OPS.includes(t)) || /[+\-]/.test(text);
      // qty <produto>: número (ou número por extenso) seguido de palavra que não seja "mesa"
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

  return { kind: "PARSE_ERROR", raw };
}

// ─────────────────────────── modo turbo: resolver contexto ───────────────────────────

async function resolveWithContext(cmd: Command, chatId: number): Promise<Command> {
  if (cmd.kind === "ADD_NOMESA" || cmd.kind === "REMOVE_NOMESA") {
    const table = await getLastTable(chatId);
    const originalKind = cmd.kind === "ADD_NOMESA" ? "ADD" : "REMOVE";
    if (!table) return { kind: "NEEDS_TABLE", originalKind };
    return { kind: originalKind, table, qty: cmd.qty, productText: cmd.productText, fromContext: true };
  }
  if (cmd.kind === "VIEW_NOMESA") {
    const table = await getLastTable(chatId);
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
  | { kind: "found"; product: Product }
  | { kind: "ambiguous"; candidates: Product[] }
  | { kind: "not_found" }
  | { kind: "is_group_trigger"; group: ProductGroup; variants: string[] }
  | { kind: "out_of_stock"; product: Product }
  | { kind: "no_linked_product"; itemName: string };

const sb = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

async function getAllowedChats(): Promise<Set<number> | null> {
  const { data } = await sb
    .from("settings")
    .select("value")
    .eq("key", "telegram_allowed_chats")
    .maybeSingle();
  if (!data?.value) return null; // null = whitelist não configurada (bloqueia tudo)
  try {
    const arr = JSON.parse(data.value);
    if (Array.isArray(arr)) return new Set(arr.map((x) => Number(x)));
  } catch {
    // CSV fallback
    return new Set(
      String(data.value)
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => !Number.isNaN(n)),
    );
  }
  return null;
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
async function suggestProducts(text: string): Promise<string[]> {
  const norm = singularize(normalize(text));
  const tokens = norm.split(/\s+/).filter((t) => t.length >= 3 && !/^\d+$/.test(t));
  if (tokens.length === 0) return [];
  const { data: prods } = await sb
    .from("products")
    .select("name")
    .eq("active", true);
  const all = (prods ?? []) as { name: string }[];
  return all
    .map((p) => {
      const n = normalize(p.name);
      const hits = tokens.reduce((acc, t) => acc + (n.includes(t) ? 1 : 0), 0);
      return { name: p.name, hits };
    })
    .filter((s) => s.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, 3)
    .map((s) => s.name);
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
          p_should_print: true,
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
      p_should_print: true,
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
      p_should_print: false,
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

// ─────────────────────────── telegram ───────────────────────────

type InlineButton = { text: string; callback_data: string };

async function sendTelegram(chatId: number, text: string, keyboard?: InlineButton[][]) {
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
      const tail = sugg.length > 0 ? ` Sugestões: ${sugg.join(", ")}.` : "";
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

function ctxPrefix(cmd: { fromContext?: boolean; table?: string }): string {
  return cmd.fromContext && cmd.table ? `📍 (mesa ${cmd.table}, contexto)\n` : "";
}

async function handleCommand(cmd: Command, waiter: string): Promise<HandlerReply> {
  if (cmd.kind === "HELP") return { text: HELP_TEXT };
  if (cmd.kind === "PARSE_ERROR") {
    return {
      text:
        `❓ Não consegui interpretar: "${cmd.raw}"\n\n` +
        `Faltou identificar mesa, ação ou produto. Exemplos:\n` +
        `  • mesa 3 + 2 coca 350\n` +
        `  • tira 1 agua da mesa 1\n\n` +
        `Envie "ajuda" para ver todos os formatos.`,
    };
  }
  if (cmd.kind === "NEEDS_TABLE") {
    return { text: NEEDS_TABLE_TEXT };
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
      const tail = sugg.length > 0
        ? `Talvez quis dizer: ${sugg.join(", ")}?\nRepita com o nome exato.`
        : `Verifique o nome no cardápio e tente de novo.`;
      return { text: prefix + `❓ Não achei "${cmd.productText}" no cardápio.\n${tail}` };
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
      return await runExecute(cmd, resolution.product, waiter);
  }
}

async function runExecute(
  cmd: Extract<Command, { kind: "ADD" | "REMOVE" }>,
  product: Product,
  waiter: string,
): Promise<HandlerReply> {
  const prefix = ctxPrefix(cmd);
  try {
    const text = cmd.kind === "ADD"
      ? await executeAdd(cmd.table, product, cmd.qty, waiter)
      : await executeRemove(cmd.table, product, cmd.qty, waiter);
    return { text: prefix + text, successTable: isMutationSuccess(cmd.kind, text) ? cmd.table : undefined };
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (msg.includes("version_conflict")) {
      return { text: prefix + `⏳ Mesa ${cmd.table} está sendo editada agora. Aguarde 5s e reenvie.` };
    }
    console.error("execute error:", e);
    return { text: prefix + `❌ Erro ao processar: ${msg}` };
  }
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
  if (success) await setLastTable(chatId, table);
  await editTelegramMessage(chatId, messageId, resultText);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (!TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN not configured");
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const update = await req.json();
    console.log("Update:", JSON.stringify(update));

    // Callback de botão inline
    if (update?.callback_query) {
      await handleCallbackQuery(update.callback_query);
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    const message = update?.message ?? update?.edited_message;
    const chatId: number | undefined = message?.chat?.id;
    const text: string | undefined = message?.text;
    const fromBot: boolean = message?.from?.is_bot === true;
    const username: string | undefined = message?.from?.username;
    const updateId: number | undefined = update?.update_id;

    if (fromBot || !chatId || !text) {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }
    if (typeof updateId === "number" && isDuplicate(updateId)) {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    // Whitelist
    const allowed = await getAllowedChats();
    if (!allowed || !allowed.has(chatId)) {
      console.warn("Chat não autorizado:", chatId);
      await sendTelegram(
        chatId,
        `🚫 Chat não autorizado.\nID deste chat: ${chatId}\n\nPeça ao admin para liberar em settings.telegram_allowed_chats.`,
      );
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    const waiter = username ? `Telegram (@${username})` : "Telegram";

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
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    if (lines.length > 10) {
      await sendTelegram(
        chatId,
        `⚠️ Máx. 10 comandos por mensagem. Você enviou ${lines.length}. Divida em mensagens menores.`,
      );
      return new Response("ok", { status: 200, headers: corsHeaders });
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
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    if (lines.length <= 1) {
      const parsed = parseCommand(lines[0] ?? text);
      const cmd = await resolveWithContext(parsed, chatId);
      const reply = await handleCommand(cmd, waiter);
      await sendTelegram(chatId, reply.text, reply.keyboard);
      if (reply.successTable) await setLastTable(chatId, reply.successTable);
    } else {
      // Multi-comando: separa textuais (consolidado) e ambíguos (1 mensagem cada)
      const textResults: string[] = [];
      const pendingChoices: HandlerReply[] = [];
      for (const line of lines) {
        try {
          const parsed = parseCommand(line);
          const cmd = await resolveWithContext(parsed, chatId);
          const reply = await handleCommand(cmd, waiter);
          if (reply.keyboard && reply.keyboard.length > 0) {
            pendingChoices.push(reply);
            textResults.push(`🤔 "${line}" → escolha abaixo.`);
          } else {
            textResults.push(reply.text);
          }
          // Atualiza contexto entre linhas para que a próxima linha possa usar mesa implícita
          if (reply.successTable) await setLastTable(chatId, reply.successTable);
        } catch (e) {
          console.error("line error:", line, e);
          textResults.push(`❌ "${line}": erro inesperado`);
        }
      }
      const header = `📊 ${lines.length} comandos processados:\n`;
      await sendTelegram(chatId, header + "\n" + textResults.join("\n\n"));
      // Mensagens separadas com botões
      for (const choice of pendingChoices) {
        await sendTelegram(chatId, choice.text, choice.keyboard);
      }
    }
  } catch (err) {
    console.error("Erro processando update:", err);
  }

  return new Response("ok", { status: 200, headers: corsHeaders });
});
