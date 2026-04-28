## Diagnóstico confirmado

O problema real não é mais genérico de “checkout quebrado”. O erro atual é específico:

- o app chama `create_public_order` com a assinatura nova, incluindo `p_loyalty_reward_id`
- mas a função ativa no backend está tentando inserir em colunas antigas/inexistentes da tabela `orders`
- evidência capturada: `POST /rpc/create_public_order -> 400` com `column "items_subtotal" of relation "orders" does not exist`

Hoje a tabela `orders` tem, entre outras, estas colunas relevantes:
- `table_name`
- `delivery_address`
- `delivery_fee`
- `change_for`
- `delta_items`
- não existe `items_subtotal`
- não existe `address_snapshot`

Também encontrei versões conflitantes da mesma função nas migrations:
- uma versão antiga tenta inserir `items_subtotal` e `address_snapshot`
- versões mais novas já usam `delivery_address` e não tentam gravar `items_subtotal`

Arquivos isolados como origem do problema:
- `src/pages/PublicCheckout.tsx`
- `supabase/migrations/20260428164220_8fdea7ba-6bcc-44b9-a32d-79d4fe32f124.sql`
- `supabase/migrations/20260428185050_b4e994e3-688a-4aaf-a977-40fa3b3666e4.sql`

Do I know what the issue is?
Sim. A causa provável é drift/regressão de migration/função: o frontend e a tipagem já estão no formato novo, mas a função efetivamente atendendo o RPC ainda contém SQL de uma versão intermediária que escreve em colunas antigas da tabela `orders`.

## Plano de correção

1. Padronizar `create_public_order` em uma única versão compatível com o schema atual
- manter a assinatura já usada pelo app, incluindo `p_loyalty_reward_id`
- garantir que o `INSERT INTO public.orders` use somente colunas reais da tabela atual
- usar `delivery_address` em vez de `address_snapshot`
- não inserir `items_subtotal`
- manter `change_for`, `delta_items`, `channel`, `public_token`, `estimated_ready_at`

2. Remover a fonte da regressão
- revisar a cadeia de migrations relacionadas a `create_public_order`
- criar uma migration corretiva final, idempotente, que sobrescreva a função com a versão canônica
- evitar que uma versão antiga da função continue prevalecendo por ordem de aplicação ou restauração

3. Validar compatibilidade completa com o checkout público
- conferir que `src/pages/PublicCheckout.tsx` envia exatamente os argumentos aceitos pela função final
- validar o fluxo com e sem brinde/fidelidade
- validar `pickup` e `delivery`
- confirmar que erros amigáveis continuam aparecendo só quando houver falha real de negócio

4. Adicionar um guardrail técnico para não “quebrar o que já estava certo”
- consolidar uma checagem de consistência para `create_public_order`
- fazer a verificação comparar:
  - assinatura da função
  - colunas usadas no `INSERT`
  - colunas reais da tabela `orders`
- se houver divergência, registrar erro explícito de consistência em vez de deixar quebrar em produção

5. Entregar o prompt pré-definido que você poderá reutilizar em futuras correções

```text
ANTES DE ALTERAR QUALQUER COISA:
1. Não refatore nem “melhore” fluxos adjacentes.
2. Identifique a causa exata com evidência (erro de rede, erro SQL, log ou arquivo específico).
3. Liste os arquivos diretamente envolvidos.
4. Compare o schema atual do banco com as funções SQL e com o frontend antes de editar.
5. Não altere nome de coluna, payload, RPC ou migration sem provar compatibilidade com o schema atual.
6. Se existir mais de uma migration/função para o mesmo fluxo, encontre qual versão está correta e preserve somente a canônica.
7. Não mexa em partes já estáveis só por “padronização”.
8. Toda correção deve incluir:
   - causa raiz
   - evidência
   - menor patch possível
   - teste do cenário que falhava
9. Se o erro estiver no checkout/PDV/impressão, não tocar em outros módulos sem evidência direta.
10. Antes de concluir, verificar: “essa mudança remove a causa raiz ou só mascara o sintoma?”

OBJETIVO:
Corrigir somente o defeito confirmado, com o menor impacto possível, sem regressão em fluxos já funcionando.
```

## Detalhes técnicos

Estado atual confirmado:

```text
Frontend -> RPC create_public_order(p_loyalty_reward_id incluído)
        -> função ativa tenta INSERT com items_subtotal/address_snapshot
        -> tabela orders real não tem essas colunas
        -> PostgreSQL 42703
        -> pedido online falha no botão “Confirmar pedido”
```

Sinais que confirmam isso:
- snapshot de rede mostra `400` no RPC
- mensagem exata: `column "items_subtotal" of relation "orders" does not exist`
- tipagem gerada já aceita `p_loyalty_reward_id`
- schema atual da tabela `orders` tem `delivery_address` e não tem `items_subtotal`
- migrations recentes já mostram uma versão corrigida da função, então a função ativa ficou desalinhada

## Implementação após sua aprovação

Vou executar exatamente este escopo:
- criar a migration corretiva final para `create_public_order`
- validar o checkout online no cenário do print enviado
- preservar o restante do sistema sem mexer em impressão/PDV agora
- manter o guardrail/prompt documentado para próximas intervenções

<lov-actions>
  <lov-open-history>View History</lov-open-history>
</lov-actions>

<lov-actions>
<lov-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</lov-link>
</lov-actions>