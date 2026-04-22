

# Refinar design do cardápio (PDV)

Refatorar `src/components/palm/MenuView.tsx` para uma aparência mais profissional, compacta e operacionalmente rápida. Sem mexer em lógica de pedido, backend, fluxo de variações ou estrutura de categorias.

## 1. Remover badge "GRUPO"
- Apagar o `<span>Grupo</span>` absoluto no card de grupo.
- Trocar o "Toque para escolher" pelo subtítulo discreto **"Ver opções · {N} {tamanho|opção}"** abaixo do nome (texto small, `text-muted-foreground`).
- Card continua clicável e abre `GroupVariantDialog` igual hoje.

## 2. Esgotados — visual neutro, não competitivo
- Trocar `border-destructive/40` + `bg-card/60` por `bg-muted/30 border-border` com **`opacity-60`** no card todo.
- Remover o badge vermelho "ESGOTADO". Substituir por texto pequeno `text-muted-foreground italic` → **"Indisponível"**.
- Botão de ação fica **desabilitado** (cinza, `cursor-not-allowed`, sem `onClick` no esgotado — remove o fluxo `EsgotadoConfirmDialog` desse caminho? **Manter** o dialog existente porque às vezes garçom força adicionar; mas visual desabilitado por padrão. Clicar mostra o confirm como hoje).
  - Nota: para preservar comportamento, mantemos `onClick={handleAdd}` mas estilo "desabilitado" — o confirm dialog continua sendo o gate.

## 3. Reordenação automática
- Após `sortByPersistedOrder`, aplicar `sort estável`: `available` primeiro, `esgotado` no fim.
- Esgotados de grupos ficam no final junto com produtos esgotados.

## 4. Botão "Adicionar" forte
- Substituir o `+ ADD` / `+ Adicionar` por um botão real no rodapé do card:
  - Largura 100%, altura confortável (`py-2`), `bg-primary text-primary-foreground font-bold rounded-lg`.
  - Texto: **"Adicionar"**.
  - Esgotado: `bg-muted text-muted-foreground cursor-not-allowed` com texto **"Indisponível"**.
- Card vira `<div>` (não mais `<button>` externo). Apenas o botão é clicável (mais previsível). O `−` continua no canto superior esquerdo quando `qty > 0`.
- Para **grupos**, botão vira **"Ver opções"** com mesmo estilo primary.

## 5. Hierarquia visual
- Nome: `font-bold text-base text-foreground`.
- Preço: `text-base font-extrabold text-primary` (cor laranja sólida em vez de gradiente, mais limpo).
- Botão como ação principal abaixo.
- Espaçamento consistente: `gap-1.5` interno, `p-2.5`.

## 6. Cards mais compactos
- Reduzir grid `minmax(150px,1fr)` → `minmax(140px,1fr)` e `gap-2` → `gap-1.5`.
- Padding do card `p-3` → `p-2.5`.
- Remover `mt-auto pt-2` desnecessários.

## 7. Aba ativa mais clara
- Aba ativa: underline mais grosso (`h-[3px]` → `h-[4px]`), `bg-primary/5` no fundo da aba ativa.
- Inativa: `text-muted-foreground/70`, hover `text-foreground`.

## 8. Texto de variações
- Já tratado no item 1: substituir "Toque para escolher" por **"Ver opções"** (no botão) e contagem no subtítulo.

## 9. Feedback ao adicionar
- Manter o badge de quantidade com `animate-badge-pop` (já existe).
- Adicionar uma classe `active:scale-95` no botão Adicionar para microfeedback tátil.

## 10. Compatibilidade tema claro/escuro
- Usar tokens semânticos (`bg-muted`, `text-muted-foreground`, `border-border`, `bg-primary`) — sem hex hardcoded. Tudo já vem do `index.css`.

## Arquivos modificados
- `src/components/palm/MenuView.tsx` — única mudança. Refatora cards de produto e cards de grupo, abas, e ordenação.

## Não alterado
- `GroupVariantDialog`, `EsgotadoConfirmDialog`, `CartFab`, hooks de estoque/receitas, lógica de busca, fluxo de pedido, backend.

