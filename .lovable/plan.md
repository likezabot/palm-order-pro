## Reorganização visual do Admin

Hoje o `/admin` tem **11 abas em fila horizontal** no topo (Cardápio, Cardápio Online, Pedidos Online, Editor Pedidos, Impressão, Erros, Estatísticas, Sistema, Rede, Fidelidade, Rotas) e várias delas exibem 4–6 painéis empilhados. A proposta é trocar tudo por uma **sidebar lateral colapsável** agrupada por função e esconder o conteúdo técnico atrás de um botão "Mostrar opções avançadas".

---

### 1. Layout novo: sidebar lateral

Substituir `<TabsList>` no topo por uma `Sidebar` (shadcn) à esquerda, com 4 grupos. O header atual fica como está (logo, modo Garçom, novo produto), apenas com o `SidebarTrigger` adicionado para colapsar/expandir.

Em viewports estreitos (<768px) a sidebar vira off-canvas (drawer); em desktop/tablet fica fixa colapsável modo `icon` (mantém ícones quando recolhida).

```text
┌────────────────────────────────────────────────────────┐
│ [≡] Painel de Controle           [Garçom] [⚙] [+ NOVO] │
├──────────────┬─────────────────────────────────────────┤
│ CARDÁPIO     │                                         │
│  • Produtos  │                                         │
│  • Online    │       conteúdo da seção ativa           │
│  • Fidelidade│                                         │
│              │                                         │
│ PEDIDOS      │                                         │
│  • Editor    │                                         │
│  • Online    │                                         │
│              │                                         │
│ OPERAÇÃO     │                                         │
│  • Impressão │                                         │
│  • Rede      │                                         │
│  • Rotas     │                                         │
│              │                                         │
│ SISTEMA      │                                         │
│  • Erros [3] │                                         │
│  • Estatíst. │                                         │
│  • Manutenção│                                         │
└──────────────┴─────────────────────────────────────────┘
```

**Agrupamento das 11 abas atuais:**

| Grupo | Itens |
|---|---|
| **Cardápio** | Produtos (presencial), Cardápio Online, Fidelidade |
| **Pedidos** | Editor de Pedidos, Pedidos Online |
| **Operação** | Impressão, Rede, Rotas & URLs |
| **Sistema** | Erros & Saúde (com badge), Estatísticas, Manutenção (ex-"Sistema") |

Renomeação: a aba "Sistema" passa a se chamar **Manutenção** (mais claro — é onde se apaga dados, força update, arquiva), liberando "Sistema" como nome do grupo.

### 2. Modo Garçom (mantido)

A regra atual continua: itens marcados `admin-only` (Erros, Estatísticas, Manutenção, Rede, Rotas) ficam ocultos no modo Garçom. Na sidebar, grupos inteiros ficam vazios são escondidos automaticamente — então em modo Garçom a sidebar mostra só **Cardápio** e **Pedidos** + Impressão + Fidelidade.

### 3. Esconder conteúdo técnico atrás de "Avançado"

Cada aba "pesada" mostra apenas o essencial; o resto fica atrás de um botão `[ Mostrar opções avançadas ▾ ]` que expande inline.

| Aba | Visível por padrão | Atrás de "Avançado" |
|---|---|---|
| **Impressão** | Configuração do talão, botão "Testar impressão", status da bridge | Self-test, Origem dos pedidos reais, Diagnóstico de bridge, Diagnóstico da impressora |
| **Manutenção** | Forçar atualização, Limpar dados de teste | Arquivar pedidos antigos, Histórico de arquivamentos |
| **Erros & Saúde** | Resumo de erros (cards) | Erros do dia detalhados, Impressões travadas, Log completo |
| **Rede** | Status da conexão | Detalhes técnicos de latência/realtime |

O estado expandido/recolhido é lembrado em `localStorage` por aba (`admin-advanced-{tab}`).

### 4. Estado da rota

Mantém `useState("products")` mas troca por `useSearchParams` (`?section=products`) para que recarregar a página preserve a seção e dê para linkar direto. Compatível com o comportamento atual.

---

### Detalhes técnicos

**Arquivos novos:**
- `src/components/admin/AdminSidebar.tsx` — Sidebar shadcn com 4 grupos, ícones (mantém os atuais), badge de erros não resolvidos no item "Erros", filtro `admin-only` igual ao atual
- `src/components/admin/AdvancedSection.tsx` — wrapper `<details>`-like com botão "Mostrar opções avançadas", persistência em localStorage

**Arquivos editados:**
- `src/pages/Admin.tsx` — envolver com `<SidebarProvider>`, remover `<TabsList>`, manter `<TabsContent>` (Tabs continua como mecanismo de troca de painel, só a UI muda); adicionar `SidebarTrigger` ao header; trocar `useState` por `useSearchParams`
- `src/components/admin/AdminHeader.tsx` — incluir `SidebarTrigger` à esquerda do botão voltar
- `src/components/admin/PrintConfigPanel.tsx` — agrupar `PrintConfigSelfTest`, `PrintOriginPanel`, `BridgeOriginDiagnostics`, `PrinterDiagnostics` dentro de `<AdvancedSection>`
- `src/components/admin/SystemTab.tsx` — renomear título visual para "Manutenção"; mover Arquivar + Histórico para `<AdvancedSection>`
- `src/components/admin/ErrorsTab.tsx` — manter `ErrorsSummaryPanel` visível; mover `DailyErrorsPanel`, `StuckPrintsPanel`, `ErrorLogPanel` para `<AdvancedSection>`
- `src/components/admin/NetworkTab.tsx` — colapsar detalhes técnicos

**Não muda:**
- Lógica de produtos, pedidos, impressão, bridge, fidelidade — apenas a navegação/embalagem visual
- Modo Garçom continua usando classe `admin-only` + CSS atual
- Badge de erros não resolvidos continua funcionando, agora ao lado do item "Erros" na sidebar

### Validação

- Conferir que todas as 11 áreas continuam acessíveis em desktop e mobile
- Conferir colapsar/expandir sidebar (modo `icon` no desktop, off-canvas no mobile)
- Conferir modo Garçom esconde os grupos certos
- Conferir badge de erros não resolvidos aparece na sidebar
- Conferir que estado "Avançado" persiste após reload