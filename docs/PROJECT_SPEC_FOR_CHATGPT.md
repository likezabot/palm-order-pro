# Projeto: Plano B Espetaria - Especificação Completa

Este documento serve como uma referência técnica exaustiva para que qualquer IA (como o ChatGPT) entenda a arquitetura, o banco de dados e as regras de negócio deste sistema de gestão para espetarias/restaurantes.

---

## 1. Visão Geral do Projeto
O **Plano B Espetaria** é um ecossistema completo para operação de restaurantes, abrangendo desde o autoatendimento do cliente até o fechamento de caixa e gestão administrativa.

### Principais Modos de Uso:
1.  **Menu Público (`/menu/:slug`)**: Interface para o cliente final ver o cardápio e fazer pedidos (delivery ou mesa).
2.  **Palm (`/palm`)**: App para garçons (comanda eletrônica) otimizado para dispositivos móveis.
3.  **Kitchen (`/kitchen`)**: Monitor de preparo para a cozinha ver pedidos em tempo real.
4.  **PDV/Cashier (`/pdv` ou `/cashier`)**: Interface de fechamento de conta e controle financeiro.
5.  **Admin (`/admin`)**: Dashboard de gestão (vendas, estoque, relatórios, configurações).
6.  **Print Station (`/print-station`)**: Gerenciador de impressões térmicas de pedidos.

---

## 2. Stack Tecnológica
-   **Frontend**: React 18 + Vite + TypeScript.
-   **Estilização**: Tailwind CSS + Shadcn UI (componentes acessíveis).
-   **Gerenciamento de Estado**: TanStack Query (React Query) v5 com persistência local (Offline-First em algumas partes).
-   **Roteamento**: React Router DOM v6.
-   **Backend (BaaS)**: Supabase.
    -   **Banco de Dados**: PostgreSQL com RLS (Row Level Security).
    -   **Autenticação**: Supabase Auth (Sistema de PIN para funcionários).
    -   **Realtime**: Assinatura de canais para atualizações instantâneas de pedidos entre PDV, Cozinha e Palm.
    -   **Edge Functions**: Deno (TypeScript) para lógica de servidor (Telegram, Relatórios).
    -   **Storage**: Armazenamento de imagens de produtos.

---

## 3. Arquitetura de Banco de Dados (PostgreSQL)

### 3.1 Tabelas Principais (Core)
-   **`orders`**: Cabeçalho dos pedidos.
    -   Campos: `id`, `total`, `status`, `customer_id`, `delivery_address`, `delivery_fee`, `change_for`, `is_printed`, `served_at`.
-   **`order_items`**: Itens vinculados a um pedido.
    -   Campos: `id`, `order_id`, `product_id`, `quantity`, `unit_price`, `notes`, `status` (preparando, pronto, entregue).
-   **`products`**: Catálogo de produtos.
    -   Campos: `id`, `name`, `description`, `price`, `image_url`, `category_id`, `is_available`, `stock_quantity`.
-   **`menu_categories`**: Categorias do cardápio (ex: Espetos, Bebidas, Cervejas).
    -   Campos: `id`, `name`, `order_index`, `is_active`.

### 3.2 Gestão de Equipe e Segurança
-   **`profiles`**: Dados estendidos dos usuários (garçons, admins, cozinheiros).
    -   Campos: `id` (FK para auth.users), `full_name`, `role`, `pin_code` (para login rápido).
-   **`pin_attempt_log`**: Log de tentativas de acesso por PIN para evitar brute force.

### 3.3 Fidelidade e Clientes
-   **`customers`**: Cadastro de clientes (geralmente via telefone).
-   **`loyalty_accounts`**: Saldo de pontos por cliente.
-   **`loyalty_transactions`**: Histórico de pontos ganhos/resgatados.
-   **`loyalty_rewards`**: Prêmios disponíveis para troca.

### 3.4 Financeiro e Operacional
-   **`cash_register`**: Sessões de caixa (abertura/fechamento).
-   **`cash_movements`**: Entradas e saídas de dinheiro (sangrias, reforços).
-   **`restaurants`**: Configurações da unidade (nome, CNPJ, endereço).
-   **`business_hours`**: Horários de funcionamento para o menu público.
-   **`delivery_zones`**: Taxas de entrega por bairro/distância.

### 3.5 Logs e Analytics
-   **`daily_sales_summary`**: Agregação diária de faturamento.
-   **`daily_waiter_stats`**: Performance de vendas por garçom.
-   **`daily_product_stats`**: Ranking de produtos mais vendidos.
-   **`error_log`**: Rastreamento de erros no frontend/backend.

---

## 4. Lógica de Integração e Automação (Edge Functions)
As funções rodam no servidor Supabase para tarefas pesadas ou externas:
-   **`notify-telegram`**: Envia notificações automáticas para grupos de Telegram quando um novo pedido chega ou quando o estoque está baixo.
-   **`telegram-webhook`**: Permite comandos via Telegram para consultar vendas ou status.
-   **`daily-waiter-report`**: Gera e envia o resumo de comissões/vendas ao final do dia.
-   **`db-consistency-check`**: Garante que não existam pedidos órfãos ou inconsistências de estoque.

---

## 5. UI/UX e Padrões de Design
-   **Cores**: Contraste alto é prioridade. Texto preto sobre fundo branco no admin. Gradientes vibrantes (Laranja/Amarelo) para ações principais no cardápio público.
-   **Responsividade**:
    -   **Mobile First**: O cardápio público e o Palm são otimizados para uso com uma mão.
    -   **Admin Sidebar**: No desktop é fixa (240px); no mobile vira um Drawer (menu lateral deslizante) que não aperta o conteúdo.
    -   **Navegação de Categorias**: Barra horizontal com scroll e scroll-into-view suave.
-   **Componentes Customizados**:
    -   `StaffGate`: Protege rotas internas exigindo autenticação por PIN.
    -   `AdminErrorBoundary`: Captura falhas críticas em dashboards para evitar tela branca.

---

## 6. Fluxo de Trabalho (Workflow)
1.  **Pedido**: Cliente (QR Code na mesa) ou Garçom (Palm) envia o pedido.
2.  **Cozinha**: Recebe em tempo real via Supabase Realtime no monitor `/kitchen`.
3.  **Entrega**: O garçom marca como "Entregue" no Palm.
4.  **Pagamento**: O caixa (`/pdv`) visualiza a conta, aplica descontos/fidelidade e fecha o pedido.
5.  **Impressão**: Se configurado, o `print-station` imprime o cupom automaticamente.

---

## 7. Instruções para Manutenção (Dicas para IA)
-   **Adicionar Campo**: Sempre atualize a migration no Supabase e rode o gerador de tipos para manter o TypeScript sincronizado.
-   **Novas Categorias**: Use o `order_index` para ordenar na UI.
-   **Segurança**: Nunca remova o RLS. Se precisar de acesso total, use uma Edge Function com `service_role`.
-   **Performance**: Use `lazy loading` para as páginas pesadas do Admin.

---
*Fim do Documento de Especificação.*
