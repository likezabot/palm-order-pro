

# Plano B Espetaria — Sistema de Atendimento

## Design System
- Dark theme: fundo `#0D0D0D`, cards `#1A1A1A`, destaque `#E25822` (laranja brasa)
- Tipografia Inter, botões mín. 18px/56px altura, texto mín. 14px
- Bordas 12px, transições 150ms, feedback visual imediato

## Banco de Dados (Supabase/Lovable Cloud)
- Tabelas: `products`, `orders`, `order_items`
- Realtime ativado em `orders` e `order_items`
- Seed completo com todo o cardápio (Refeições, Espetos, Bebidas, Cervejas)
- RLS policies para acesso seguro

## Módulo 1 — Tela Inicial
- 4 botões grandes centralizados: Atendimento/Palm, Painel Cozinha, Caixa, Admin
- Logo/nome "PLANO B ESPETARIA" no topo

## Módulo 2 — Atendimento (Palm/Celular)
- **2A**: Campo mesa/nome + botão "INICIAR PEDIDO"
- **2B**: Abas de categoria horizontais + grid 2 colunas de produtos + botão flutuante do carrinho
- **2C**: Revisão com +/- quantidade, observações, remover, total e "FINALIZAR PEDIDO"
- Confirmação visual verde + retorno automático em 2s
- Vibração háptica ao adicionar item

## Módulo 3 — Painel Cozinha (PC)
- Kanban 3 colunas: Novos (laranja) → Em Preparo (amarelo) → Finalizados (verde)
- Atualização em tempo real via Supabase Realtime
- Som de notificação ao chegar pedido novo
- Horário do pedido visível, botões para mover entre colunas

## Módulo 4 — Caixa
- Lista de mesas abertas com total e botão "FECHAR"
- Tela de fechamento: itens + seleção de pagamento (Dinheiro/PIX/Cartão)
- Cálculo automático de troco para dinheiro
- Confirmar pagamento arquiva o pedido

## Módulo 5 — Admin
- CRUD de produtos: nome, preço, categoria, ativo/inativo
- Lista simples com editar/excluir
- Botão "+ NOVO PRODUTO"

## Impressão
- Simulação via `window.print()` com cupom formatado (cabeçalho, itens, total)

## PWA
- `manifest.json` configurado para instalação standalone
- Service Worker básico para cache de assets (com proteções para não interferir no preview do Lovable)
- Nota: funcionalidades PWA (offline, instalação) funcionam apenas na versão publicada

## Organização
- Componentes reutilizáveis e bem separados por módulo
- Rotas: `/`, `/palm`, `/kitchen`, `/cashier`, `/admin`

