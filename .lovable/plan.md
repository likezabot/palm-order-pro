

## Botão Imprimir do Caixa → enviar à Central + perguntar tipo

Hoje o botão impressora do card no **Caixa** chama `manualPrintOrder` direto, que tenta imprimir um cupom completo localmente via bridge. Problemas:

1. Não pergunta **o que** imprimir (comanda, conta, ou últimos acréscimos)
2. Quando não há itens, mostra erro genérico "Sem itens para imprimir"
3. Não registra/encaminha para a **Central de impressão** (PrintStation) — só dispara local

### Mudanças

**1. Diálogo de escolha ao clicar 🖨 no card (Caixa)**
- Novo componente `PrintChoiceDialog` com 3 opções + cancelar:
  - **Comanda completa** (todos os itens) → `manualPrintOrder`
  - **Conta / Fechamento** (com total + "Não é documento fiscal") → `manualPrintBill`
  - **Últimos acréscimos** (delta_items) → `manualPrintDelta` *(desabilitado se não houver delta)*
- Cada opção também publica o job na Central via RPC `enqueue_print_job` (ver passo 3) **antes** de tentar local — assim a PrintStation sempre recebe.

**2. Mensagens de erro mais claras**
- "Sem itens" → "Mesa sem itens cadastrados"
- "Sem delta" → "Nenhum acréscimo recente para reimprimir"
- Sucesso local + falha central → toast informativo, não erro

**3. Sempre encaminhar à Central**
- Toda impressão manual do Caixa enfileira também via `print-queue` (IndexedDB) marcada como `source: "manual"`, garantindo que a PrintStation aberta em outra máquina veja e possa reimprimir.
- Se a bridge local responder OK, marca como concluído. Se falhar, fica na fila normal de retry.

### Fluxo final

```text
[Card Caixa] 🖨  →  [Dialog: O que imprimir?]
                       ├── Comanda completa  → enfileira + tenta bridge
                       ├── Conta             → enfileira + tenta bridge
                       ├── Acréscimos        → enfileira + tenta bridge
                       └── Cancelar
```

### Arquivos
- **Novo**: `src/components/cashier/PrintChoiceDialog.tsx`
- **Editado**: `src/pages/Cashier.tsx` — substitui `handlePrint` direto por abertura do dialog
- **Editado**: `src/lib/print-service.ts` — funções `manual*` passam a enfileirar na central antes de tentar local; mensagens de retorno mais ricas (`{ ok, reason }`)

### Detalhes técnicos
- Reaproveita `enqueuePrintJob` já existente em `print-queue.ts`
- Sem mudanças no backend/RPC — só client-side
- Sem mudanças no `.exe` da bridge — protocolo idêntico
- Botão impressora do card mostra badge se delta disponível

