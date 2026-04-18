

## Plano: Cardápio Palm cabe inteiro na tela (sem rolagem)

**Contexto:** O `MenuView` hoje tem `min-h-screen` + grid fixo `grid-cols-2 gap-3 p-3` + cards `min-h-[112px]`. Em telas mais baixas (ou com mais de 4 produtos por categoria) sobra rolagem vertical. O usuário quer que **tudo do cardápio** caiba sem rolagem, adaptando-se automaticamente à altura do dispositivo. **Apenas a tela "Fechar conta" (CloseOrder) deve continuar rolando.**

### Estratégia: layout em 3 zonas com altura fixa + grid auto-fit que rola só dentro da zona de produtos

```text
┌─────────────────────────────┐
│ HEADER (sticky, altura fixa)│  ← Voltar/Mesa + Busca + Tabs categoria
├─────────────────────────────┤
│                             │
│  GRID DE PRODUTOS           │  ← flex-1, overflow-y-auto INTERNO
│  (cards auto-redimensionam) │     (rola só se passar do limite extremo)
│                             │
├─────────────────────────────┤
│ FAB carrinho flutuante      │  ← ancorado, fora do fluxo
└─────────────────────────────┘
```

### Mudanças em `src/components/palm/MenuView.tsx`

1. **Container raiz** — trocar `min-h-screen flex-col pb-24` por `h-[100dvh] flex-col overflow-hidden` (usa `dvh` = dynamic viewport, ignora barra de endereço do mobile).

2. **Header** — remover `sticky top-0`; vira `shrink-0` simples (altura natural). Compactar levemente (`p-3` → `p-2.5`, `mb-2` → `mb-1.5`) para liberar mais espaço aos cards.

3. **Zona de produtos (grid)** — envolver os 3 blocos de grid (subgroups, produtos, mensagem vazia) num único `<div className="flex-1 min-h-0 overflow-y-auto px-3 pt-2 pb-2">`. A rolagem fica isolada aqui — como queremos que tudo caiba, na maioria dos casos não vai aparecer barra; mas se o cardápio for enorme num celular pequeno, ela aparece **dentro** da seção (não vira scroll global).

4. **Cards adaptativos** — substituir `grid-cols-2 ... min-h-[112px]` por:
   - Grid responsivo: `grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2`
   - Remover `min-h-[112px]` dos cards
   - Reduzir padding interno: `p-4` → `p-3`
   - Texto continua legível (`text-base` mantido = 16px, atende o min do projeto).
   
   Resultado: em telas estreitas mantém 2 colunas; em tablets pode virar 3-4 automaticamente, encolhendo a altura por linha.

5. **FAB carrinho** — mantém `fixed bottom-5 right-5` (já está fora do fluxo). Sem mudança.

6. **Diálogos (Porco, Subgrupo, Renomear)** — sem mudança, já têm `max-h-[85vh]` com scroll interno.

### O que NÃO muda
- `CloseOrder.tsx` — continua com `min-h-screen` e rolagem padrão (única tela que pode rolar, por pedido do usuário).
- `OrderReview`, `TableGrid`, `OrderSuccess` — fora do escopo.
- Lógica de dados, busca, favoritos, popup Porco — intactos.
- Tamanhos de fonte ≥14px e botões com área ≥48-56px de toque preservados.

### Arquivos afetados
| Arquivo | Mudança |
|---|---|
| `src/components/palm/MenuView.tsx` | Container `h-[100dvh] overflow-hidden` + zona scroll interna + grid `auto-fill,minmax(150px,1fr)` + padding compactado |

Sem novos arquivos, sem migrations, sem dependências.

### Validação
1. Abrir Palm → Mesa → Cardápio em celular pequeno (360×640): tudo (header, busca, tabs, grid completo de Espetos) cabe sem barra de rolagem global.
2. Mudar para Bebidas (subgrupos): 8 quadrados cabem sem rolar.
3. Em tablet (768×1024): cards expandem para 3-4 colunas automaticamente.
4. Abrir "Fechar conta" com muitos itens: continua rolando normalmente.
5. FAB carrinho fica visível e clicável em todos os casos.

