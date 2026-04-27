## Objetivo

Quando o cliente fizer um pedido **delivery** no site público, o endereço fica salvo automaticamente vinculado ao telefone dele. Na próxima visita, ao digitar o telefone, os campos de endereço são preenchidos automaticamente com o último endereço usado.

## Como funciona hoje

- O checkout (`src/pages/PublicCheckout.tsx`) já salva o telefone em `localStorage` para pré-preencher na próxima visita.
- A função SQL `create_public_order` já cria/atualiza o `customer` (via `get_or_create_customer`) e salva o endereço **apenas em `orders.delivery_address`** (jsonb do pedido).
- Existe a tabela `customer_addresses` (vinculada por `customer_id`) com RLS bloqueada para o público (acesso só via RPC `SECURITY DEFINER`), mas **ela nunca é populada hoje**.
- Não existe nenhuma RPC pública para buscar o último endereço de um telefone.

## Mudanças

### 1. Migration — persistir endereço + RPC de leitura

Criar **uma única migration** com:

**a) Atualizar `create_public_order`** — quando `service_type = 'delivery'` e o `p_address` tem `street`/`number`/`neighborhood`, fazer um `INSERT` em `customer_addresses` vinculado ao `v_customer_id` recém-resolvido. Se já existir endereço idêntico (mesma rua/número/bairro/complemento), apenas atualizar `is_default = true` e desmarcar os outros do mesmo cliente. Caso contrário, inserir novo e marcar como `is_default`.

**b) Criar RPC `get_last_customer_address(p_phone text)`** — `SECURITY DEFINER`, com `search_path = public`. Normaliza telefone via `normalize_phone`, busca o `customer` pelo telefone, e retorna o endereço marcado como `is_default = true` (ou o mais recente). Retorna jsonb com `street`, `number`, `neighborhood`, `complement`, `reference`, ou `null` se não houver. Conceder `EXECUTE` para `anon`/`authenticated`.

Sem alteração em `customers`, `orders`, RLS ou outras funções.

### 2. Frontend — `src/lib/public-cart.ts`

Adicionar função utilitária:

```ts
export async function fetchLastCustomerAddress(phone: string): Promise<CheckoutAddress | null>
```

Chama a RPC `get_last_customer_address`. Retorna `null` em erro silenciosamente.

### 3. Frontend — `src/pages/PublicCheckout.tsx`

- Adicionar um `useEffect` que dispara quando o telefone digitado tem 10+ dígitos **E** o `serviceType === 'delivery'` **E** os campos de endereço estão todos vazios (não sobrescrever digitação manual do cliente).
- Usar debounce simples (~500 ms) para não chamar a RPC a cada tecla.
- Ao receber o endereço, preencher `street`, `number`, `neighborhood`, `complement`, `reference` e mostrar um toast discreto: *"Endereço preenchido automaticamente"*.
- Lembrar o último telefone consultado em um `ref` para não refazer a chamada repetidamente para o mesmo número.

## O que NÃO será mexido

- EXE, bridge, electron, print_jobs, fila de impressão.
- PDV, Palm, Kitchen, lógica de mesa.
- `client.ts` e `types.ts`.
- Lógica de fidelidade.
- RLS já existente (mantém `customer_addresses` bloqueada para o público; acesso só via RPC `SECURITY DEFINER`).

## Privacidade / LGPD

Mantemos o padrão atual: a tabela `customer_addresses` continua **privada**. O auto-preenchimento só funciona se o cliente digitar o **mesmo telefone** que usou antes — não há listagem de telefones nem enumeração possível. A RPC retorna `null` para telefones desconhecidos, sem revelar se existe ou não cadastro.

## Validação final

- `tsc --noEmit` + build.
- Teste manual: fazer um pedido delivery → fechar aba → reabrir → digitar telefone → endereço deve aparecer.
- Confirmar que pickup/dine_in **não** dispara a busca de endereço.
- Confirmar que digitar telefone novo (sem histórico) não trava nem mostra erro.