

# Plano: Corrigir Loop Infinito de Impressão na PrintStation

## Problema
O `useEffect` na linha 48 tem `[fetchOrders, autoPrint]` como dependências. Quando `autoPrint` muda ou o efeito re-executa, uma nova subscription Realtime é criada sem que a anterior seja devidamente removida a tempo, causando chamadas duplicadas de `handlePrint`. Além disso, `handlePrint` não é memoizado e é recriado a cada render.

## Correção (apenas `src/pages/PrintStation.tsx`)

1. Adicionar `useRef` ao import (linha 1)
2. Criar `printedOrdersRef = useRef<Set<string>>(new Set())` no componente
3. No callback do Realtime (linha 62), antes de chamar `handlePrint`:
   - Verificar `if (printedOrdersRef.current.has(newOrder.id)) return;`
   - Adicionar `printedOrdersRef.current.add(newOrder.id);`
   - Só então chamar `setTimeout(() => handlePrint(newOrder), 1000);`
4. Memoizar `handlePrint` com `useCallback` para evitar re-criações desnecessárias
5. Usar `useRef` para `autoPrint` dentro do callback do Realtime para evitar re-subscrições

| Arquivo | Mudança |
|---|---|
| `src/pages/PrintStation.tsx` | Adicionar guard com `useRef<Set<string>>` + memoizar handlePrint |

Nenhuma outra alteração será feita — design, rotas e funcionalidades permanecem intactos.

