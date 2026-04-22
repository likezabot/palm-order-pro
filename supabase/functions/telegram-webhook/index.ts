// Telegram webhook: edição de pedidos por texto.
// Comandos: "mesa N + qty produto", "mesa N - qty produto", "mesa N ver pedido", "ajuda".

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

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
  | { kind: "ADD" | "REMOVE"; table: string; qty: number; productText: string }
  | { kind: "VIEW"; table: string }
  | { kind: "HELP" }
  | { kind: "PARSE_ERROR"; raw: string };

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

  // Operadores
  const ADD_OPS = ["+", "add", "adiciona", "adicionar", "coloca", "colocar", "poe", "manda", "mandar", "bota", "botar", "mais", "soma", "somar", "inclui", "incluir", "acrescenta", "acrescentar"];
  const REM_OPS = ["-", "remove", "remover", "tira", "tirar", "retira", "retirar", "cancela", "cancelar", "menos", "subtrai", "subtrair", "exclui", "excluir", "desconta", "descontar"];
  const ALL_OPS = [...ADD_OPS, ...REM_OPS];
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

  return { kind: "PARSE_ERROR", raw };
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

async function sendTelegram(chatId: number, text: string) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: chatId, text }),
    });
    if (!res.ok) console.error("sendMessage falhou:", res.status, await res.text());
  } catch (e) {
    console.error("sendTelegram erro:", e);
  }
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
  `💡 Aceita números por extenso (um, dois… até dez) e plural simples (cocas, bovinos, aguas).\n` +
  `Em caso de dúvida no produto, o bot pede para especificar.`;

// ─────────────────────────── handler ───────────────────────────

async function handleCommand(cmd: Command, waiter: string): Promise<string> {
  if (cmd.kind === "HELP") return HELP_TEXT;
  if (cmd.kind === "PARSE_ERROR") {
    return (
      `❓ Não consegui interpretar: "${cmd.raw}"\n\n` +
      `Faltou identificar mesa, ação ou produto. Exemplos:\n` +
      `  • mesa 3 + 2 coca 350\n` +
      `  • tira 1 agua da mesa 1\n\n` +
      `Envie "ajuda" para ver todos os formatos.`
    );
  }
  if (cmd.kind === "VIEW") return await executeView(cmd.table);

  // ADD/REMOVE
  const resolution = await resolveProduct(cmd.productText);
  switch (resolution.kind) {
    case "not_found": {
      const sugg = await suggestProducts(cmd.productText);
      const tail = sugg.length > 0
        ? `Talvez quis dizer: ${sugg.join(", ")}?\nRepita com o nome exato.`
        : `Verifique o nome no cardápio e tente de novo.`;
      return `❓ Não achei "${cmd.productText}" no cardápio.\n${tail}`;
    }
    case "ambiguous": {
      const list = resolution.candidates
        .map((p, i) => `  ${i + 1}) ${p.name}`)
        .join("\n");
      return (
        `🤔 Encontrei várias opções para "${cmd.productText}":\n${list}\n\n` +
        `Especifique o tamanho/variante e reenvie.`
      );
    }
    case "is_group_trigger": {
      const variants = resolution.variants.map((v) => `  • ${v}`).join("\n");
      return (
        `📦 "${resolution.group.name}" tem variantes:\n${variants}\n\n` +
        `Reenvie escolhendo uma das opções acima.`
      );
    }
    case "out_of_stock":
      return `❌ ${resolution.product.name} está marcado como esgotado.\nTente uma variante alternativa, se houver.`;
    case "no_linked_product":
      return `⚠️ "${resolution.itemName}" existe no estoque mas não está vinculado a nenhum produto do cardápio.`;
    case "found": {
      try {
        if (cmd.kind === "ADD") {
          return await executeAdd(cmd.table, resolution.product, cmd.qty, waiter);
        } else {
          return await executeRemove(cmd.table, resolution.product, cmd.qty, waiter);
        }
      } catch (e: any) {
        const msg = String(e?.message ?? e);
        if (msg.includes("version_conflict")) {
          return `⏳ Mesa ${cmd.table} está sendo editada agora. Aguarde 5s e reenvie.`;
        }
        console.error("execute error:", e);
        return `❌ Erro ao processar: ${msg}`;
      }
    }
  }
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
    const cmd = parseCommand(text);
    const reply = await handleCommand(cmd, waiter);
    await sendTelegram(chatId, reply);
  } catch (err) {
    console.error("Erro processando update:", err);
  }

  return new Response("ok", { status: 200, headers: corsHeaders });
});
