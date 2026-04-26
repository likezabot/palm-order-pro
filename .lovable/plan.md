## Objetivo

Hoje os 4 painéis de erro (`ErrorsSummaryPanel`, `DailyErrorsPanel`, `ErrorLogPanel`, `StuckPrintsPanel`) ficam empilhados no **topo da aba "Sistema"**, no mesmo lugar do botão "APAGAR — HOJE" e "Forçar atualização". Isso:

- Esconde os erros (precisa abrir Sistema e rolar)
- Mistura monitoramento com ações destrutivas
- Dificulta o acesso rápido quando algo dá errado

## O que vou fazer

### 1. Nova aba "Erros" em `src/pages/Admin.tsx`
- Adicionar `<TabsTrigger value="errors">` com ícone `AlertTriangle` (lucide-react), entre **Impressão** e **Estatísticas**.
- Marcar como `admin-only` (mesmo padrão de Sistema/Stats/Rede).
- Label: **"Erros"** no mobile, **"Erros & Saúde"** em telas ≥ sm.
- Adicionar `<TabsContent value="errors">` com o novo componente.

### 2. Novo componente `src/components/admin/ErrorsTab.tsx`
Concentra os 4 painéis em uma ordem lógica de "mais importante → mais detalhado":
1. `ErrorsSummaryPanel` — visão geral (KPIs do dia)
2. `DailyErrorsPanel` — resumo agrupado por código/fonte (já com filtro `auto_heal`)
3. `StuckPrintsPanel` — impressões travadas (alta prioridade operacional)
4. `ErrorLogPanel` — log bruto detalhado

Inclui um cabeçalho curto explicando "Aqui você vê tudo que falhou e o que o sistema corrigiu sozinho."

### 3. Limpeza da aba "Sistema" (`SystemTab.tsx`)
- **Remover** os 4 imports e renders dos painéis de erro (linhas 9-12 e 159-162).
- A aba Sistema fica focada **só** em ferramentas de manutenção: Apagar período, Forçar atualização, Arquivar antigos, Histórico de arquivamentos.
- Adicionar uma nota discreta no topo: *"Procurando erros? Veja a aba **Erros & Saúde**."*

### 4. Badge de contagem (opcional, leve)
No `TabsTrigger` da aba Erros, mostrar um pequeno badge vermelho com o número de erros não resolvidos das últimas 24h, consultando `error_log` com `resolved=false`. Usa o mesmo cliente Supabase já presente, query leve com `count` exato e revalidação a cada 60s. Se zero, badge fica oculto.

## O que **NÃO** vai mudar
- Nenhuma alteração em RLS, migrations, Edge Functions, cron, print_jobs, bridge ou Electron.
- Nenhuma mudança de comportamento dos painéis em si — apenas onde eles vivem.
- Aba "Rede" continua separada (ela é diagnóstico de conectividade, não de erros aplicacionais).

## Arquivos afetados
- `src/pages/Admin.tsx` — novo TabsTrigger + TabsContent
- `src/components/admin/ErrorsTab.tsx` — **novo arquivo**
- `src/components/admin/SystemTab.tsx` — remover painéis de erro, adicionar nota

## Como você vai testar
1. Abrir `/admin` → ver a nova aba **"Erros & Saúde"** com ícone de alerta.
2. Clicar nela → ver os 4 painéis na nova ordem.
3. Abrir aba **"Sistema"** → confirmar que ficou limpa, só com ferramentas de manutenção.
4. Se houver erros não resolvidos, conferir o badge vermelho na aba.