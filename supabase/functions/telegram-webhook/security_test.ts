// Testes ofensivos do webhook: garantem default-deny quando o secret do Telegram
// não bate, quando o body é malformado, e quando os endpoints de TEST_MODE são
// chamados sem autorização. Rodam com TELEGRAM_TEST_IMPORT=1 + WEBHOOK_SECRET fake.
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

// Garante que o módulo principal NÃO inicia o serve(), apenas exporta o handler
// para podermos invocar como função pura nos testes.
Deno.env.set("TELEGRAM_TEST_IMPORT", "1");
Deno.env.set("WEBHOOK_SECRET", "test-secret-abc123");
Deno.env.set("TELEGRAM_BOT_TOKEN", "fake-token");
Deno.env.set("SUPABASE_URL", "https://example.invalid");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "fake-srk");
Deno.env.set("TEST_MODE", "0");

const mod = await import("./index.ts");
const handler = (mod as any).webhookHandler as (req: Request) => Promise<Response>;

function makeReq(opts: { method?: string; secret?: string | null; body?: unknown; url?: string } = {}) {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (opts.secret !== null && opts.secret !== undefined) {
    headers["X-Telegram-Bot-Api-Secret-Token"] = opts.secret;
  }
  return new Request(opts.url ?? "https://example.invalid/webhook", {
    method: opts.method ?? "POST",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

Deno.test("rejeita POST sem header de secret (401)", async () => {
  const res = await handler(makeReq({ secret: null, body: { update_id: 1 } }));
  assertEquals(res.status, 401);
  await res.body?.cancel();
});

Deno.test("rejeita POST com secret errado (401)", async () => {
  const res = await handler(makeReq({ secret: "wrong-secret", body: { update_id: 2 } }));
  assertEquals(res.status, 401);
  await res.body?.cancel();
});

Deno.test("aceita preflight OPTIONS sem secret", async () => {
  const res = await handler(new Request("https://example.invalid/webhook", { method: "OPTIONS" }));
  // 204/200 ambos válidos para preflight.
  assert(res.status === 200 || res.status === 204);
  await res.body?.cancel();
});

Deno.test("rejeita body inválido (não-JSON) com 400, mesmo com secret correto", async () => {
  const req = new Request("https://example.invalid/webhook", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": "test-secret-abc123",
    },
    body: "not-a-json{",
  });
  const res = await handler(req);
  assertEquals(res.status, 400);
  await res.body?.cancel();
});

Deno.test("TEST_MODE endpoint cleanup negado quando TEST_MODE=0 (403)", async () => {
  const res = await handler(makeReq({ method: "GET", url: "https://example.invalid/webhook?test=cleanup", secret: "test-secret-abc123" }));
  assertEquals(res.status, 403);
  await res.body?.cancel();
});

Deno.test("TEST_MODE endpoint requer secret mesmo com TEST_MODE=1", async () => {
  Deno.env.set("TEST_MODE", "1");
  Deno.env.set("TEST_CHAT_ID", "999");
  // sem secret
  const res = await handler(new Request("https://example.invalid/webhook?test=ping", { method: "GET" }));
  assertEquals(res.status, 401);
  await res.body?.cancel();
  Deno.env.set("TEST_MODE", "0");
});
