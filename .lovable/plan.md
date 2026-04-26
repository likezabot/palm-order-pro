## Objetivo
Remover o toast "X itens adicionados / Último: …" que aparece ao tocar no botão "+" dos cards no cardápio público. O FAB do carrinho já mostra quantidade e total, então o toast é redundante.

## Escopo (somente visual/UX, zero lógica)
Arquivo único: `src/pages/PublicMenu.tsx`

### Alterações na função `quickAdd` (linhas ~196–235)
- **Manter intacto:** `cart.add(p, 1, "")` — a lógica do carrinho não muda.
- **Manter intacto:** o toast de modo preview (`"Modo preview: ações de pedido estão desativadas."`) — esse é informativo e necessário.
- **Remover:** todo o bloco de batching (`quickAddBatchRef`, `setTimeout`, e a chamada `toast.success(...)` com id `"quick-add-batch"`).
- **Remover:** o comentário explicativo do batching (linhas 196–198), já que deixa de existir.
- **Remover:** o `useRef` de `quickAddBatchRef` se não for mais usado em outro lugar do arquivo (vou conferir antes de apagar).
- Se após a remoção o import de `useRef` ficar sem uso, removê-lo do import do React.

### Resultado da função
```ts
const quickAdd = (p: PublicProduct) => {
  if (isPreview) {
    toast.info("Modo preview: ações de pedido estão desativadas.", {
      id: "preview-disabled",
    });
    return;
  }
  cart.add(p, 1, "");
};
```

## Fora de escopo (NÃO mexer)
- Lógica do carrinho (`use-palm-cart`, `public-cart`).
- Outros toasts do sistema (upsell, erros, checkout).
- Supabase, Edge Functions, RLS.
- Impressão, bridge, Electron, EXE, print_jobs, payloads.
- Rotas, handlers de checkout, FAB do carrinho.

## QA
1. Tocar no "+" de um produto → nenhum toast aparece, FAB atualiza contagem/total.
2. Tocar várias vezes seguidas → continua sem toast, FAB acumula corretamente.
3. Modo preview → ainda mostra o toast informativo de preview.
4. Abrir carrinho, alterar categoria, buscar produto → fluxos inalterados.

## Arquivos alterados
- `src/pages/PublicMenu.tsx` (única edição)
