

## Diagnóstico

O problema tem duas partes:

1. **PDV (Pdv.tsx):** O `handlePayment` (fechar mesa) imprime diretamente sem perguntar. Os botões de reimpressão (PEDIDO, CONTA, ACRÉSCIMO) também imprimem sem confirmação.

2. **Palm:** Não tem opção de "fechar conta" — só existe no PDV. O garçom não consegue fechar a mesa pelo celular.

## Plano

### 1. PDV — Adicionar modal de confirmação de impressão no fechamento

No `handlePayment` do `Pdv.tsx`:
- Trocar o botão "FECHAR MESA" para abrir um modal de confirmação antes de processar
- Modal com: "Fechar e imprimir" / "Fechar sem imprimir"
- Passar `shouldPrint` para `pay_order` RPC (já aceita `p_should_print`)
- Se `shouldPrint = false`, não chamar `printCustomerReceipt`

### 2. PDV — Adicionar confirmação nos botões de reimpressão

Os 3 botões (ACRÉSCIMO, PEDIDO, CONTA) na tela de detalhes:
- Cada um passa a abrir um mini-modal "Deseja imprimir?" antes de executar
- Usar um estado `pendingPrintAction` para guardar qual ação executar após confirmação

### 3. Palm — Adicionar botão "Fechar Conta" na tela de revisão

No `OrderReview.tsx`, quando há `existingOrderId` (mesa já aberta):
- Adicionar botão "💰 FECHAR CONTA" abaixo ou ao lado do "ATUALIZAR PEDIDO"
- Ao clicar, abrir modal perguntando forma de pagamento (Dinheiro/PIX/Cartão)
- Depois perguntar "Fechar e imprimir" / "Fechar sem imprimir"
- Chamar `pay_order` RPC direto do Palm

### 4. Palm — Adicionar "Fechar Conta" na página Palm.tsx

Alternativamente, criar um novo step `"close"` no `Palm.tsx` que renderiza o componente `CloseOrder` existente (que já tem o modal de impressão correto).

**Abordagem escolhida:** Reusar `CloseOrder.tsx` no fluxo do Palm, adicionando um botão na tela de detalhes do pedido para navegar até ele. Isso evita duplicar lógica de pagamento.

### Arquivos alterados

| Arquivo | Alteração |
|---|---|
| `src/pages/Pdv.tsx` | Adicionar modal de confirmação antes de fechar mesa e antes de cada reimpressão |
| `src/pages/Palm.tsx` | Adicionar step `"close"` que renderiza `CloseOrder` |
| `src/components/palm/OrderReview.tsx` | Adicionar botão "FECHAR CONTA" visível quando `existingOrderId` existe |
| `src/components/cashier/CloseOrder.tsx` | Nenhuma alteração necessária — já tem modal de impressão |

### Fluxo final

**Palm (garçom):**
- Mesa aberta → Revisão → botão "FECHAR CONTA" → Tela de pagamento (CloseOrder) → Modal "Imprimir ou não" → Fecha

**PDV (caixa):**
- Seleciona pedido → "FECHAR MESA" → Pagamento → Modal "Imprimir ou não" → Fecha
- Botões PEDIDO/CONTA/ACRÉSCIMO → Modal "Deseja imprimir?" → Imprime ou cancela

