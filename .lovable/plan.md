

## Importar do cardápio: scroll arrumado, prévia e sincronização automática

### Problemas a resolver
1. **Não consegue rolar a lista** no celular: `ScrollArea` aninhado dentro do `DialogContent` com `max-h-[55vh]` está limitando o conteúdo numa altura que não rola corretamente em mobile. Botões "Importar/Cancelar" também ficam empilhando e ocupando espaço.
2. Sem **pré-visualização** de quem vai entrar / quem será ignorado por já ter vínculo.
3. Sem **sincronização automática**: se está no cardápio, deveria já aparecer no estoque sem precisar abrir dialog manual.

### Mudanças

**1. `ImportFromMenuDialog.tsx` — scroll + prévia**

Layout reescrito para garantir scroll no mobile e modo de pré-visualização antes de confirmar:

```text
┌──────────────────────────────────────────┐
│ Importar do cardápio              [×]    │
│ 22 disponíveis · 30 já vinculados        │
├──────────────────────────────────────────┤
│ [Selecionar todos] [Limpar] [✓ ocultar inativos] │
├── lista rolável (flex-1 min-h-0) ────────┤
│ BEBIDAS (22) — marcar todos              │
│ ☐ Água com gás                           │
│ ☐ Coca-Cola 2L                           │
│ ...                                      │
├──────────────────────────────────────────┤
│ [Cancelar]   [Pré-visualizar (5) →]      │
└──────────────────────────────────────────┘
```

Ao clicar em **Pré-visualizar**, mesma janela troca de tela mostrando:

```text
┌──────────────────────────────────────────┐
│ ← Confirmar importação                   │
├──────────────────────────────────────────┤
│ Serão criados (5)                        │
│  • Coca-Cola 2L → categoria "bebidas"    │
│  • Água com gás → "bebidas"              │
│  ...                                     │
│                                          │
│ Ignorados — já vinculados (2)            │
│  • Linguiça (já existe no estoque)       │
│                                          │
│ Sem categoria mapeada (0)                │
├──────────────────────────────────────────┤
│ [← Voltar]   [Importar 5 itens]          │
└──────────────────────────────────────────┘
```

Correções técnicas do scroll:
- Trocar `ScrollArea` por `div` com `flex-1 min-h-0 overflow-y-auto` dentro de um `DialogContent` `flex flex-col h-[85vh]` — `min-h-0` é o que permite o filho rolar dentro de um pai flex em mobile.
- Footer fica `sticky bottom-0` com fundo sólido pra não sobrepor itens.
- Header também `shrink-0`.

**2. Sincronização automática — `useAutoSyncMenuToStock` (novo hook)**

Cria um hook que roda uma vez por sessão na `Stock.tsx` (e opcionalmente na home): detecta produtos do cardápio `active=true` que ainda não têm `inventory_items` vinculado e cria os registros silenciosamente em background, com `current_stock=0`, `min_stock=0`, `product_id` setado.

Comportamento:
- Roda apenas uma vez por carregamento da página (guard com `useRef`).
- Nada de toast — silencioso.
- Log discreto no console: `[stock-sync] importados N novos itens do cardápio`.
- Reaproveita `useBulkImportFromMenu`.
- Se `inventory_items` já tem 0 itens não-vinculados pendentes, não faz nada.

Resultado: usuário abre Estoque pela primeira vez e tudo do cardápio já aparece. O dialog "Importar do cardápio" continua existindo só pra casos manuais (re-importar produto que foi deletado do estoque, etc.).

**3. `Stock.tsx` — chamar o auto-sync**

Adiciona `useAutoSyncMenuToStock()` no topo do componente. Sem mudança visual.

**4. Botão "Cardápio" no header do `Stock.tsx`**

Mantém o botão, mas renomeia label/tooltip pra **"Re-importar"** e adiciona contador discreto: `Re-importar (3 novos)` quando houver produtos pendentes. Quando 0 pendentes, botão fica desabilitado com tooltip "Tudo sincronizado".

### Arquivos

**Editados**
- `src/components/stock/ImportFromMenuDialog.tsx` — scroll arrumado + modo prévia (2 telas dentro do mesmo dialog via `useState<"select"|"preview">`).
- `src/pages/Stock.tsx` — chama `useAutoSyncMenuToStock()`; ajusta label do botão de import.

**Novos**
- `src/hooks/use-auto-sync-menu-to-stock.ts` — hook que importa silenciosamente produtos do cardápio sem vínculo, uma vez por sessão.

### Detalhes técnicos
- O `min-h-0` no container flex é essencial — sem ele, o filho com `overflow-y-auto` não calcula altura corretamente no mobile e o scroll trava (causa do bug no print).
- `DialogContent h-[85vh]` (altura fixa em vez de `max-h`) garante que o dialog ocupa altura previsível no mobile, dando espaço pra lista rolar.
- Auto-sync usa `useRef` como guard pra não disparar duas vezes em re-renders; também checa se `useMenuProductsForStock` já carregou antes de tentar.
- Prévia é puramente client-side — calcula `toCreate` (selecionados disponíveis) e `toIgnore` (selecionados que de alguma forma já apareceram como linkados, defensivo) a partir dos dados já carregados. Não faz request extra.

### O que NÃO muda
- Schema do banco, RPCs, lógica de movimentação, cardápio do garçom, PDV, impressão.
- Comportamento do `OutOfStockConfirmDialog`, modo crítico da Stock, badges.

