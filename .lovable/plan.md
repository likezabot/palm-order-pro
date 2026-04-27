# Remodelar página /pdv

A página `/pdv` hoje tem cards de pedido com altura variável que estouram a tela em estabelecimentos com muitos pedidos abertos, e não há um caminho claro para **cancelar** um pedido (apenas avançar status ou pagar). Edição existe mas redireciona ao Palm sem aviso.

## O que vai mudar

### 1. Cards compactos com tamanho fixo (caber na tela)
- Reescrever `OrderRow.tsx` em modo **compacto**: altura fixa (~140px), padding reduzido, fontes menores no título (text-base) e no valor (text-xl).
- Remover sub-linha duplicada (badge tipo + canal vira um chip único: "🛵 ONLINE", "🛍 RETIRADA", "🍽 MESA").
- Grid responsivo mais denso:
  - Entregas: `grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5`
  - Mesas: `grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6`
- Ícones dos botões de ação (Imprimir/Editar/Avançar) reduzidos a 14px com tooltip.
- Aplicar `auto-rows-[140px]` para garantir altura uniforme — sem cards "saltando" de tamanho.

### 2. Editar pedidos com confirmação e atalho contextual
- O botão **Editar** hoje navega direto para `/palm?orderId=...`. Adicionar:
  - Tooltip claro: "Adicionar/remover itens"
  - Bloqueio visual quando `status === "done"` (pedido pronto) — exibir aviso "Pedido pronto, edição requer reabrir".
- No painel de detalhe (direito), reorganizar botões em duas linhas:
  - Linha 1: **Editar itens**, **Imprimir**, **Cancelar pedido**
  - Linha 2: **Avançar status** ou **Fechar mesa** (ação principal, destaque)

### 3. Cancelamento de pedidos (NOVO)
Backend já suporta — `update_order_status` aceita `cancelled` e o trigger limpa stats automaticamente.

- Botão **"Cancelar pedido"** vermelho no painel direito (apenas quando `status !== "done"` ou com confirmação reforçada se já preparado).
- Botão também acessível no card via menu compacto (ícone X discreto no canto, só aparece em hover/long-press).
- AlertDialog de confirmação com:
  - Aviso forte ("Esta ação não pode ser desfeita")
  - Campo opcional **motivo** (texto livre) — salvo em `orders.rejected_reason`
  - Botões "Voltar" e "Sim, cancelar pedido" (destrutivo)
- Após cancelar: chamar `supabase.rpc("update_order_status", { p_order_id, p_status: "cancelled" })`, salvar motivo via update direto em `orders.rejected_reason`, invalidar query, fechar painel, toast de sucesso.

### 4. Outras melhorias funcionais
- **Filtro rápido por tipo** no topo de cada seção (chips: Todos / Mesa / Balcão / Delivery / Retirada).
- **Contagem total de itens** no header de cada seção (ex.: "Mesas (5) · 23 itens").
- **Ordenação**: pedidos críticos (>25 min) sempre no topo, depois por horário.
- **Atalho de teclado**: tecla `Esc` fecha o painel direito; `Enter` confirma ação principal quando há pedido selecionado.
- **Painel direito sticky** em telas grandes — não rola junto com a lista.

## Arquivos afetados

```text
src/components/pdv/OrderRow.tsx          (refatorar para modo compacto + altura fixa)
src/pages/Pdv.tsx                        (grid mais denso, filtros por tipo, botão cancelar, atalhos)
src/components/pdv/CancelOrderDialog.tsx (NOVO — modal de confirmação com motivo)
src/lib/order-actions.ts                 (NOVO — helper cancelOrder(id, reason))
```

## Detalhes técnicos

**Helper `cancelOrder`:**
```ts
export async function cancelOrder(orderId: string, reason?: string) {
  const { error: e1 } = await supabase.rpc("update_order_status", {
    p_order_id: orderId,
    p_status: "cancelled",
  });
  if (e1) throw e1;
  if (reason?.trim()) {
    await supabase.from("orders").update({ rejected_reason: reason.trim() }).eq("id", orderId);
  }
}
```

**Card compacto (OrderRow):** mantém todos os estados visuais (urgência, isUnseen, selected) mas reduz padding de `p-3` → `p-2.5`, título de `text-xl` → `text-base font-black`, valor de `text-2xl` → `text-xl`. Container fixo: `h-[140px] flex flex-col justify-between`.

**Filtro por tipo:** estado local `tableFilter` e `deliveryFilter` (`'all' | 'dine_in' | 'counter' | 'delivery' | 'pickup'`), aplicado via `useMemo` no `tablesOrders`/`deliveryOrders`.

Sem migrations — usa colunas e RPCs existentes.
