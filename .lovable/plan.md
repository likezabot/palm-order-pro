

# Corrigir parser do Telegram ("3 bois" → Costela) e impressão travada

## Diagnóstico (causa raiz)

### Erro 1 — "3 bois" virou "Costela de boi (borboleta)"
O parser roda `singularize()` antes de buscar produto. A regra de plural português:
```js
if (/ois$/.test(tok)) return tok.replace(/ois$/, "ol"); // lencois → lencol
```
transformou **"bois" → "bol"**. Com isso:
- O alias exato `"boi"` do item Bovino **não casou** (procurou "bol").
- O fallback fuzzy (Levenshtein ≤ 2) achou que "bol" ≈ "boi" e casou no token "boi" do nome **"Costela de boi (borboleta)"**.
- Resultado: 3× Costela R$ 45 em vez de 3× Bovino R$ 30.

A regra `/ois$/→ol` é correta para "lençóis/anzóis", mas destrói **"bois"** (plural de boi).

### Erro 2 — Mesa 2 não imprimiu
Pedido `0e6b08e7…` ficou com `print_status='pending'`, `print_claimed_at=NULL`, `printed_at=NULL`. A bridge `.exe` não pegou o job (provavelmente offline naquele instante ou perdeu o evento realtime). Existem **2 pedidos pendentes** sem watchdog ativo (o agendamento que estava planejado nunca foi executado / não existe na DB).

## O que vou corrigir

### 1) Parser — proteger "boi/bois" e palavras curtas críticas
Em `supabase/functions/telegram-webhook/index.ts`, função `singularizeToken`:
- **Whitelist de exceções** que pulam toda a singularização (palavras de 3-4 letras que viram outra coisa): `bois`, `pois`, `dois`, `sois`, `vois`.
- Para "bois" especificamente, retornar **"boi"** (regra correta de plural) ao invés de "bol".
- Generalização: se a palavra tem ≤ 4 letras e termina em `ois`, tirar só o `s` (boi, dói, sói…) em vez de aplicar `ois→ol` (que só vale para palavras maiores como "lençóis", "anzóis", "caracóis").

Resultado:
- "bois" → "boi" → casa alias `boi` do Bovino ✅
- "lencois" (6 letras) → "lencol" (continua funcionando) ✅

### 2) Reforçar autoPick para evitar fuzzy enganoso
Na função `autoPickFromCandidates` / no fluxo batch (linha ~3937):
- Quando o resultado vier por **fuzzy match**, exigir que o token original do usuário (não-singularizado) **apareça como palavra inteira** no nome OU em algum alias do candidato. Se nenhum candidato tiver match exato de palavra inteira, **devolver ambíguo** (mostrar botões) em vez de auto-escolher.
- Isso impede que "boi" cole em "Costela de **boi** (borboleta)" quando existe "Bovino" com alias exato "boi".

### 3) Priorizar match por alias exato sobre fuzzy
No `resolveProduct`, se `find_inventory_item_by_text` retornar nada com a forma singularizada, **tentar também com a forma original** (sem singularizar) antes de cair no fuzzy. Garante que aliases curtos como `boi` sejam encontrados mesmo que o singularize tenha mutilado a palavra.

### 4) Reimprimir as 2 mesas travadas
Resetar via UPDATE direto no banco:
- `0e6b08e7…` (Mesa 2, José)
- `40e13d8a…` (Mesa 1, José)

Ação: `UPDATE orders SET print_status='pending', print_claimed_at=NULL` (já estão nesse estado, então basta tocar `updated_at` para o realtime/worker tentar de novo) **ou** acionar o botão "Reimprimir" do PDV. Prefiro um pequeno SQL idempotente que limpa `print_claimed_at` órfão e bumpa `updated_at` para forçar o worker a republicar.

### 5) Watchdog de impressão (que estava planejado mas não foi materializado)
Como confirmado pelo `read_query`, **não existe nenhum job/função de watchdog** na DB — o plano anterior listou mas nunca foi executado. Vou criar:
- Função `requeue_stuck_print_jobs()`: pega `orders` com `print_status='claimed'` e `print_claimed_at < now() - 90s` e devolve para `pending` (limpa `print_claimed_at`, incrementa contador `print_attempts` se necessário).
- Cron `pg_cron` a cada 1 minuto.
- Continua **sem tocar na bridge `.exe`**.

### 6) Corrigir o estoque negativo da Costela
A Costela de boi (borboleta) ficou com **current_stock = -3** por causa do erro de parsing. Vou criar um movimento de ajuste `+3` com nota "Reversão de erro de parsing Telegram (Mesa 4 Wilson)" usando `apply_inventory_movement` — sem apagar o pedido (mantém o histórico do erro).

## Arquivos modificados

- `supabase/functions/telegram-webhook/index.ts`
  - `singularizeToken`: whitelist + regra `ois` só para palavras > 4 letras.
  - `resolveProduct`: tentar alias exato com texto original antes do fuzzy.
  - `autoPickFromCandidates`: exigir match por palavra inteira para fuzzy; senão devolver ambíguo.
- **nova migration** `supabase/migrations/<ts>_print_watchdog.sql`
  - Função `requeue_stuck_print_jobs(int default 90)` SECURITY DEFINER.
  - Agendamento `pg_cron` minuto a minuto.
  - Index em `orders(print_status, print_claimed_at)` para acelerar.
- **operação SQL pontual** (não migration): bump em `updated_at` dos 2 pedidos travados + ajuste +3 da Costela via RPC.

## Não alterado

- `bridge/lp-bridge.js`, `.exe`, ESC/POS, endpoints `/health` e `/print`.
- `print-queue-worker.ts` no cliente.
- Layout de impressão.

## Como vou validar

1. Deploy da edge atualizada → enviar "Mesa 9 mais 3 bois" → conferir que casa **Bovino** (R$ 30).
2. Enviar "Mesa 9 mais 1 boi" → idem.
3. Enviar "Mesa 9 mais 1 lençóis" (palavra longa) → continua singularizando para "lencol" (não quebra a regra original).
4. Verificar que as Mesas 1 e 2 imprimiram após o bump.
5. Forçar um pedido com bridge offline 2 min, religar bridge → watchdog deve devolver para `pending` e a bridge imprime.
6. Conferir Costela em estoque positivo de novo.
7. Rodar `vitest` (deve continuar 80/80).

## Resultado esperado

- "boi/bois" sempre resolvem para Bovino.
- Pedidos travados na fila são reimpressos automaticamente em até 1 min.
- Mesa 2 imprime imediatamente.
- Estoque da Costela volta ao real.
- Bridge `.exe` permanece intocada.

