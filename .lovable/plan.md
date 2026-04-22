

## Porco no grupo + seletor de grupo/popup ao criar produto

### O que muda

**1. PALM — card "Porco" identificado como grupo**

Hoje o card especial "Porco" aparece na grade de Espetos como um card normal qualquer, sem indicar que abre o popup com 3 variantes. Mudanças no `MenuView.tsx`:

- Card do Porco ganha selo visual `🐷 GRUPO` no canto + linha "3 variantes" abaixo do preço.
- Borda do card usa `border-primary/40` (em vez de `border-border`) e fundo sutil `bg-primary/5` para destacar como agrupador.
- Texto "Escolher tipo" trocado por "Toque para escolher" deixando claro que abre seleção.

Resultado: o card Porco fica visualmente "do lado" das outras variantes na grade de Espetos, mas claramente identificado como o gatilho do grupo (já que Panceta/Costela continuam escondidas da grade — elas só vivem dentro do popup).

**2. Admin Cardápio — seletor "Grupo / Popup" no formulário de produto**

`ProductForm.tsx` ganha um novo campo abaixo do seletor de categoria:

```
Categoria: [Refeições] [Espetos] [Bebidas] [Cervejas]
Grupo / Popup (opcional):
  ( ) Nenhum (item normal no cardápio)
  ( ) 🐷 Grupo Porco — aparece dentro do popup ao tocar em "Porco"
```

- Só aparece quando `category === "espetos"` (único grupo existente hoje). Se no futuro forem criados outros grupos, ficam disponíveis automaticamente.
- Implementação **sem mudança de schema**: o "grupo" é determinado pelo nome do produto. Selecionar "Grupo Porco" preenche/sugere o nome com prefixo apropriado e adiciona o produto à lista `PORCO_GROUP_NAMES` em `src/lib/porco-group.ts` apenas se o nome bater com um dos 3 nomes canônicos (Porco, Panceta suína, Costela suína).
- Para suportar **adicionar uma 4ª variante futura** (ex: "Linguiça suína" no popup do Porco), introduz uma tabela leve `product_groups` em settings: chave `porco_group_extra_names` armazenando array de nomes adicionais. `getPorcoGroupProducts` passa a ler essa lista + a constante base.
- Quando o usuário escolhe "Grupo Porco" e o nome digitado não está no canônico, o sistema:
  1. Salva o produto normalmente (`category=espetos`, `active=true`).
  2. Adiciona o nome ao `settings.porco_group_extra_names` (upsert).
  3. Atualiza `HIDDEN_ESPETO_NAMES` em runtime (vira reativo via `useQuery`) para esconder o item da grade principal — ele só aparece via popup.

**3. Estoque — seletor "Grupo / Popup" ao criar item solto**

`ItemFormDialog.tsx` ganha o mesmo seletor quando o item é vinculado a produto da categoria Espetos. Apenas reflete o vínculo com o produto — não duplica lógica.

### Esclarecimento técnico

- **Hoje**: `PORCO_GROUP_NAMES` é uma constante hard-coded de 3 nomes. Banner em Admin/Estoque e popup em PALM dependem dessa lista.
- **Depois**: a lista vira **constante base + lista dinâmica vinda de `settings`**. Permite ao usuário, no formulário de produto, jogar novos itens dentro do mesmo popup sem mexer em código.
- Migração: nova linha em `settings` com `key='porco_group_extra_names'` e `value=[]` (array vazio). Sem alteração de tabelas existentes.

### Arquivos

**Editados**
- `src/components/palm/MenuView.tsx` — card Porco com selo/borda de grupo.
- `src/components/admin/ProductForm.tsx` — adiciona seletor "Grupo / Popup" abaixo da categoria.
- `src/components/stock/ItemFormDialog.tsx` — espelha o seletor quando item é vinculado a Espetos.
- `src/lib/porco-group.ts` — `getPorcoGroupProducts` passa a aceitar lista extra; novo helper `useExtraPorcoNames` ou função `loadExtraPorcoNames()`.
- `src/components/admin/PorcoGroupBanner.tsx` — exibe variantes extras adicionadas pelo usuário.
- `src/components/stock/PorcoGroupBanner.tsx` — idem.

**Novo**
- Migração SQL: `INSERT INTO settings (key, value) VALUES ('porco_group_extra_names', '[]'::jsonb) ON CONFLICT DO NOTHING;`

### O que NÃO muda
- Schema das tabelas `products`, `inventory_items`, `orders`. Lógica de carrinho, esgotado, impressão, RLS, fluxo de admin (drag/drop, busca, filtros, bulk).
- Categorias do cardápio continuam as mesmas 4 (Refeições, Espetos, Bebidas, Cervejas).
- Os 3 nomes canônicos do Porco continuam sempre no grupo, independente de settings.

### Pergunta antes de implementar

Quer mesmo a **opção de adicionar novos itens ao popup do Porco no futuro** (requer a entrada em `settings`), ou prefere a versão mais simples — apenas o **selo visual no card do PALM** + o **seletor "Grupo Porco" no formulário** funcionando só para os 3 nomes já existentes (Porco, Panceta suína, Costela suína), sem suportar 4ª variante?

