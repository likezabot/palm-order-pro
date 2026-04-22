
# Corrigir pedidos travando por erro em `inventory_movements` e validar o build

## Diagnóstico

O bloqueio dos pedidos não está no botão do Palm nem na bridge `.exe`. O erro real vem do banco:

- a tabela `inventory_movements` aceita `source` apenas em:
  - `manual`
  - `telegram`
  - `pdv`
  - `system`
- porém a trigger `auto_inventory_from_order_items()` está tentando gravar:
  - `order:auto`
  - `order:auto-revert`

Isso viola o constraint `inventory_movements_source_check` e aborta o `INSERT/UPDATE` em `order_items`, então:
- pedido pelo Palm falha
- pedido vindo do Telegram/boy também pode falhar
- qualquer item vinculado ao estoque pode quebrar o fluxo

## Correção que vou aplicar

### 1. Migration para normalizar o `source` automático
Criar uma migration nova para atualizar `public.auto_inventory_from_order_items()` e substituir:

- `order:auto` → `system`
- `order:auto-revert` → `system`

Mantendo o contexto no campo `note`, por exemplo:
- `Pedido auto: Bovino`
- `Pedido auto-revert: Bovino`
- `Pedido auto-edit: Bovino`

Assim o histórico continua claro sem quebrar a constraint atual.

### 2. Blindagem extra no estoque
Na mesma migration, revisar `apply_inventory_movement(...)` para garantir que qualquer `p_source` inválido caia em `system` em vez de explodir a operação.

Objetivo:
- evitar regressão futura
- impedir que uma string fora do padrão volte a travar pedido

### 3. Não tocar na bridge `.exe`
Não vou alterar nada em:
- `bridge/lp-bridge.js`
- endpoints `/health` e `/print`
- ESC/POS
- worker de impressão

A correção fica só no backend de estoque/pedidos.

## Verificação do build

Os últimos ajustes também mexeram em áreas sensíveis do admin/print e no arquivo de tipos gerados. Então, junto da correção acima, vou fazer uma passada de estabilidade para o build:

### 4. Revisar os arquivos alterados recentemente
Checar e ajustar, se necessário:
- `src/components/admin/SystemTab.tsx`
- `src/components/print-station/ConnectionStatusBanner.tsx`
- `src/components/print-station/PrintQueuePanel.tsx`

Foco:
- imports
- tipos
- uso de RPCs novas
- qualquer incompatibilidade de build introduzida nas últimas edições

### 5. Tratar `src/integrations/supabase/types.ts` do jeito seguro
Como esse arquivo é gerado automaticamente, a validação será:
- não depender de edição manual frágil
- alinhar o app com os tipos realmente gerados após a migration
- ajustar o código cliente se houver assinatura divergente de RPC/tabela

## Testes que vou rodar

### Fluxos funcionais
1. Criar pedido novo no Palm com item vinculado ao estoque
2. Atualizar pedido existente no Palm
3. Validar pedido vindo do Telegram/boy
4. Confirmar que a baixa automática de estoque acontece sem erro
5. Confirmar que o histórico de estoque continua registrando a movimentação

### Validação técnica
6. Rodar build de produção
7. Rodar a suíte de testes existente
8. Conferir que nenhuma mudança encosta na bridge `.exe`

## Resultado esperado

- pedidos voltam a funcionar normalmente
- Telegram/boy volta a conseguir lançar item em mesa
- baixa automática de estoque continua ativa
- histórico permanece auditável
- build volta a passar
- bridge `.exe` permanece intacta
