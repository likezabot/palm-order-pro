

# Logging detalhado de voz + fallback quando nada funciona

## Objetivo
Quando chega um áudio no Telegram, deixar rastro completo nos logs (`voz → transcrição → parse → resolução → ação`) e garantir que o usuário SEMPRE recebe uma resposta — seja confirmação, execução, ou um aviso claro de "não entendi".

## Mudanças em `supabase/functions/telegram-webhook/index.ts`

### 1. Logs estruturados de voz
Inserir uma série de `console.log` com prefixo `[voice]` e um `traceId` curto (gerado no início do handler de voz) para rastrear toda a cadeia em uma única busca de logs:

- `[voice <id>] received` — duration, mime, file_size do voice/audio Telegram
- `[voice <id>] download ok bytes=...` (já existe parcial em `transcribeVoice`, padronizar)
- `[voice <id>] transcript: "..."` (já existe, ajustar formato)
- `[voice <id>] split lines=N` — quantas linhas Gemini retornou
- Para cada linha:
  - `[voice <id>] line[i] raw="..."` 
  - `[voice <id>] line[i] parsed kind=ADD table=5 qty=2 productText="medalhao"`
  - `[voice <id>] line[i] context table=5 fromContext=true`
  - `[voice <id>] line[i] product resolution=found id=... name="Medalhão" score=0.92` (ou `ambiguous candidates=3` / `not_found`)
- `[voice <id>] confidence confident=false reason="produto ambíguo"` (ou `true`)
- `[voice <id>] action=ask_confirm` / `action=executed` / `action=failed reason=...`

Sem dados sensíveis (token, chat_id já existe nos logs do framework).

### 2. Fallback "não entendi" — sempre responder
Hoje há um caminho onde, se `transcribeVoice` retorna `null`, o fluxo só loga e segue. Garantir mensagem ao usuário em 3 cenários:

a) **Falha na transcrição** (`transcribeVoice` retornou null): enviar  
   `🎤 Não consegui entender o áudio. Tente falar mais perto do microfone, em ambiente silencioso, ou envie por texto. (Ex.: "mesa 5 +2 coca")`

b) **Transcreveu mas parser não achou nada útil** (todas as linhas `PARSE_ERROR` ou vazio após split): enviar  
   `🎤 Ouvi: "..."\n\n⚠️ Não consegui transformar isso em comando. Tente: "mesa N + qty produto" (ex.: "mesa 2 mais 1 medalhão").`

c) **Erro inesperado** no pipeline de voz (catch geral): enviar  
   `🎤 Ouvi: "..."\n\n❌ Erro ao processar. Tente novamente ou envie por texto.`

Gate de confiança existente (caso b parcial) já mostra preview + botões — manter, só adicionar log `action=ask_confirm`.

### 3. Pequena melhoria no gate
Quando `enriched` está totalmente vazio (nenhum comando reconhecido), em vez de mostrar `(nada reconhecido)` no preview e botão "✅ Executar" inútil, mandar a mensagem (b) acima e NÃO oferecer botões.

## Detalhes técnicos
- `traceId`: `Math.random().toString(36).slice(2, 8)` no início do bloco que processa `message.voice` ou `message.audio`.
- Passar `traceId` como parâmetro opcional para `transcribeVoice(fileId, traceId)` para correlacionar os logs internos.
- Nenhuma mudança de schema, nenhum novo secret, nenhuma mudança em fluxos de texto/estoque/cardápio.
- Os testes de parser existentes seguem passando — só adicionamos logs e um caminho de erro ao usuário.

## Critério de sucesso
1. Mando áudio "lança um medalhão na mesa 2" → vejo nos logs do edge function a cadeia completa com o mesmo `traceId`.
2. Mando áudio inaudível → recebo no Telegram a mensagem (a) ao invés de silêncio.
3. Mando áudio que transcreve mas não vira comando → recebo mensagem (b) com a transcrição visível.
4. Áudio bom continua executando direto, áudio com baixa confiança continua pedindo ✅/❌.

