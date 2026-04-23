

# Apelidos de produtos para reconhecimento por voz/texto no Telegram

## Objetivo
Adicionar uma camada de **apelidos** (aliases) por produto, editáveis no Admin, que alimenta:
1. O **dicionário** enviado ao Gemini na transcrição de voz
2. O **fuzzy matching** do parser de comandos no `telegram-webhook`

Sem mexer em pedidos, impressão, pagamento, layout do cupom ou cozinha.

## Mudanças

### 1. Banco — nova coluna em `products`
Migration:
```sql
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS aliases text[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS idx_products_aliases_gin
  ON public.products USING GIN (aliases);
```

Sem trigger, sem default complexo. `inventory_items` já tem `aliases` — mesma convenção.

### 2. Admin — editor de apelidos
**`src/components/admin/ProductForm.tsx`**: novo campo "Apelidos / variações" (chips estilo tag input).
- Input de texto + botão "+" / Enter adiciona; X remove.
- Normaliza no submit: lowercase, trim, sem acento, dedup, ignora vazios e o próprio nome.
- Exibe abaixo: dica curta — "Como o garçom pode chamar este item por voz/Telegram. Ex.: coca zero, zero, ks zero".

**`src/components/admin/SortableProductCard.tsx`**: mostra contador discreto `🏷️ 3 apelidos` quando > 0 (somente leitura, edição via form).

### 3. Telegram webhook — usar apelidos
Em `supabase/functions/telegram-webhook/index.ts`:

- **`getMenuVocabulary()`**: além do `name`, concatena `aliases` no formato `Coca-Cola Zero (coca zero, zero, ks zero)` no prompt do Gemini. Cache 60s mantém.
- **`fuzzyFindProducts(query, products)`**: estende ranking para também testar `query` contra cada alias (mesmo pipeline: exact > startsWith > includes > tokens > Levenshtein). Match por alias entra com peso igual ao por nome.
- **`ProductRow` type**: adicionar `aliases?: string[]`.
- **Query de produtos**: incluir `aliases` no `select`.

### 4. Testes
**`supabase/functions/telegram-webhook/parser_test.ts`**: +6 casos cobrindo:
- "coca zero" resolve para "Coca-Cola Zero" via alias
- Apelido com acento/sem acento
- Apelido + plural ("zeros")
- Conflito alias vs nome de outro produto (nome vence)
- Alias ambíguo (2 produtos com mesmo apelido) → `ambiguous`
- Sem apelidos cadastrados, fluxo atual continua igual

### 5. Memory
Atualizar `.lovable/memory/features/telegram-bot.md` documentando que `products.aliases` alimenta vocabulário e fuzzy.

## Detalhes técnicos

- **Normalização de aliases**: aplicada no Admin (escrita) E no fuzzy (leitura), via `normalize()` já existente — sem migrations de dados.
- **Vocabulário no prompt**: limitado a ~150 produtos ativos, com até 5 apelidos por item para não explodir tokens. Cache 60s.
- **Sem breaking changes**: coluna default `'{}'`, todos os fluxos atuais continuam idênticos quando aliases vazio.
- **Realtime**: `products` já está em `supabase_realtime` — Admin/Palm refletem mudança em apelidos automaticamente, mas como o vocab tem cache de 60s no edge, o bot pega novos apelidos em até 1 min (suficiente).

## Critério de sucesso
1. No Admin, edito o produto "Coca-Cola Zero" e adiciono apelidos "coca zero, zero, ks zero".
2. Mando "mesa 5 + 2 coca zero" no Telegram → reconhece direto, sem ambiguidade.
3. Mando áudio "duas zero pra mesa cinco" → Gemini transcreve com mais precisão e resolve.
4. Pedidos, impressão, cozinha continuam funcionando idênticos.

