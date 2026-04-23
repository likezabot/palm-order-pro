// Suite abrangente de testes do parser do bot do Telegram.
// Garante que o parser:
//   1. Reconhece pedidos (ADD/REMOVE/VIEW) em variações de acentos, plural/singular,
//      ordem das palavras, números por extenso e operadores alternativos.
//   2. Reconhece movimentações de estoque (in/out/adjustment, esgotado, consulta, listar).
//   3. NÃO confunde comandos de pedido com comandos de estoque (e vice-versa).
//   4. Lida com visibilidade de produtos (PRODUCT_HIDE/SHOW/LIST).
//   5. Faz fuzzy match correto (singularização, acentos, ordem).
//
// Setup: stubba env vars antes de importar o handler (que tem Deno.serve no final
// e cria o supabase client no top level — passamos URL bobas para não falhar).
import "https://deno.land/std@0.224.0/dotenv/load.ts";
Deno.env.set("TELEGRAM_TEST_IMPORT", "1");
Deno.env.set("TELEGRAM_BOT_TOKEN", Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "test-token");
Deno.env.set("SUPABASE_URL", Deno.env.get("SUPABASE_URL") ?? Deno.env.get("VITE_SUPABASE_URL") ?? "http://localhost:54321");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "test-service-key");

import {
  parseCommand,
  splitCommands,
  normalize,
  singularize,
  singularizeToken,
  fuzzyFindProducts,
  type Command,
  type ProductRow,
} from "./index.ts";
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

const opts = { sanitizeOps: false, sanitizeResources: false };

// ─────────────── Helpers ───────────────
function expectAdd(input: string, table: string, qty: number, productSubstring: string) {
  const r = parseCommand(input) as Extract<Command, { kind: "ADD" }>;
  assertEquals(r.kind, "ADD", `[${input}] esperado ADD, recebido ${r.kind}`);
  assertEquals(r.table, table, `[${input}] mesa esperada ${table}, recebida ${r.table}`);
  assertEquals(r.qty, qty, `[${input}] qty esperada ${qty}, recebida ${r.qty}`);
  assert(
    normalize(r.productText).includes(normalize(productSubstring)),
    `[${input}] productText "${r.productText}" não contém "${productSubstring}"`,
  );
}
function expectRemove(input: string, table: string, qty: number, productSubstring: string) {
  const r = parseCommand(input) as Extract<Command, { kind: "REMOVE" }>;
  assertEquals(r.kind, "REMOVE", `[${input}] esperado REMOVE, recebido ${r.kind}`);
  assertEquals(r.table, table);
  assertEquals(r.qty, qty);
  assert(normalize(r.productText).includes(normalize(productSubstring)));
}
function expectKind(input: string, kind: Command["kind"]) {
  const r = parseCommand(input);
  assertEquals(r.kind, kind, `[${input}] esperado ${kind}, recebido ${r.kind}`);
}
function expectStock(
  input: string,
  type: "in" | "out" | "adjustment",
  qty: number,
  itemSubstring: string,
) {
  const r = parseCommand(input) as Extract<Command, { kind: "STOCK_MOVEMENT" }>;
  assertEquals(r.kind, "STOCK_MOVEMENT", `[${input}] esperado STOCK_MOVEMENT, recebido ${r.kind}`);
  assertEquals(r.type, type, `[${input}] type esperado ${type}, recebido ${r.type}`);
  assertEquals(r.qty, qty);
  assert(
    normalize(r.itemText).includes(normalize(itemSubstring)),
    `[${input}] itemText "${r.itemText}" não contém "${itemSubstring}"`,
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
//  GRUPO 1 — ADD: variações de acentos, plural, ordem (15+ casos)
// ═══════════════════════════════════════════════════════════════════════════════
Deno.test("ADD: forma canônica com dígitos", opts, () => {
  expectAdd("mesa 5 + 2 coca", "5", 2, "coca");
  expectAdd("mesa 12 mais 3 guarana", "12", 3, "guarana");
  expectAdd("mesa 1 adiciona 1 skol", "1", 1, "skol");
});

Deno.test("ADD: número por extenso", opts, () => {
  expectAdd("mesa 5 mais um coca", "5", 1, "coca");
  expectAdd("mesa 7 mais duas cervejas", "7", 2, "cerveja"); // "cervejas" → singularizado depois; aqui só verificamos substring
  expectAdd("mesa 3 + tres espetos", "3", 3, "espeto");
});

Deno.test("ADD: acentos opcionais (entrada com acento ou sem)", opts, () => {
  expectAdd("mesa 4 + 1 guaraná", "4", 1, "guarana");
  expectAdd("mesa 4 + 1 guarana", "4", 1, "guarana");
  expectAdd("mesa 2 + 1 caipirinha de limão", "2", 1, "caipirinha");
  expectAdd("mesa 2 + 1 caipirinha de limao", "2", 1, "caipirinha");
});

Deno.test("ADD: operadores alternativos (manda, bota, poe, soma, inclui)", opts, () => {
  expectAdd("mesa 8 manda 2 coca", "8", 2, "coca");
  expectAdd("mesa 8 bota uma agua", "8", 1, "agua");
  expectAdd("mesa 8 poe 1 skol", "8", 1, "skol");
  expectAdd("mesa 8 soma 3 cervejas", "8", 3, "cerveja");
  expectAdd("mesa 8 inclui 1 espeto", "8", 1, "espeto");
});

Deno.test("ADD: gírias de bar (lança, joga, marca, anota, registra, pede)", opts, () => {
  // Caso real do usuário: áudio "lança um medalhão na mesa 2"
  expectAdd("lanca um medalhao na mesa 2", "2", 1, "medalhao");
  expectAdd("lança um medalhão na mesa 2", "2", 1, "medalh");
  expectAdd("joga 2 coca na mesa 5", "5", 2, "coca");
  expectAdd("mesa 7 marca 1 espeto", "7", 1, "espeto");
  expectAdd("mesa 3 anota 2 cervejas", "3", 2, "cerveja");
  expectAdd("registra 1 skol pra mesa 9", "9", 1, "skol");
  expectAdd("mesa 4 pede 1 agua", "4", 1, "agua");
});

Deno.test("ADD: forma 2 — '<op> qty produto na mesa N'", opts, () => {
  expectAdd("manda 2 coca na mesa 9", "9", 2, "coca");
  // Nota: usar palavra ("mais") em vez de "+" no início, pois "+ N ..." prioriza
  // STOCK_MOVEMENT (entrada de estoque). Isso é intencional para suportar "+ 10 coca".
  expectAdd("mais 1 guarana pra mesa 10", "10", 1, "guarana");
  expectAdd("adiciona 3 espetos para mesa 11", "11", 3, "espeto");
});

Deno.test("ADD: forma 3 — '<op> qty produto mesa N' (sem preposição)", opts, () => {
  expectAdd("mais 2 coca mesa 5", "5", 2, "coca");
  expectAdd("manda 1 skol mesa 6", "6", 1, "skol");
});

Deno.test("ADD: produtos compostos com várias palavras", opts, () => {
  expectAdd("mesa 5 + 1 coca cola 350", "5", 1, "coca cola");
  expectAdd("mesa 7 mais 2 cerveja brahma 600ml", "7", 2, "cerveja brahma");
  expectAdd("mesa 9 + 1 espeto de frango com queijo", "9", 1, "espeto");
});

Deno.test("ADD: operador colado em dígito (+2 sem espaço)", opts, () => {
  expectAdd("mesa 5 +2 coca", "5", 2, "coca");
  expectAdd("mesa 5+2 coca", "5", 2, "coca");
});

Deno.test("ADD: qty default 1 quando produto sem número na frente", opts, () => {
  expectAdd("mesa 5 + coca", "5", 1, "coca");
  expectAdd("mesa 5 mais agua", "5", 1, "agua");
});

// ═══════════════════════════════════════════════════════════════════════════════
//  GRUPO 2 — REMOVE: variações
// ═══════════════════════════════════════════════════════════════════════════════
Deno.test("REMOVE: forma canônica e operadores alternativos", opts, () => {
  expectRemove("mesa 5 - 1 coca", "5", 1, "coca");
  expectRemove("mesa 5 tira 2 coca", "5", 2, "coca");
  expectRemove("mesa 5 menos uma coca", "5", 1, "coca");
  expectRemove("mesa 5 cancela 1 espeto", "5", 1, "espeto");
  expectRemove("mesa 5 retira 3 cervejas", "5", 3, "cerveja");
  expectRemove("mesa 5 desconta 1 agua", "5", 1, "agua");
});

Deno.test("REMOVE: forma 2 — 'tira X da mesa N'", opts, () => {
  expectRemove("tira 2 coca da mesa 9", "9", 2, "coca");
  expectRemove("- 1 guarana mesa 10", "10", 1, "guarana");
  expectRemove("remove 1 skol da mesa 11", "11", 1, "skol");
});

// ═══════════════════════════════════════════════════════════════════════════════
//  GRUPO 3 — VIEW / SET_TABLE / TABLE_STATUS
// ═══════════════════════════════════════════════════════════════════════════════
Deno.test("VIEW: variações", opts, () => {
  expectKind("mesa 5 ver pedido", "VIEW");
  expectKind("ver pedido da mesa 5", "VIEW");
  expectKind("mesa 5 consumo", "VIEW");
  expectKind("mesa 5 o que tem", "VIEW");
  expectKind("ver mesa 5", "VIEW");
});

Deno.test("SET_TABLE: 'mesa N' sozinho e variantes", opts, () => {
  expectKind("mesa 5", "SET_TABLE");
  expectKind("mesa cinco", "SET_TABLE");
  expectKind("mesa vinte e um", "SET_TABLE");
  expectKind("vou pra mesa 7", "SET_TABLE");
  expectKind("pegando mesa 3", "SET_TABLE");
});

Deno.test("TABLE_STATUS: status com extenso", opts, () => {
  expectKind("mesa 5 status", "TABLE_STATUS");
  expectKind("status mesa 5", "TABLE_STATUS");
  expectKind("status da mesa cinco", "TABLE_STATUS");
  expectKind("situacao mesa 3", "TABLE_STATUS");
});

// ═══════════════════════════════════════════════════════════════════════════════
//  GRUPO 4 — ESTOQUE: NÃO confundir com pedido
// ═══════════════════════════════════════════════════════════════════════════════
Deno.test("STOCK in: variações de acentos e verbos", opts, () => {
  expectStock("entrada 10 coca", "in", 10, "coca");
  expectStock("entrou 5 cerveja", "in", 5, "cerveja");
  expectStock("recebi 20 guarana", "in", 20, "guarana");
  expectStock("chegou 15 skol", "in", 15, "skol");
  expectStock("comprei 8 picanha", "in", 8, "picanha");
  expectStock("repor 3 agua", "in", 3, "agua");
  expectStock("abasteci 12 medalhão", "in", 12, "medalhao");
  expectStock("+ 10 coca", "in", 10, "coca");
});

Deno.test("STOCK out: 'usei', 'vendi', 'quebrou'", opts, () => {
  expectStock("usei 2 picanha", "out", 2, "picanha");
  expectStock("vendi 5 coca", "out", 5, "coca");
  expectStock("quebrou 1 cerveja", "out", 1, "cerveja");
  expectStock("descartei 3 medalhao", "out", 3, "medalhao");
  expectStock("perdi 1 guarana", "out", 1, "guarana");
});

Deno.test("STOCK adjustment: 'tem N X', 'ajuste X N', 'contei X N'", opts, () => {
  expectStock("ajuste coca 50", "adjustment", 50, "coca");
  expectStock("setar coca para 30", "adjustment", 30, "coca");
  expectStock("contei picanha 12", "adjustment", 12, "picanha");
  expectStock("marca cerveja 24", "adjustment", 24, "cerveja");
  expectStock("tem 12 coca", "adjustment", 12, "coca");
  expectStock("tem 5 picanha", "adjustment", 5, "picanha");
});

Deno.test("STOCK_OUT_NOW: 'acabou X', 'sem X', 'terminou X'", opts, () => {
  expectKind("acabou coca", "STOCK_OUT_NOW");
  expectKind("acabou a coca", "STOCK_OUT_NOW");
  expectKind("terminou guarana", "STOCK_OUT_NOW");
  expectKind("zerou skol", "STOCK_OUT_NOW");
  expectKind("nao tem mais agua", "STOCK_OUT_NOW");
  expectKind("não tem mais agua", "STOCK_OUT_NOW");
  expectKind("sem cerveja", "STOCK_OUT_NOW");
});

Deno.test("STOCK_QUERY: consultas", opts, () => {
  expectKind("estoque coca", "STOCK_QUERY");
  expectKind("saldo picanha", "STOCK_QUERY");
  expectKind("quanto tem de guarana", "STOCK_QUERY");
  expectKind("quantidade de skol", "STOCK_QUERY");
  expectKind("ver estoque coca", "STOCK_QUERY");
  expectKind("tem coca?", "STOCK_QUERY");
});

Deno.test("STOCK_LIST e STOCK_CRITICAL", opts, () => {
  expectKind("lista estoque", "STOCK_LIST");
  expectKind("inventario", "STOCK_LIST");
  expectKind("estoque completo", "STOCK_LIST");
  expectKind("estoque", "STOCK_CRITICAL");
  expectKind("criticos", "STOCK_CRITICAL");
  expectKind("alertas", "STOCK_CRITICAL");
  expectKind("o que ta acabando", "STOCK_CRITICAL");
});

// ═══════════════════════════════════════════════════════════════════════════════
//  GRUPO 5 — Anti-conflito: estoque NÃO vira pedido e vice-versa
// ═══════════════════════════════════════════════════════════════════════════════
Deno.test("ANTI-CONFLITO: 'mesa N' não dispara stock", opts, () => {
  // "mesa 5 + 2 coca" deve ser ADD, jamais STOCK.
  const r = parseCommand("mesa 5 + 2 coca");
  assertEquals(r.kind, "ADD");
});

Deno.test("ANTI-CONFLITO: 'tirei 2 coca' (estoque) não vira REMOVE de pedido", opts, () => {
  // "tirei" é verbo de estoque (out). Sem "mesa N", não pode virar REMOVE_NOMESA.
  const r = parseCommand("tirei 2 coca");
  assertEquals(r.kind, "STOCK_MOVEMENT");
  if (r.kind === "STOCK_MOVEMENT") assertEquals(r.type, "out");
});

Deno.test("ANTI-CONFLITO: 'usei 2 picanha' não vira ADD/REMOVE", opts, () => {
  const r = parseCommand("usei 2 picanha");
  assertEquals(r.kind, "STOCK_MOVEMENT");
});

Deno.test("ANTI-CONFLITO: 'mais 2 coca' SEM mesa vira ADD_NOMESA (não estoque)", opts, () => {
  const r = parseCommand("mais 2 coca");
  assertEquals(r.kind, "ADD_NOMESA");
});

Deno.test("ANTI-CONFLITO: 'tira 1 coca' SEM mesa vira REMOVE_NOMESA (não stock out)", opts, () => {
  // "tira" é REM_OPS de pedido — vai para REMOVE_NOMESA.
  const r = parseCommand("tira 1 coca");
  assertEquals(r.kind, "REMOVE_NOMESA");
});

Deno.test("ANTI-CONFLITO: 'tirar X do cardapio' vira PRODUCT_HIDE, não REMOVE", opts, () => {
  const r = parseCommand("tirar coca do cardapio");
  assertEquals(r.kind, "PRODUCT_HIDE");
});

Deno.test("ANTI-CONFLITO: 'acabou coca' (sem qty) é STOCK_OUT_NOW, não erro", opts, () => {
  expectKind("acabou coca", "STOCK_OUT_NOW");
});

Deno.test("ANTI-CONFLITO: 'estoque coca' é QUERY, não LIST", opts, () => {
  expectKind("estoque coca", "STOCK_QUERY");
  expectKind("estoque", "STOCK_CRITICAL"); // sem argumento → críticos
});

Deno.test("ANTI-CONFLITO: 'mesa 5' sozinho é SET_TABLE, não VIEW", opts, () => {
  expectKind("mesa 5", "SET_TABLE");
});

Deno.test("ANTI-CONFLITO: 'ajuste coca 50' é adjustment, não ADD/REMOVE", opts, () => {
  const r = parseCommand("ajuste coca 50");
  assertEquals(r.kind, "STOCK_MOVEMENT");
  if (r.kind === "STOCK_MOVEMENT") assertEquals(r.type, "adjustment");
});

// ═══════════════════════════════════════════════════════════════════════════════
//  GRUPO 6 — Visibilidade de produtos
// ═══════════════════════════════════════════════════════════════════════════════
Deno.test("PRODUCT_HIDE: variações", opts, () => {
  expectKind("ocultar coca", "PRODUCT_HIDE");
  expectKind("oculta coca", "PRODUCT_HIDE");
  expectKind("esconder a coca", "PRODUCT_HIDE");
  expectKind("desativar guarana", "PRODUCT_HIDE");
  expectKind("inativar skol", "PRODUCT_HIDE");
  expectKind("tirar coca do cardapio", "PRODUCT_HIDE");
  expectKind("remover guarana de cardapio", "PRODUCT_HIDE");
});

Deno.test("PRODUCT_SHOW: variações", opts, () => {
  expectKind("mostrar coca", "PRODUCT_SHOW");
  expectKind("ativar coca", "PRODUCT_SHOW");
  expectKind("exibir guarana", "PRODUCT_SHOW");
  expectKind("habilitar skol", "PRODUCT_SHOW");
  expectKind("colocar coca no cardapio", "PRODUCT_SHOW");
  expectKind("voltar guarana ao cardapio", "PRODUCT_SHOW");
  expectKind("botar skol no cardapio", "PRODUCT_SHOW");
});

Deno.test("PRODUCT_LIST: hidden e visible", opts, () => {
  const h = parseCommand("listar ocultos") as Extract<Command, { kind: "PRODUCT_LIST" }>;
  assertEquals(h.kind, "PRODUCT_LIST");
  assertEquals(h.mode, "hidden");
  const v = parseCommand("listar visiveis") as Extract<Command, { kind: "PRODUCT_LIST" }>;
  assertEquals(v.kind, "PRODUCT_LIST");
  assertEquals(v.mode, "visible");
  const v2 = parseCommand("listar cardapio") as Extract<Command, { kind: "PRODUCT_LIST" }>;
  assertEquals(v2.mode, "visible");
});

Deno.test("PRODUCT_PICK: dígito 1-9 isolado", opts, () => {
  for (let i = 1; i <= 9; i++) {
    const r = parseCommand(String(i)) as Extract<Command, { kind: "PRODUCT_PICK" }>;
    assertEquals(r.kind, "PRODUCT_PICK");
    assertEquals(r.choice, i);
  }
});

// ═══════════════════════════════════════════════════════════════════════════════
//  GRUPO 7 — Singularização e normalização
// ═══════════════════════════════════════════════════════════════════════════════
Deno.test("normalize: remove acentos e ajusta espaços", opts, () => {
  assertEquals(normalize("Guaraná"), "guarana");
  assertEquals(normalize("MEDALHÃO"), "medalhao");
  assertEquals(normalize("mesa  5  +  2  coca"), "mesa 5 + 2 coca");
  assertEquals(normalize("mesa 5+2 coca"), "mesa 5 + 2 coca");
});

Deno.test("singularize: regras de plural pt-BR", opts, () => {
  assertEquals(singularizeToken("medalhoes"), "medalhao");
  assertEquals(singularizeToken("pasteis"), "pastel");
  assertEquals(singularizeToken("animais"), "animal");
  assertEquals(singularizeToken("garagens"), "garagem");
  assertEquals(singularizeToken("colheres"), "colher");
  assertEquals(singularizeToken("cervejas"), "cerveja");
  assertEquals(singularizeToken("espetos"), "espeto");
  assertEquals(singularizeToken("bois"), "boi"); // whitelist
  // Preserva dígitos/curtos
  assertEquals(singularizeToken("350"), "350");
  assertEquals(singularizeToken("2l"), "2l");
  assertEquals(singularizeToken("gas"), "gas"); // ≤3 chars
});

Deno.test("singularize: frase inteira", opts, () => {
  // Notas:
  //   - "duas" termina em "as" → regra [aeiou]s$ remove o 's' → "dua".
  //   - "tres" termina em "res" → regra (res|zes|ses)$ slice -2 → "tr".
  // Ambos são side effects conhecidos das regras gerais (cervejas→cerveja, colheres→colher).
  // O fuzzy compensa via match por tokens individuais do nome do produto.
  assertEquals(singularize("duas cervejas brahma"), "dua cerveja brahma");
  assertEquals(singularize("tres medalhoes"), "tr medalhao");
});

// ═══════════════════════════════════════════════════════════════════════════════
//  GRUPO 8 — fuzzyFindProducts
// ═══════════════════════════════════════════════════════════════════════════════
const SAMPLE_PRODUCTS: ProductRow[] = [
  { id: "1", name: "Coca Cola 350ml", category: "bebidas", active: true },
  { id: "2", name: "Coca Cola 600ml", category: "bebidas", active: true },
  { id: "3", name: "Guaraná Antarctica 350ml", category: "bebidas", active: true },
  { id: "4", name: "Cerveja Skol 350ml", category: "cervejas", active: true },
  { id: "5", name: "Cerveja Brahma 600ml", category: "cervejas", active: true },
  { id: "6", name: "Espeto de Picanha", category: "espetos", active: true },
  { id: "7", name: "Espeto de Frango", category: "espetos", active: true },
  { id: "8", name: "Medalhão de Filé", category: "espetos", active: true },
];

Deno.test("fuzzy: match exato com acento", opts, () => {
  const r = fuzzyFindProducts("guarana", SAMPLE_PRODUCTS);
  assert(r.length >= 1);
  assertEquals(r[0].id, "3");
});

Deno.test("fuzzy: query parcial retorna todos os matches (coca → 2)", opts, () => {
  const r = fuzzyFindProducts("coca", SAMPLE_PRODUCTS);
  assertEquals(r.length, 2);
  assert(r.every((p) => p.name.toLowerCase().includes("coca")));
});

Deno.test("fuzzy: 'cerveja' retorna ambas Skol e Brahma (ambíguo)", opts, () => {
  const r = fuzzyFindProducts("cerveja", SAMPLE_PRODUCTS);
  assertEquals(r.length, 2);
});

Deno.test("fuzzy: plural funciona ('espetos' → 2 espetos)", opts, () => {
  const r = fuzzyFindProducts("espetos", SAMPLE_PRODUCTS);
  assertEquals(r.length, 2);
});

Deno.test("fuzzy: sem acento encontra com acento ('medalhao' → Medalhão)", opts, () => {
  const r = fuzzyFindProducts("medalhao", SAMPLE_PRODUCTS);
  assert(r.length >= 1);
  assertEquals(r[0].id, "8");
});

Deno.test("fuzzy: typo leve via Levenshtein ('guarna' → Guaraná)", opts, () => {
  // Levenshtein limit = max(1, floor(len/4)). Para "guarna" (6 chars) → limit 1.
  // 'guarna' ↔ 'guarana' = 1 edição (insert 'a'), passa.
  const r = fuzzyFindProducts("guarna", SAMPLE_PRODUCTS);
  assert(r.length >= 1, "deveria achar Guaraná com typo de 1 char");
  assertEquals(r[0].id, "3");
});

Deno.test("fuzzy: query vazia retorna nada", opts, () => {
  assertEquals(fuzzyFindProducts("", SAMPLE_PRODUCTS).length, 0);
  assertEquals(fuzzyFindProducts("   ", SAMPLE_PRODUCTS).length, 0);
});

// ═══════════════════════════════════════════════════════════════════════════════
//  GRUPO 9 — Apelidos (aliases) no fuzzy matching
// ═══════════════════════════════════════════════════════════════════════════════
const ALIAS_PRODUCTS: ProductRow[] = [
  { id: "a1", name: "Coca-Cola Zero 350ml", category: "bebidas", active: true, aliases: ["coca zero", "zero", "ks zero"] },
  { id: "a2", name: "Coca-Cola 350ml", category: "bebidas", active: true, aliases: ["coca", "ks"] },
  { id: "a3", name: "Heineken 600ml", category: "cervejas", active: true, aliases: ["heineken longneck"] },
  { id: "a4", name: "Caipirinha de Limão", category: "bebidas", active: true, aliases: ["caipira"] },
  { id: "a5", name: "Caipirinha de Morango", category: "bebidas", active: true, aliases: ["caipira"] },
];

Deno.test("alias: 'coca zero' resolve para Coca-Cola Zero direto", opts, () => {
  const r = fuzzyFindProducts("coca zero", ALIAS_PRODUCTS);
  assert(r.length >= 1);
  assertEquals(r[0].id, "a1");
});

Deno.test("alias: apelido sem acento bate ('caipira' → 2 ambíguo)", opts, () => {
  const r = fuzzyFindProducts("caipira", ALIAS_PRODUCTS);
  assertEquals(r.length, 2);
  const ids = r.map((p) => p.id).sort();
  assertEquals(ids, ["a4", "a5"]);
});

Deno.test("alias: plural funciona ('zeros' singulariza para 'zero')", opts, () => {
  const r = fuzzyFindProducts("zeros", ALIAS_PRODUCTS);
  assert(r.length >= 1, "deveria achar Coca-Cola Zero via alias 'zero'");
  assertEquals(r[0].id, "a1");
});

Deno.test("alias: alias exato vence inclusão por nome ('coca' → a2 primeiro)", opts, () => {
  const r = fuzzyFindProducts("coca", ALIAS_PRODUCTS);
  assert(r.length >= 2);
  assertEquals(r[0].id, "a2");
});

Deno.test("alias: ambíguo quando 2 produtos compartilham apelido", opts, () => {
  const r = fuzzyFindProducts("caipira", ALIAS_PRODUCTS);
  assert(r.length === 2, `esperado 2 matches ambíguos, recebido ${r.length}`);
});

Deno.test("alias: produtos sem apelidos continuam funcionando como antes", opts, () => {
  const r = fuzzyFindProducts("guarana", SAMPLE_PRODUCTS);
  assert(r.length >= 1);
  assertEquals(r[0].id, "3");
});

// ═══════════════════════════════════════════════════════════════════════════════
//  GRUPO 9 — splitCommands (multi-comando)
// ═══════════════════════════════════════════════════════════════════════════════
Deno.test("split: separadores explícitos (\\n, ;, //, |)", opts, () => {
  assertEquals(splitCommands("mesa 5 + 1 coca\nmesa 7 + 2 skol"), [
    "mesa 5 + 1 coca",
    "mesa 7 + 2 skol",
  ]);
  assertEquals(splitCommands("mesa 5 + 1 coca; mesa 7 + 2 skol"), [
    "mesa 5 + 1 coca",
    "mesa 7 + 2 skol",
  ]);
  assertEquals(splitCommands("mesa 5 + 1 coca // mesa 7 + 2 skol"), [
    "mesa 5 + 1 coca",
    "mesa 7 + 2 skol",
  ]);
  assertEquals(splitCommands("mesa 5 + 1 coca | mesa 7 + 2 skol"), [
    "mesa 5 + 1 coca",
    "mesa 7 + 2 skol",
  ]);
});

Deno.test("split: split conservador por 'mesa N' só se ambos lados têm ação", opts, () => {
  // Ambos lados têm ação → split.
  assertEquals(splitCommands("mesa 5 + 1 coca mesa 7 + 2 skol"), [
    "mesa 5 + 1 coca",
    "mesa 7 + 2 skol",
  ]);
  // Só um lado tem ação → mantém junto.
  assertEquals(splitCommands("mesa 5 + 1 coca mesa 7"), ["mesa 5 + 1 coca mesa 7"]);
});

Deno.test("split: comando único permanece único", opts, () => {
  assertEquals(splitCommands("mesa 5 + 2 coca"), ["mesa 5 + 2 coca"]);
  assertEquals(splitCommands(""), []);
});

// ═══════════════════════════════════════════════════════════════════════════════
//  GRUPO 10 — Comandos meta (HELP / UNDO / REPORT)
// ═══════════════════════════════════════════════════════════════════════════════
Deno.test("HELP: variações de saudação e pedido de ajuda", opts, () => {
  expectKind("/start", "HELP");
  expectKind("/help", "HELP");
  expectKind("ajuda", "HELP");
  expectKind("oi", "HELP");
  expectKind("ola", "HELP");
  expectKind("bom dia", "HELP");
  expectKind("comandos", "HELP");
  expectKind("?", "HELP");
});

Deno.test("UNDO: variações", opts, () => {
  expectKind("undo", "UNDO");
  expectKind("desfazer", "UNDO");
  expectKind("errei", "UNDO");
  expectKind("oops", "UNDO");
  expectKind("voltar atras", "UNDO");
  const all = parseCommand("undo tudo") as Extract<Command, { kind: "UNDO" }>;
  assertEquals(all.kind, "UNDO");
  assertEquals(all.all, true);
});

Deno.test("REPORT: variações", opts, () => {
  expectKind("relatorio", "REPORT");
  expectKind("ranking", "REPORT");
  expectKind("fechamento", "REPORT");
  expectKind("resumo do dia", "REPORT");
  expectKind("vendas hoje", "REPORT");
});

// ═══════════════════════════════════════════════════════════════════════════════
//  GRUPO 11 — PARSE_ERROR com hint útil
// ═══════════════════════════════════════════════════════════════════════════════
Deno.test("PARSE_ERROR: hint correto por contexto", opts, () => {
  const noOp = parseCommand("mesa 5 coca") as Extract<Command, { kind: "PARSE_ERROR" }>;
  assertEquals(noOp.kind, "PARSE_ERROR");
  assertEquals(noOp.hint, "no_op");

  const noTable = parseCommand("xxxyyy zzz aaa") as Extract<Command, { kind: "PARSE_ERROR" }>;
  assertEquals(noTable.kind, "PARSE_ERROR");
  assertEquals(noTable.hint, "generic");
});

// ═══════════════════════════════════════════════════════════════════════════════
//  GRUPO 12 — TABLE_VALUE (perguntas conversacionais sobre valor da mesa)
// ═══════════════════════════════════════════════════════════════════════════════
Deno.test("TABLE_VALUE: perguntas de valor da mesa", opts, () => {
  const cases: Array<[string, string]> = [
    ["qual o valor da mesa 2", "2"],
    ["qual valor da mesa 2", "2"],
    ["valor da mesa 5", "5"],
    ["valor mesa 3", "3"],
    ["quanto deu a mesa 2", "2"],
    ["quanto ficou a mesa 7", "7"],
    ["quanto ficou na mesa 4", "4"],
    ["quanto ta a mesa 3", "3"],
    ["quanto custou a mesa 6", "6"],
    ["conta da mesa 3", "3"],
    ["conta mesa 8", "8"],
    ["total da mesa 4", "4"],
    ["total mesa 9", "9"],
    ["fechamento da mesa 7", "7"],
    ["mesa 5 valor", "5"],
    ["mesa 2 conta", "2"],
    ["mesa 3 total", "3"],
    ["mesa 4 quanto deu", "4"],
  ];
  for (const [input, expectedTable] of cases) {
    const r = parseCommand(input) as Extract<Command, { kind: "TABLE_VALUE" }>;
    assertEquals(r.kind, "TABLE_VALUE", `[${input}] esperado TABLE_VALUE, recebido ${r.kind}`);
    assertEquals(r.table, expectedTable, `[${input}] mesa esperada ${expectedTable}, recebida ${r.table}`);
  }
});

Deno.test("VIEW: variações conversacionais", opts, () => {
  const cases: Array<[string, string]> = [
    ["o que tem na mesa 2", "2"],
    ["o que pediram na mesa 5", "5"],
    ["o que pediu na mesa 3", "3"],
    ["lista da mesa 7", "7"],
    ["pedido da mesa 4", "4"],
    ["pedidos da mesa 6", "6"],
    ["itens da mesa 8", "8"],
    ["consumo da mesa 2", "2"],
    ["extrato da mesa 9", "9"],
    ["resumo da mesa 5", "5"],
  ];
  for (const [input, expectedTable] of cases) {
    const r = parseCommand(input) as Extract<Command, { kind: "VIEW" }>;
    assertEquals(r.kind, "VIEW", `[${input}] esperado VIEW, recebido ${r.kind}`);
    assertEquals(r.table, expectedTable, `[${input}] mesa esperada ${expectedTable}, recebida ${r.table}`);
  }
});

Deno.test("TABLE_VALUE: não confunde com ADD/REMOVE", opts, () => {
  // Garantir que perguntas não viram comando de pedido
  const r1 = parseCommand("qual o valor da mesa 2");
  assert(r1.kind !== "ADD" && r1.kind !== "REMOVE", `[${r1.kind}] não pode ser ADD/REMOVE`);
  const r2 = parseCommand("conta da mesa 5");
  assert(r2.kind !== "ADD" && r2.kind !== "REMOVE");
});
