

# Plano: Corrigir PWA + Adicionar Senha nos Pedidos de Balcão

## 1. PWA - Correção

O PWA não funciona no preview do Lovable porque o app roda dentro de um iframe. A instalação só funciona na versão publicada. Porém, o `manifest.json` e os ícones já estão corretos. O que falta:

- Verificar se os ícones (`icon-192.png`, `icon-512.png`) foram gerados corretamente (podem estar vazios/corrompidos)
- Regenerar os ícones com SVG inline convertido para PNG via canvas script
- O PWA funcionará apenas no site publicado (`palm-order-pro.lovable.app`), não no preview

## 2. Balcão - Adicionar Senha do Pedido

Ao criar um pedido de balcão, gerar automaticamente uma **senha numérica sequencial** (ex: #001, #002...) para identificar o pedido. Isso substitui o horário como identificador principal.

### Como funciona:
- Usar um campo `customer_name` na tabela `orders` (já existe `table_name = "BALCÃO"`)
- A senha será armazenada no campo `table_name` como `"BALCÃO"` e exibida a partir de um **contador diário** baseado nos pedidos de balcão do dia
- Alternativa mais simples: calcular a senha no frontend contando pedidos de balcão do dia + 1
- No card do balcão, exibir `#001` em destaque no lugar do horário como identificador principal

### Mudanças:

| Arquivo | Mudança |
|---|---|
| `public/icon-192.png` | Regenerar ícone PWA |
| `public/icon-512.png` | Regenerar ícone PWA |
| `src/components/palm/TableGrid.tsx` | Exibir senha `#NNN` nos cards de balcão (calculada pela posição do pedido no dia) |
| `src/components/palm/OrderReview.tsx` | Mostrar senha do pedido no header quando for balcão |
| `src/components/palm/OrderSuccess.tsx` | Exibir senha do pedido na tela de sucesso |

### Lógica da senha:
- Filtrar pedidos de balcão criados hoje (`created_at >= início do dia`)
- Ordenar por `created_at ASC`
- A posição + 1 = senha (ex: primeiro pedido do dia = #001)
- Para novo pedido: senha = total de pedidos balcão do dia + 1

