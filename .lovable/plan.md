
# Página dedicada de Configurações de Impressora

## Objetivo

Criar uma página própria, acessível pelo menu principal, com formulário completo à esquerda e preview ao vivo do talão à direita. Hoje só existe um painel embutido dentro do Admin (`PrintConfigPanel`); ele continuará funcionando, mas a nova página será o ponto de acesso oficial.

## Rota e navegação

- Nova rota protegida por StaffGate: `/configuracoes/impressora` (alias `/settings/printer` redireciona para a primeira).
- Lazy-loaded em `src/App.tsx`, igual às outras páginas pesadas.
- Adicionar entrada no menu principal (`src/pages/Index.tsx` — array de tiles do home da equipe), ícone `Printer`, label "Impressora".
- Dentro do Admin, o card "Configuração da impressão" passa a mostrar um botão "Abrir página completa" que leva à nova rota (mantém o painel atual como atalho para não quebrar fluxo existente).

## Estrutura da página

```text
+----------------------------------------------------------+
| Header: < Voltar    Configurações de Impressão           |
+--------------------------------+-------------------------+
| Status da Bridge (card topo, full width)                 |
+--------------------------------+-------------------------+
| FORM (esquerda, scroll)        | PREVIEW (direita, sticky)|
| 1. Papel e Formato             | Tabs: Mesa | Balcão |   |
| 2. Cabeçalho e Rodapé          |       Delivery | Acrésc.|
| 3. Seções Visíveis             |                         |
| 4. Impressão Automática        | [ papel térmico render ]|
| 5. Avançado (collapsible)      |                         |
+--------------------------------+-------------------------+
| Footer ações: [Salvar] [Restaurar padrão]  Última: ...   |
+----------------------------------------------------------+
```

- Desktop ≥ `xl`: grid 2 colunas (`minmax(0,1fr) 420px`), preview com `position: sticky`.
- Mobile/tablet: `<Tabs>` com duas abas — "Configurações" e "Preview".

## Seções (todas as do prompt)

1. **Status da Bridge** — card topo com bolinha (verde/amarelo/vermelho), texto descritivo, URL atual, botões "Testar conexão" (chama `checkBridgeStatus`) e "Imprimir página de teste" (envia ESC/POS simples via `printTest`/rota existente). Polling a cada 10s (já implementado em `PrintConfigPanel`).
2. **Papel e Formato** — radios `paperWidth` (58mm/80mm), `printSize` (Normal/Grande), `contentAlign` (Esquerdo/Centralizado), com texto auxiliar.
3. **Cabeçalho e Rodapé** — inputs `headerText` e `footerText`, com descrição "deixe vazio para omitir".
4. **Seções Visíveis** — switches para `visibleSections.waiter`, `.date`, `.notes`, `.footer` + um novo toggle "Mostrar número do pedido" (adiciona campo `showOrderNumber` à `VisibleSections`, default true).
5. **Impressão Automática** — switches: "Imprimir automaticamente pedidos novos" (`autoPrintNewOrders`), "Imprimir senha de cozinha" (já existe como `printSenhaEnabled`), "Imprimir acréscimos automaticamente" (`autoPrintAcrescimos`). Os dois novos campos entram em `PrintConfig` com default `true` e são lidos pelo dispatcher existente quando aplicável (apenas leitura nesta entrega — wiring real fica para outra task se ainda não estiver ligado).
6. **Avançado (Accordion)** — `bridgeUrl` (input) e `printMode` (select Bridge/Navegador). Aviso de que esses dois são locais por dispositivo (já tratado em `LOCAL_ONLY_KEYS`).

## Preview ao vivo

- Tabs: Mesa, Balcão (senha), Delivery, Acréscimo.
- Reusar `createReceiptLayoutModel` + `buildHtmlFromBlocks` (igual ao `OrderEditorPreview`) com os dados fictícios do prompt:
  - Mesa 5 / João / 3 itens / R$ 66,00
  - Senha 042 / Maria / 2 itens / R$ 28,00
  - Delivery Pedro / endereço / 2 itens / taxa R$ 5 / total R$ 45,00
  - Acréscimo Mesa 5 / +1 item / R$ 12,00
- Container branco com sombra, fonte monoespaçada, largura derivada de `paperWidth`.
- `useMemo` com dependência em `cfg` faz o preview atualizar instantaneamente.

## Persistência

- `loadPrintConfig` no mount + `syncPrintConfigFromDb` em background.
- Edições atualizam estado local imediatamente; **botão "Salvar"** chama `savePrintConfig` (banco + cache), com toast.
- "Restaurar padrão" chama `resetPrintConfig`, mostra confirmação.
- Indicador "Última alteração salva: …" usa `cfg.configUpdatedAt` formatado em pt-BR.
- Auto-save por campo é removido nesta página (no painel Admin atual cada change persiste; aqui o fluxo é "edita → vê preview → salva"), evitando spam ao banco.

## Detalhes técnicos

Arquivos novos:
- `src/pages/PrinterSettings.tsx` — página, layout 2-colunas, header com voltar.
- `src/components/printer-settings/BridgeStatusCard.tsx`
- `src/components/printer-settings/PaperFormatSection.tsx`
- `src/components/printer-settings/HeaderFooterSection.tsx`
- `src/components/printer-settings/VisibleSectionsSection.tsx`
- `src/components/printer-settings/AutoPrintSection.tsx`
- `src/components/printer-settings/AdvancedSection.tsx` (não confundir com o `AdminAdvancedSection` existente — fica em outro path)
- `src/components/printer-settings/LivePreview.tsx` (tabs + render usando `createReceiptLayoutModel`)
- `src/components/printer-settings/sample-data.ts` (dados fictícios dos 4 tipos)

Arquivos editados:
- `src/App.tsx` — adicionar rotas lazy.
- `src/pages/Index.tsx` — novo tile "Impressora" → `/configuracoes/impressora`.
- `src/lib/print-config.ts` — adicionar `showOrderNumber: boolean` em `VisibleSections` (default true) e dois novos campos em `PrintConfig`: `autoPrintNewOrders` e `autoPrintAcrescimos` (default true). Atualizar `DEFAULT_CONFIG`, `DEFAULT_VISIBLE`, `normalizeConfig`, e o sanitizer do RPC (passa pelo banco). `printSenhaEnabled` já existe.
- `src/lib/receipt-layout.ts` — respeitar `visibleSections.showOrderNumber` (omitir o `kvLine` "PEDIDO" quando false). Outros toggles (waiter/date/notes/footer) — checar se já são respeitados; caso não, ajustar nos quatro layouts.
- `src/components/admin/PrintConfigPanel.tsx` — adicionar banner no topo: "Esta configuração agora tem uma página dedicada → [Abrir]". Não remover o painel.

Componentes UI usados (já existem): `Card`, `Switch`, `RadioGroup`, `Input`, `Label`, `Button`, `Tabs`, `Collapsible` (para Avançado), `Badge` (status). Toast via `sonner`.

## Comportamento esperado

- Entrada na página → carrega config → preview já renderiza.
- Toda edição: estado local muda, preview atualiza em tempo real, badge "Não salvo" aparece.
- Salvar: persiste, badge desaparece, atualiza timestamp.
- Restaurar padrão: dialog de confirmação → reset → toast.
- Bridge: bolinha verde quando `bridgeStatus.ok`, amarela enquanto checa, vermelha quando offline ou modo navegador.
- `bridgeUrl` e `printMode` permanecem locais (já tratado em `LOCAL_ONLY_KEYS`).

## Fora do escopo desta task

- Reescrever o pipeline de auto-impressão para realmente consumir `autoPrintNewOrders`/`autoPrintAcrescimos` (apenas adicionamos os toggles e os persistimos; ligação no dispatcher pode ser uma task seguinte se ainda não estiver ligado a um campo equivalente).
- Mexer em `thermal-printer.ts`, bridge, ou EXE.
- Mudar a porta da bridge (continua 9100).
