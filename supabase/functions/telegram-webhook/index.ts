// Telegram webhook: ecoa "Bot funcionando 🔥" pra qualquer texto recebido.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN");
  if (!TOKEN) {
    console.error("TELEGRAM_BOT_TOKEN not configured");
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  try {
    const update = await req.json();
    console.log("Update recebido:", JSON.stringify(update));

    const message = update?.message ?? update?.edited_message;
    const chatId = message?.chat?.id;
    const text = message?.text;

    if (chatId && text) {
      const res = await fetch(`https://api.telegram.org/bot${TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "Bot funcionando 🔥",
        }),
      });
      if (!res.ok) {
        console.error("sendMessage falhou:", res.status, await res.text());
      }
    }
  } catch (err) {
    console.error("Erro processando update:", err);
  }

  // Sempre 200 pra Telegram não re-tentar.
  return new Response("ok", { status: 200, headers: corsHeaders });
});
