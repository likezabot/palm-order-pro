

# Popup de grupos com adição múltipla (escalável)

## Problema

Hoje o popup fecha a cada escolha (`setOpenGroup(null)` + `handleAdd(product)`). Para somar 3 águas, o garçom abre 3 vezes.

## Comportamento desejado

- Tocar numa variante soma +1 e **mantém o popup aberto**.
- Pode tocar várias vezes na mesma variante ou alternar entre variantes (ex.: 2 águas + 1 água com gás).
- A badge preto/branco ao lado do preço atualiza em tempo real a cada toque (já anima via `animate-badge-pop`).
- Popup fecha **só** quando o usuário toca fora, no X ou aperta Esc — comportamento padrão do `Dialog`.
- Esgotado e não-cadastrado continuam bloqueados como hoje.

## Mudança técnica (mínima)

**`src/components/palm/MenuView.tsx`** — `onPick` do `GroupVariantDialog`:
```ts
// antes
onPick={(_name, product) => {
  setOpenGroup(null);   // ← remove
  handleAdd(product);
}}
// depois
onPick={(_name, product) => {
  handleAdd(product);   // só soma; popup permanece aberto
}}
```

Só isso. Como `getQty` é passado reativamente (depende do `cart` no escopo do `MenuView`), a badge dentro do popup re-renderiza automaticamente a cada `handleAdd`.

## O que NÃO muda

- `GroupVariantDialog.tsx` permanece como está (já está pronto para múltiplos taps — o `onClick` em cada linha não fecha nada).
- Lógica de cards simples, controles `(-)`, badges, busca, tabs.
- Esgotado-confirm, ordenação, RPC, runtime global, impressão, Telegram.

## Bônus de UX (opcional, dentro do mesmo escopo)

Para reforçar visualmente que é multi-add, adicionar uma **micro-dica** abaixo do título do popup:
- Texto pequeno em `text-[11px] text-muted-foreground/60`: "Toque para adicionar · feche quando terminar".
- Aparece só na primeira abertura por sessão (flag em `sessionStorage: 'group-multi-hint-seen'`) — depois some para não poluir.

Se preferir manter 100% silencioso e sem hint, é só dizer.

## Validação

1. Abrir grupo "Água" → tocar 3× em "Água sem gás" → badge mostra ④①②③ animando, popup permanece.
2. No mesmo popup, tocar 2× em "Água com gás" → ambas as variantes mostram badge.
3. Tocar fora ou no X → popup fecha; cards do grupo na grade não mostram badge unificada (cada variante é um produto separado, comportamento atual preservado).
4. Reabrir o grupo → badges aparecem com as quantidades já adicionadas.
5. Esgotado segue bloqueado (botão `disabled`).

## Arquivos modificados

- `src/components/palm/MenuView.tsx` — 1 linha removida (`setOpenGroup(null)`).
- (opcional) `src/components/palm/GroupVariantDialog.tsx` — adicionar a micro-dica no header.

## Resultado

Garçom escala pedidos rapidamente: abre o grupo uma vez, toca quantas vezes precisar em cada variante, fecha no fim. Zero atrito, zero re-abertura.

