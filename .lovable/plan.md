## Objetivo

Alinhar o layout de impressão térmica ao padrão visual do recibo de referência (foto), ajustando organização, alinhamento e tamanhos de fonte. Mudanças isoladas em `receipt-layout.ts` e `receipt-html.ts` — nenhum fluxo de checkout, RPC ou lógica de pedido será tocado.

## Padrão de referência (extraído da foto)

```text
        PLANO B ESPETARIA          ← título, centralizado, bold
        --------------------
        RETIRADA                   ← banner de tipo (grande, bold)
        27/04/2026 19:29           ← data/hora simples, sem "DATA:"
        --------------------
Pedido: #2                         ← labels alinhados à esquerda
Cliente: Gustavo
Telefone: (67) 99178-2979
69eff14a15a1d872008db063           ← order id curto (hash)
        --------------------
ITENS                              ← seção label, esquerda
 • 3 x Bovino - R$ 30,00          ← bullet, qtd x nome - preço
 • 1 x Pão de alho - R$ 8,00
 • 1 x Medalhão de Frango - R$
   10,00                           ← quebra com indentação
        --------------------
PAGAMENTO
 - Forma: Cartão de Débito
 - Total: R$ 58,00
```

Características-chave:
- Título e blocos divisores centralizados; linhas de info alinhadas à **esquerda**
- Sem coluna de preço à direita — preço vem em linha junto ao nome (`qtd x nome - R$ valor`)
- Sem labels em CAIXA ALTA forçada nos valores (manter capitalização natural do nome do cliente/produto)
- Seções `ITENS` e `PAGAMENTO` aparecem como cabeçalho de bloco à esquerda, não centralizados grandes
- `Total` aparece **dentro** do bloco PAGAMENTO como linha simples (não como banner gigante)
- Bullet `•` para itens; sub-itens de pagamento usam `-`
- Espaçamento entre itens generoso (linha em branco entre eles)

## Mudanças por arquivo

### 1. `src/lib/receipt-layout.ts`

Reescrever `createReceiptLayoutModel` (mesa) e `buildDeliveryLayout`/`buildSenhaLayout` para emitirem a sequência:

1. `title` — nome da loja
2. `sep`
3. `banner` — tipo (RETIRADA / ENTREGA / MESA)
4. `info` simples sem label — `dd/mm/aaaa HH:MM`
5. `sep`
6. `info` esquerda: `Pedido: #N`, `Cliente: ...`, `Telefone: ...`
7. `info` esquerda (novo bloco `rawLine`): hash curto do order id (12-20 chars)
8. `sep`
9. `banner` pequeno alinhado esquerda: `ITENS` (novo `kind: "sectionHeader"`)
10. itens com novo formato `qtd x nome - R$ preço` numa linha só (sem coluna direita)
11. `sep`
12. `sectionHeader`: `PAGAMENTO`
13. linhas tipo ` - Forma: ...`, ` - Total: R$ ...` (novo `kind: "kvLine"` com prefixo `- `)
14. footer + fingerprint + cutMark

Novos blocos:
- `{ kind: "sectionHeader"; text: string }` — label de seção, esquerda, bold, sem fundo
- `{ kind: "rawLine"; text: string }` — linha solta esquerda (hash)
- `{ kind: "bulletItem"; text: string }` — `• {qtd} x {nome} - R$ {preço}`
- `{ kind: "kvLine"; label: string; value: string }` — `- Label: valor`

### 2. `src/lib/receipt-html.ts`

- Adicionar `case`s para os 4 novos blocos em `renderBlocksToHtml`
- Em `thermalCSS`:
  - `.info-row` → mudar `text-align` padrão para **left** (sem depender de `contentAlign`)
  - Nova classe `.section-header` (esquerda, bold, font-size = `f.total * 0.95`, margin-top maior)
  - Nova classe `.bullet-item` (esquerda, padding-left pequeno, espaçamento vertical maior)
  - Nova classe `.kv-line` (esquerda, padding-left)
  - `.banner` (RETIRADA) — manter centralizado e grande (já está), mas reduzir margem inferior
  - `.header-text` — manter como está
- Itens em formato livre permitem quebra de linha automática com indentação na continuação (como "Medalhão de Frango - R$ 10,00" quebra para a linha de baixo)

### 3. `src/lib/thermal-printer.ts` (ESC/POS)

Como `receipt-layout.ts` é fonte única, espelhar o tratamento dos 4 novos blocos no renderer ESC/POS para impressão real (não só preview HTML). Mudança puramente aditiva — blocos antigos continuam funcionando para retrocompatibilidade.

## O que NÃO será alterado

- `create_public_order` e qualquer função SQL
- Schema do banco (orders, order_items, customers)
- `PublicCheckout.tsx`, fluxo de pedido online
- `print-config.ts`, `print-dispatcher.ts`, `print-service.ts` (mantêm contratos)
- PDV, fila de impressão, kanban da cozinha
- Lógica de fingerprint (continua no rodapé)

## Validação

1. Preview HTML dos 3 docTypes (mesa, delivery, senha) abre lado a lado com a foto e bate visualmente
2. Smoke tests existentes em `src/test/` continuam verdes
3. Reprint de pedido antigo (que não tem os campos novos) ainda renderiza sem quebrar
4. Largura 58mm e 80mm ambas testadas no preview

## Risco de regressão

Baixo. Mudanças confinadas a 2 (3 com ESC/POS) arquivos de renderização. Blocos antigos preservados. Nenhuma coluna/RPC/payload alterado. Se algo sair errado, basta reverter os arquivos de layout.
