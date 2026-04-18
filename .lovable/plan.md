

## Diagnóstico

Os botões "PREPARAR" / "PRONTO" do Painel Cozinha não respondem. Console mostra:
> Function components cannot be given refs. Check the render method of `Kitchen` / `KanbanColumn`.

**Causa raiz:** `KanbanColumn.tsx` define `KanbanColumn` e `KanbanCard` como componentes funcionais simples (sem `forwardRef`). Algo está passando `ref` para eles. Olhando o código atual, **não há `ref` explícito sendo passado** — então o aviso está vindo de outra coisa: provavelmente `pulseNew` está sendo passado mas o React está reclamando de outra prop.

Mas o **problema funcional real** (botões não clicáveis) é diferente: no mobile, o `Kitchen` agora usa `md:h-screen` + grid `overflow-y-auto` no mobile, mas as **3 colunas estão empilhadas em `grid-cols-1`** dentro de um container com `flex-1`. O `flex-1` sem `min-h-0` num pai `flex-col` faz o grid esticar e os cliques caem no lugar errado por causa do FAB ou de `pointer-events`.

Olhando a tela enviada (screenshot mostra o pedido visível mas botão "▶ PREPARAR" no rodapé): provavelmente o botão está **atrás do FAB do carrinho** (`fixed bottom-5 right-5`) — mas Kitchen não tem FAB. Então é outra coisa.

**Hipótese mais provável (precisa confirmar lendo o arquivo atual):** depois das últimas mudanças, o container do botão pode estar com `overflow-hidden` cortando a área de toque, ou o card inteiro recebeu um handler que captura o clique antes do botão. Preciso reler `KanbanColumn.tsx` e `Kitchen.tsx` na versão atual para diagnosticar com precisão antes de propor a correção.

## Plano

### Passo 1 — Investigar o estado atual dos arquivos
Reler `src/pages/Kitchen.tsx` e `src/components/kitchen/KanbanColumn.tsx` (versões atuais após as últimas edições) para identificar:
- Se há algum `onClick` no card que faz `stopPropagation` ou conflita
- Se o botão está dentro de uma área com `pointer-events-none`
- Se a função `updateStatus` está realmente sendo chamada (adicionar log temporário se necessário)
- Origem do warning de `ref` (algum wrapper passando ref indevidamente)

### Passo 2 — Corrigir o handler do botão
Garantir que:
- `onClick` do botão chame `e.stopPropagation()` para não vazar pro card
- `updateStatus` use `await` corretamente e invalide a query
- Botão não esteja dentro de elemento com `pointer-events-none` ou `disabled`

### Passo 3 — Eliminar o warning de ref
Se algum componente estiver recebendo `ref` indevidamente (provável vindo de `KanbanColumn` sendo filho direto de algo que injeta ref), envolver com `React.forwardRef` ou remover o ref.

### Passo 4 — Garantir feedback visual
Manter `playFeedback("click")` antes do `await` para dar resposta tátil imediata, mesmo se a rede estiver lenta.

### Arquivos afetados
| Arquivo | Mudança |
|---|---|
| `src/components/kitchen/KanbanColumn.tsx` | Adicionar `e.stopPropagation()` no onClick do botão; envolver em `forwardRef` se necessário |
| `src/pages/Kitchen.tsx` | Garantir que `updateStatus` funcione e tratar erros (toast) |

### Validação
1. Abrir Painel Cozinha no celular
2. Clicar em "▶ PREPARAR" num pedido NOVO → deve mover para EM PREPARO
3. Clicar em "✅ PRONTO" → deve mover para FINALIZADOS
4. Console limpo (sem warnings de ref)

