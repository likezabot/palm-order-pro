# Revisão do plano do Codex (Pontos por pedido online)

## ✅ O que está bom no plano original
1. **Pontos só sobre subtotal de itens** (exclui taxa) — protege margem.
2. **Resgate só em brindes pré-cadastrados** — sem desconto direto em dinheiro.
3. **1 brinde por pedido** + **brinde como item R$ 0,00** — funciona com o fluxo de impressão atual sem mexer em `print_jobs`.
4. **Pontos só liberam quando pedido vira `paid`** — confirmei no código: pedidos online usam `status='paid'` quando finalizados, e já existem triggers em `OLD.status <> 'paid' AND NEW.status = 'paid'`.
5. **Toda regra no banco / RPC** — correto, evita burlar pelo cliente.
6. **Identidade pelo telefone** — combina com `validatePhone` / `formatPhone` já existentes em `public-cart.ts`.
7. **Não mexer em EXE/bridge/print_jobs** — alinhado com a arquitetura.

## ⚠️ Lacunas e melhorias propostas

### 1. Idempotência do ganho (CRÍTICO)
Plano cita "trava pra não duplicar", mas precisa especificar: **UNIQUE INDEX parcial em `loyalty_transactions(order_id) WHERE kind='earn'`**. Garante que mesmo se o trigger disparar 2x ou se houver retry, nunca pontua em dobro.

### 2. Cancelamento e estorno (FALTA NO PLANO)
- Pedido cancelado **depois** de virar `paid` precisa **estornar pontos ganhos** (`kind='reversal'`).
- Pedido com brinde resgatado que for cancelado precisa **devolver os pontos debitados** (`kind='refund'`).
- Solução: trigger AFTER UPDATE também trata `NEW.status='cancelled'`.

### 3. Normalização do telefone (FALTA NO PLANO)
"Telefone normalizado" precisa virar função SQL: `normalize_phone(text)` que tira tudo que não é dígito, e usar como **PK natural** de `loyalty_accounts`. Sem isso, "11 99999-9999" e "11999999999" criam contas separadas.

### 4. Race condition no resgate (FALTA NO PLANO)
Validação de saldo + débito precisa ser **atômico** dentro de `create_public_order`: usar `SELECT ... FOR UPDATE` na conta. Sem isso, dois cliques rápidos podem resgatar 2 brindes com saldo de 1.

### 5. Configuração via `settings` em vez de hardcode
- `loyalty_enabled` (default `false`) — flag global on/off
- `loyalty_points_per_real` (default `1`)
- `loyalty_min_subtotal_to_earn` (default `0`) — evita pontuar em pedidos minúsculos

### 6. Vincular brinde a produto real
`loyalty_rewards.product_id` (FK opcional, `ON DELETE SET NULL`) — assim o admin vê o **custo efetivo da promoção** (preço do produto / pontos = R$ por ponto), com sensibilidade de margem.

### 7. UX do checkout
- Buscar saldo só **após** `validatePhone` passar, com **debounce 400ms**.
- Mostrar **"Pontos que você vai ganhar: X"** e **"Saldo após pedido: Y"** (transparência).
- Se RPC falhar/timeout: **esconder a seção, não bloquear o checkout**.

### 8. Admin
- Busca de cliente **por telefone** com histórico.
- Ajuste manual com **observação obrigatória** (auditoria em `admin_note`).
- Listar top clientes por saldo.
- Aba já fica protegida pelo `StaffGate` (herda de `/admin`).

### 9. Compatibilidade da RPC
A `create_public_order` atual tem assinatura fixa. Adicionar `p_loyalty_reward_id uuid DEFAULT NULL` **no final** mantém compat com chamadas antigas. O `client_request_id` já existente garante idempotência do pedido inteiro.

### 10. Testes a adicionar
- Subtotal R$35 + taxa R$5 → 35 pontos (não 40).
- Pedido `dine_in` (mesa) **NÃO** ganha pontos — só `pickup` e `delivery`.
- Telefone formatado vs não formatado → mesma conta.
- Dois `UPDATE status='paid'` seguidos → 1 só transaction.
- Cancelamento estorna `earn` e `redeem`.

---

## 📝 Prompt final pronto para colar no Lovable

```
Quero implementar um sistema de fidelidade por pontos para pedidos ONLINE
(pickup e delivery). Não mexer em pedidos de mesa (dine_in), EXE, bridge,
print_jobs ou impressão.

================ REGRAS DE NEGÓCIO ================
- 1 ponto por R$ 1,00 sobre o SUBTOTAL DE ITENS (NÃO inclui taxa de entrega).
- Pontos só são creditados quando o pedido online vira status 'paid'.
- Identidade do cliente é o telefone NORMALIZADO (só dígitos).
- Resgate só em brindes pré-cadastrados pelo Admin. Nunca desconto em dinheiro.
- Máximo 1 brinde por pedido.
- Brinde entra como item do pedido com preço R$ 0,00 e nome prefixado "[BRINDE] ".
- Pontos não expiram nesta versão.
- Cancelamento de pedido estorna pontos ganhos E devolve pontos resgatados.

================ BANCO DE DADOS (migration) ================

1) Função utilitária:
   - public.normalize_phone(text) returns text  -- só dígitos

2) Inserir em settings (se não existir):
   - 'loyalty_enabled' = 'false'
   - 'loyalty_points_per_real' = '1'
   - 'loyalty_min_subtotal_to_earn' = '0'

3) Tabelas:
   - loyalty_accounts:
       phone text PRIMARY KEY (normalizado),
       balance integer NOT NULL DEFAULT 0 CHECK (balance >= 0),
       total_earned integer NOT NULL DEFAULT 0,
       last_customer_name text,
       created_at, updated_at
   - loyalty_transactions:
       id uuid PK,
       phone text NOT NULL REFERENCES loyalty_accounts(phone),
       order_id uuid NULL REFERENCES orders(id) ON DELETE SET NULL,
       kind text CHECK (kind IN ('earn','redeem','refund','reversal','admin_adjust')),
       points integer NOT NULL,        -- positivo = crédito; negativo = débito
       reward_id uuid NULL,
       admin_note text NULL,
       created_at,
       UNIQUE INDEX (order_id) WHERE kind = 'earn'   -- impede pontuar 2x
   - loyalty_rewards:
       id uuid PK,
       restaurant_id uuid NOT NULL,
       product_id uuid NULL REFERENCES products(id) ON DELETE SET NULL,
       display_name text NOT NULL,
       points_cost integer CHECK (points_cost > 0),
       min_order_subtotal numeric NOT NULL DEFAULT 0,
       active boolean NOT NULL DEFAULT true,
       sort_order integer NOT NULL DEFAULT 0,
       created_at, updated_at

4) RLS:
   - loyalty_accounts e loyalty_transactions: bloquear leitura/escrita direta do anon. Acesso só via RPC SECURITY DEFINER.
   - loyalty_rewards: SELECT público dos ativos; mutações só via RPC admin (mesmo padrão do resto do projeto).

5) Trigger AFTER UPDATE em public.orders:
   - Quando OLD.status <> 'paid' AND NEW.status = 'paid' AND NEW.service_type IN ('pickup','delivery'):
       Se loyalty_enabled = true e tem telefone normalizado válido:
         pontos = floor(subtotal_de_itens * loyalty_points_per_real)
         Se pontos > 0 e subtotal >= loyalty_min_subtotal_to_earn:
           UPSERT loyalty_accounts (cria se não existir, soma balance + total_earned)
           INSERT loyalty_transactions kind='earn' (UNIQUE garante idempotência)
   - Quando NEW.status = 'cancelled' AND OLD.status <> 'cancelled':
       Para cada transaction daquele order_id:
         earn -> inserir 'reversal' negativo, decrementar balance
         redeem -> inserir 'refund' positivo, incrementar balance

6) RPCs SECURITY DEFINER:
   - get_public_loyalty_status(p_phone text) RETURNS jsonb:
       { balance, rewards: [ { id, display_name, points_cost, min_order_subtotal, available, blocked_reason } ] }
       Faz normalize_phone internamente.
   - admin_loyalty_adjust(p_phone text, p_points int, p_note text) — exige note não vazio.
   - admin_loyalty_list_rewards / upsert_reward / delete_reward.
   - admin_loyalty_search_customer(p_phone text) — saldo + histórico.

7) Estender create_public_order:
   - Adicionar parâmetro p_loyalty_reward_id uuid DEFAULT NULL no FINAL (preserva compat).
   - Se passado:
       SELECT ... FOR UPDATE em loyalty_accounts.
       Validar: brinde ativo, saldo suficiente, subtotal >= min_order_subtotal, telefone válido.
       Inserir item do brinde no pedido com price=0 e nome "[BRINDE] {display_name}".
       INSERT loyalty_transactions kind='redeem' com points negativos.
       Decrementar balance.
   - Erros claros: 'reward_inactive', 'insufficient_points', 'min_subtotal_not_met', 'phone_required'.
   - client_request_id continua garantindo idempotência do pedido inteiro.

================ FRONTEND ================

PublicMenu:
   - Banner discreto (somente se loyalty_enabled=true): "Ganhe 1 ponto a cada R$ 1 em pedidos online".

PublicCheckout:
   - Após validatePhone(phone) passar, com debounce 400ms, chamar get_public_loyalty_status.
   - Card: "Você tem X pontos" + lista de brindes.
   - Cada brinde: nome, custo, status (disponível / faltam N pontos / pedido mínimo R$ Y).
   - Selecionar no máximo 1 brinde (radio com opção "nenhum").
   - Mostrar prévia: "Pontos que você vai ganhar: N" + "Saldo após pedido: M".
   - Se RPC falhar/timeout: esconder a seção, NÃO bloquear o checkout.
   - Passar p_loyalty_reward_id no createPublicOrder.
   - Tratar erros 'insufficient_points' / 'reward_inactive' / 'min_subtotal_not_met' com toast amigável.

PublicOrderSuccess:
   - Mostrar pontos que serão creditados quando o pedido for finalizado.
   - Mostrar saldo restante (se houve resgate).
   - Invalidar query ['loyalty','status', phoneNormalizado].

Admin (nova aba "Fidelidade", ícone gift):
   - CRUD de loyalty_rewards (nome, produto vinculado opcional, custo em pontos, pedido mínimo, ativo, ordem).
   - Mostrar "custo efetivo R$/ponto" = preço do produto vinculado / points_cost.
   - Toggle global loyalty_enabled.
   - Busca de cliente por telefone -> saldo, total ganho, histórico de transações.
   - Ajuste manual de pontos com observação OBRIGATÓRIA.
   - Lista top 20 clientes por saldo.
   - Aba já protegida pelo StaffGate (herda de /admin).

================ TESTES ================
Adicionar em src/lib/__tests__ e/ou supabase migration tests:
   - Subtotal R$35 + taxa R$5 -> 35 pontos (não 40).
   - Pedido só ganha pontos após status='paid'.
   - Pedido dine_in (mesa) NÃO ganha pontos.
   - Cancelamento estorna earn e refund redeem.
   - Telefone "11 99999-9999" e "11999999999" caem na mesma conta.
   - Saldo insuficiente bloqueia resgate (mensagem clara).
   - Brinde inativo bloqueia.
   - Idempotência: dois UPDATE status='paid' seguidos geram 1 só transaction earn.
   - Resgate cria item R$ 0,00 visível no PDV/cozinha/impressão.

================ NÃO FAZER ================
- Não tocar em EXE, bridge, print_jobs, lógica de impressão, lógica de mesa.
- Não criar autenticação para o cliente público (continua identificado por telefone).
- Não criar desconto em dinheiro.
- Não permitir saldo negativo (CHECK no banco).
- Não expirar pontos nesta versão.
- Não modificar src/integrations/supabase/client.ts ou types.ts.
```
