
## Reformular cupom do BALCÃO + opção "imprimir senha"

Deixar o cupom da senha (BALCÃO) com layout estilo recibo de caixa, como na foto, e adicionar um toggle em Configurações para ligar/desligar a impressão automática da senha.

### 1. Novo layout do cupom SENHA (`receipt-layout.ts` + `receipt-html.ts`)

Sequência de blocos (substitui o bloco SENHA atual):

```text
        SENHA: 146                ← grande, negrito, centralizado
     PLANO B ESPETARIA            ← headerText
   Data: 20/04/2026 13:34         ← data + hora
   Venda: 114162                  ← últimos 6 dígitos do order.id
   Vendedor: BALCÃO
   Caixa:    <waiterName>
   Cliente:  CONSUMIDOR FINAL     ← ou nome do cliente, se houver
============================================
Qtd   Item                Unit       Total
============================================
2     COCA COLA ZERO 500ML 10,00     20,00
1     STROGONOFF CARNE     40,00     40,00
1     STROGONOFF CAMARÃO   45,00     45,00
--------------------------------------------
                          TOTAL R$  140,00
============================================
        Obrigado pela preferência!
```

Mudanças técnicas:
- Novos blocos no `LayoutBlock`: `senhaTitle` (linha "SENHA: 146" grande no topo) e `itemTable` (linha tabular com qtd/nome/unit/total alinhados em 4 colunas monoespaçadas).
- Em `createReceiptLayoutModel`, no ramo `docType === "SENHA"`:
  1. `senhaTitle` no topo (antes do título do estabelecimento).
  2. Título (header) menor abaixo.
  3. Linhas info: Data, Venda (ID curto), Vendedor=BALCÃO, Caixa=waiterName, Cliente.
  4. Cabeçalho da tabela (`Qtd | Item | Unit | Total`).
  5. Itens via `itemTable` com `product_price` e `subtotal` (agora com preço, não só nome).
  6. Linha TOTAL.
  7. Footer.
- `renderBlocksToHtml`: renderizar `senhaTitle` com fonte ~`f.senha * 0.6` (grande mas cabendo), e `itemTable` em grid CSS 4 colunas (`grid-template-columns: 2.5em 1fr 4em 4em`) para alinhar como na foto.
- ESC/POS (`thermal-printer.ts` `renderLayout`): tratar os 2 novos blocos com padding fixo de espaços (Courier monoespaçada) para sair igual no papel.

### 2. Atualizar chamadas de `printSenha` para passar mais dados

`src/lib/print-receipt.ts` → `printSenha(senha, items, opts?)`:
- Aceitar `opts: { waiterName?, orderId?, customerName?, total? }`.
- `buildSenhaHtml` recebe os mesmos campos extras.

Atualizar callers:
- `OrderSuccess.tsx`: passar `waiterName` (do contexto), `orderId` (passar via prop nova), `total` (somar do cart) e `customerName` (opcional, hoje não existe → usa "CONSUMIDOR FINAL").
- `OrderReview.tsx` (que renderiza `OrderSuccess`): passar `waiterName` e `orderId` resultante do `create_order`.
- `PrintConfigPanel.tsx` preview: passar dados de exemplo (Venda 114162, Caixa "Carlos", total).

### 3. Toggle "Imprimir senha do balcão"

`print-config.ts`:
- Adicionar `printSenhaEnabled: boolean` (default `true`) ao `PrintConfig` e `DEFAULT_CONFIG`.
- Mergear no `loadPrintConfig`/`syncPrintConfigFromDb` como os outros campos.

`PrintConfigPanel.tsx` (aba Configurações):
- Novo `Switch` "Imprimir senha automaticamente no BALCÃO" perto dos toggles de visibleSections.

`OrderSuccess.tsx`:
- No `useEffect` de auto-print, checar `loadPrintConfig().printSenhaEnabled` antes de chamar `printSenha`. Botão "Imprimir novamente" continua funcionando manualmente independente do toggle.

`print-receipt.ts` `printSenha`:
- Se `printSenhaEnabled === false` e a chamada veio do auto-print → retornar `false` cedo. (O botão manual passa um flag `force: true` para ignorar o toggle.)

### 4. Testes

Adicionar em `src/lib/__tests__/`:
- `receipt-layout.senha.test.ts`: garante que blocos SENHA contêm `senhaTitle`, header com data, linhas Vendedor/Caixa/Cliente, e `itemTable` com preços.
- Atualizar `senha.test.ts` se necessário (formato `#001` continua o mesmo na UI; no cupom mostramos o número puro "146" → ajustar para tirar o `#` só na exibição do cupom, mantendo `#146` na UI do TableGrid).

### Arquivos afetados
- `src/lib/print-config.ts` — campo `printSenhaEnabled`
- `src/lib/receipt-layout.ts` — novos blocos + ramo SENHA reescrito
- `src/lib/receipt-html.ts` — render dos novos blocos + CSS de grid
- `src/lib/thermal-printer.ts` — render ESC/POS dos novos blocos
- `src/lib/print-receipt.ts` — assinatura `printSenha` + checagem do toggle
- `src/components/palm/OrderSuccess.tsx` — passar dados extras + respeitar toggle
- `src/components/palm/OrderReview.tsx` — propagar `orderId`/`waiterName` para `OrderSuccess`
- `src/components/admin/PrintConfigPanel.tsx` — Switch novo + preview com dados completos
- `src/lib/__tests__/receipt-layout.senha.test.ts` — novo

### Notas
- Sem mudanças de banco.
- "CONSUMIDOR FINAL" é hardcoded por enquanto (fluxo do BALCÃO hoje não captura cliente). Se quiser, futuramente conectamos ao mesmo input de cliente do PDV.
- O número da venda vem dos últimos 6 dígitos hex do `order.id` para caber na linha.
