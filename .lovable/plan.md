## Contexto

A estrutura solicitada já existe em grande parte:
- 4 layouts distintos (`PEDIDO`/dine-in, `SENHA`/balcão, `DELIVERY`, `ACRESCIMO`) já implementados em `src/lib/receipt-layout.ts`.
- Bloco de debug/fingerprint (`ENGINE/APP/PATH/ORDER/SVC`) **já está removido** — `pushFingerprint()` é no-op.
- Nomes de item já vão em MAIÚSCULAS, valores no formato `R$ 00,00`, UUID nunca renderizado (usa `orderShortId`).

Faltam polimentos para deixar bonito e bater 100% com o brief. Tudo confinado a 3 arquivos: `receipt-layout.ts`, `receipt-html.ts`, `thermal-printer.ts`.

## Mudanças por talão

### Tipo 1 — MESA / Dine-in
- Adicionar pequeno selo `MESA` acima do banner grande `MESA 5` (ou só usar o nome completo no banner — manter como está se já estiver legível).
- Garantir que `PAGAMENTO` só apareça se houver método informado (já está).
- Remover o `cfg.footerText` (Obrigado pela preferência) — confirmar que dine-in não emite `footer` (já não emite).
- Total em destaque: hoje é `kvLine` bold `+2px` — promover a um bloco `total` real (texto maior ainda) ou manter `kvLine` bold mas aumentar destaque visual.

### Tipo 2 — BALCÃO / SENHA
- **SENHA precisa ser GRANDE no topo.** Hoje usa `senhaTitle` que renderiza a `senha*0.55` (pequeno). Trocar por:
  - linha 1: `rawLine` centralizado pequeno: `SENHA`
  - linha 2: bloco `senha` grande (usa `f.senha` = fonte enorme) com só o número (ex: `042`).
- Banner abaixo da senha: `BALCÃO / RETIRADA`.
- Rodapé: manter `RETIRE NO BALCÃO` centralizado, mas em bold/maior.

### Tipo 3 — DELIVERY
- Manter banner `DELIVERY` grande.
- Reordenar: cliente → telefone → endereço (linha cheia + bairro + complemento + referência) → data/hora.
- Adicionar `noteBlock` para observações se `generalNote` presente (já tem).
- Rodapé com `cfg.footerText` (Obrigado pela preferência) só aqui — já está.

### Tipo 4 — ACRÉSCIMO
- Banner `*** ACRÉSCIMO ***` ou só `ACRÉSCIMO` grande (já tem, simplificar visual).
- Mostrar mesa + horário do acréscimo.
- Listar **só** os novos itens (já listado a partir de `input.items`, que no fluxo `delta` traz só os novos).
- Subtotal dos novos itens com label `SUBTOTAL ACRÉSC.` (já existe).

## Polimento visual (CSS — `receipt-html.ts`)

- `.bullet-item`: aumentar `padding` vertical para 5px e `font-weight` 700 → cozinha lê mais rápido.
- `.section-header`: adicionar borda inferior fina `1px solid #000` para separar visualmente (mais "section divider" sem precisar de `<hr>` extra).
- `.senha-num`: garantir `font-size = f.senha` (já está) e `letter-spacing 4px`.
- `.kv-line` bold: subir tamanho do TOTAL para ficar realmente em destaque (`f.total + 2px`).
- `.banner` (RETIRADA/DELIVERY/ACRÉSCIMO): manter centralizado, double height.

## Polimento ESC/POS (`thermal-printer.ts`)

- Já espelha todos os blocos. Apenas ajustar:
  - `bulletItem`: o `*` ASCII fica feio — trocar por `> ` ou `- ` para parecer marcador limpo no papel térmico (preview HTML segue com `•`).
  - `senha`: garantir `size(true, true)` e feed antes/depois (já tem).
  - Em `kvLine` bold do TOTAL: usar `size(true, true)` em vez de só `size(false, true)` para destaque maior na cozinha.

## O que NÃO muda

- Nada em `print-dispatcher.ts`, `print-receipt.ts`, `print-service.ts`.
- Nenhuma RPC, schema ou edge function.
- `print-engine.ts` continua exportando `PRINT_ENGINE_VERSION` (usado em logs internos), mas nada disso aparece no papel.
- Largura sempre 80mm/48 cols (suporte 58mm preservado para retrocompatibilidade).

## Validação

1. Abrir `OrderEditorPreview` para um pedido de cada tipo (mesa, balcão, delivery, acréscimo) e conferir visualmente.
2. Rodar `vitest run src/lib/__tests__/receipt-layout.test.ts` — testes existentes não devem quebrar.
3. Imprimir teste real via bridge — confirmar que nenhuma linha `ENGINE:`/`APP:`/`PATH:`/`ORDER:`/`SVC:` sai no papel.

## Risco

Baixo. Mudanças confinadas a renderização. Nenhum dado, RPC ou contrato externo afetado.
