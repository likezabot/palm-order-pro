

## Integrar bot do Telegram (eco básico)

### Objetivo
Bot responde "Bot funcionando 🔥" para qualquer texto recebido. Webhook simples, sem persistência, sem polling.

### Abordagem
O conector oficial do Telegram da Lovable não suporta webhooks (só `getUpdates`). Como você quer **webhook**, vamos usar uma edge function que recebe o POST do Telegram diretamente e chama `sendMessage` na Bot API com o token do bot guardado como secret. Mais simples e direto pro caso de uso.

### Arquivos

**1. `supabase/functions/telegram-webhook/index.ts` (novo)**
- Edge function pública (sem JWT) que recebe POST do Telegram.
- Extrai `update.message.chat.id` e `update.message.text`.
- Se houver texto, chama `https://api.telegram.org/bot<TOKEN>/sendMessage` com `{ chat_id, text: "Bot funcionando 🔥" }`.
- Sempre retorna 200 rápido (Telegram re-tenta em caso de erro/timeout).
- Lê `TELEGRAM_BOT_TOKEN` via `Deno.env.get`.
- CORS básico (não estritamente necessário pra Telegram, mas bom hábito).

**2. `supabase/config.toml`**
- Adicionar bloco pra `telegram-webhook` com `verify_jwt = false` (Telegram não envia JWT).

### Secret necessário
- `TELEGRAM_BOT_TOKEN` — token que o BotFather te dá (formato `123456789:ABC-DEF...`). Vou pedir via `add_secret` antes de implementar.

### Após deploy

**URL do endpoint** (o que você vai usar no Telegram):
```
https://gbpcjjtxqtzqotmkfxrh.supabase.co/functions/v1/telegram-webhook
```

**Configurar o webhook no Telegram** (faz uma vez, do seu próprio navegador/terminal):
```
https://api.telegram.org/bot<SEU_TOKEN>/setWebhook?url=https://gbpcjjtxqtzqotmkfxrh.supabase.co/functions/v1/telegram-webhook
```
Abre essa URL no navegador trocando `<SEU_TOKEN>` pelo token real. Resposta esperada: `{"ok":true,"result":true,"description":"Webhook was set"}`.

**Pra checar se está ativo:**
```
https://api.telegram.org/bot<SEU_TOKEN>/getWebhookInfo
```

**Pra remover (se precisar voltar ao polling):**
```
https://api.telegram.org/bot<SEU_TOKEN>/deleteWebhook
```

### Teste
Manda qualquer mensagem pro bot no Telegram → ele responde "Bot funcionando 🔥". Logs visíveis no painel de edge functions.

### O que NÃO está incluso
Estoque, relatórios, comandos específicos, persistência de mensagens, autenticação de usuários do Telegram. Só eco fixo.

