

## Plano: Melhorias no módulo PDV/CAIXA

Vou explorar primeiro o módulo PDV atual para entender a estrutura.
<lov-tool-use id="toolu_vrtx_01WJsv7422JGKZciMZ48KTN7" name="code--view" integration-id="code" data="{\"file_path\": \"src/pages/Pdv.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_013iE8e7MgTP5hwyCNngxowZ" name="code--view" integration-id="code" data="{\"file_path\": \"src/pages/Cashier.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01Set1QdbBtnLpYQomP1wWmP" name="code--view" integration-id="code" data="{\"file_path\": \"src/pages/Pdv.tsx\"}">
</lov-tool-use>

<lov-tool-use id="toolu_vrtx_01C4ZnaVs3xitXoBVew9Xtmp" name="code--view" integration-id="code" data="{\"file_path\": \"src/pages/Cashier.tsx\"}">
</lov-tool-use>
<lov-plan>
## Plano: Melhorias no PDV/Caixa

### Escopo
Refatorar a fila de pedidos do `Pdv.tsx` (usado no .exe Windows) para agrupar por status, mostrar mais contexto, fontes maiores, cores semânticas e um toggle "Modo Garçom" que oculta itens administrativos. Sem mexer em fluxo de impressão, pagamento ou Realtime.

### Mudanças

**1. Fila agrupada por status** (`src/pages/Pdv.tsx`)
- Dividir a lista atual em 3 seções com cabeçalhos coloridos:
  - 🟢 **Aguardando** (`new`) — borda/header verde
  - 🟡 **Em Preparo** (`preparing`) — header amarelo
  - 🔴 **Prontos para Pagamento** (`done`) — header vermelho/destaque
- Ordenar dentro de cada grupo: mais antigo primeiro (urgência).

**2. Card de pedido enriquecido**
Cada item da fila passa a mostrar, em fonte maior:
- Mesa/balcão (texto-2xl, bold)
- Quantidade de itens (calculada via `allItems.filter(...).reduce`)
- Valor total (text-xl, primary)
- Tempo decorrido desde envio — usar `useElapsedTime` já existente (`12min`, `1h05`)
- Horário de criação (texto pequeno secundário)

**3. Prioridades visuais**
- Tempo > 20min → badge laranja "⚠ ATRASADO" + pulse sutil
- Tempo > 40min → badge vermelho "🔥 URGENTE" + borda vermelha animada
- Status `done` há > 10min → destaque amarelo "Aguardando pagamento"

**4. Fontes/contraste para monitor grande**
- Fila: `text-base` → `text-lg`; mesa em `text-2xl font-black`
- Headers de seção: `text-base uppercase tracking-wide`
- Painel direito (detalhe): aumentar itens para `text-lg`
- Botões de status/pagamento: `min-h-[64px] text-lg font-black`

**5. Toggle "Modo Garçom"** (oculta admin)
- Botão no header (ícone olho) ao lado do Settings
- Persistir em `localStorage` (`pdv-staff-mode`)
- Quando ativo: adiciona classe `staff-mode` no container raiz do Pdv
- CSS via Tailwind: `.staff-mode .admin-only { @apply hidden }` em `src/index.css`
- Marcar com classe `admin-only`: botão Settings, badge ONLINE/OFFLINE, link "Estação de Impressão" (no dialog não importa pois fica fechado)
- Toggle em si NÃO leva `admin-only` (precisa estar visível para destravar)

**6. Sem alterações em**
- `manualPrint*`, `autoPrint*`, Realtime channel, RPCs `pay_order`/`update_order_status`
- `Cashier.tsx` (mobile) — fora do escopo do .exe
- `manifest`, `sw.js`, fluxo de instalação

### Estrutura visual da fila

```text
┌─ 🟢 AGUARDANDO (2) ─────────────────┐
│ Mesa 5 · 3 itens · R$ 87,00 · 4min  │
│ Mesa 12 · 1 item  · R$ 18,00 · 1min │
└──────────────────────────────────────┘
┌─ 🟡 EM PREPARO (1) ─────────────────┐
│ ⚠ Mesa 8 · 5 itens · R$ 142 · 22min │
└──────────────────────────────────────┘
┌─ 🔴 PRONTOS P/ PAGAMENTO (1) ───────┐
│ Mesa 3 · 4 itens · R$ 96,00 · 8min  │
└──────────────────────────────────────┘
```

### Arquivos editados
- `src/pages/Pdv.tsx` — agrupamento, cards enriquecidos, toggle staff-mode, fontes
- `src/index.css` — regra `.staff-mode .admin-only { display:none }`

### Sincronização Codex/.exe
Após aplicar, gerar uma mensagem-resumo (igual ao fluxo das alterações anteriores) listando arquivos alterados para repassar ao Codex e atualizar a build .exe — preservando print-service/print-receipt intactos.
