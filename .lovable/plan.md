

# Plano: Garçom Persistente + PDV Desktop Unificado

## Resumo

Duas melhorias principais: (1) garçom não digita nome toda hora — identificação persistente com localStorage, e (2) novo modo PDV Desktop que unifica pedidos em tempo real, impressão e caixa numa tela só.

## 1. Identificação Persistente do Garçom

**Problema**: O garçom já tem `localStorage` salvando o nome (Palm.tsx linha 13), mas a tela de TableSelect ainda exibe o campo de nome toda vez e exige preenchimento.

**Solução**: Modificar `TableSelect.tsx` e `Palm.tsx`:
- Se `waiterName` já está salvo no localStorage, **pular o campo de nome** e mostrar um banner no topo: `"Atendendo como: João"` + botão pequeno `"Trocar"`
- O campo de nome do garçom só aparece se não houver nome salvo, ou se o usuário clicar "Trocar"
- Manter o campo "Mesa / Nome do Cliente" + teclado numérico sempre visíveis

**Arquivos alterados**: `src/components/palm/TableSelect.tsx`, `src/pages/Palm.tsx`

## 2. Novo Modo PDV Desktop (`/pdv`)

Criar uma página unificada para o PC do estabelecimento que combina: fila de pedidos em tempo real + impressão + fechamento de caixa.

**Layout** (tela dividida em 2 painéis):

```text
┌──────────────────────────────┬─────────────────────────┐
│ FILA DE PEDIDOS              │ DETALHES DO PEDIDO      │
│                              │                         │
│ [Mesa 5 — João — 10:32] NEW  │ Mesa: 5                 │
│ [Mesa 2 — Ana — 10:28] PREP  │ Garçom: João            │
│ [Mesa 8 — Carlos — 10:15] OK │ Horário: 10:32          │
│                              │ ─────────────────────── │
│                              │ 2x Bovino      R$20,00  │
│                              │ 1x Skol 600ml  R$10,00  │
│                              │   OBS: gelada           │
│                              │ ─────────────────────── │
│                              │ TOTAL:         R$30,00  │
│                              │                         │
│                              │ [🖨️ IMPRIMIR]           │
│                              │ [▶ PREPARAR / ✅ PRONTO]│
│                              │ [💰 FECHAR CONTA]       │
│ ─────────────────────────────│                         │
│ 🖨️ Auto-print: [ON/OFF]     │                         │
│ Status: ONLINE ●             │                         │
└──────────────────────────────┴─────────────────────────┘
```

**Funcionalidades**:
- **Lista de pedidos** à esquerda com Realtime (mesma lógica do Kitchen + PrintStation)
- **Painel de detalhes** à direita ao clicar num pedido: itens, total, observações, horário, garçom
- **Botão IMPRIMIR**: abre `window.print()` com cupom formatado (reutiliza `printReceipt`)
- **Botão de status**: muda pedido entre `new → preparing → done` (mesma lógica do Kitchen)
- **Botão FECHAR CONTA**: abre fluxo de pagamento inline (Dinheiro/PIX/Cartão + troco automático — reutiliza lógica do `CloseOrder`)
- **Toggle auto-print**: imprime automaticamente novos pedidos (mesma lógica do PrintStation)
- **Status online/offline** do Realtime
- **Som de alerta** ao chegar pedido novo
- Badge colorido por status: laranja=novo, amarelo=preparo, verde=pronto

**Arquivo criado**: `src/pages/Pdv.tsx`

## 3. Atualizar Navegação

**`src/pages/Index.tsx`**: Adicionar botão "PDV / IMPRESSÃO" com ícone de Monitor + Printer (rota `/pdv`)

**`src/App.tsx`**: Adicionar rota `/pdv` → componente `Pdv`

## 4. Sem Alterações no Banco

Todas as tabelas e colunas necessárias já existem (`orders`, `order_items`, `waiter_name`). Realtime já está ativo na tabela `orders`. Sem migrações necessárias.

## Arquivos alterados/criados

| Arquivo | Ação |
|---|---|
| `src/components/palm/TableSelect.tsx` | Modificar — identificação persistente |
| `src/pages/Palm.tsx` | Modificar — lógica de "trocar garçom" |
| `src/pages/Pdv.tsx` | **Criar** — tela PDV desktop unificada |
| `src/pages/Index.tsx` | Modificar — adicionar botão PDV |
| `src/App.tsx` | Modificar — adicionar rota /pdv |

