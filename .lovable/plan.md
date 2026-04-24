

# Site v2.1 — Configurar IP da Bridge + Seletor de Impressora

## Por que

A bridge v2.1 está 100% funcional no PC, mas:
1. Os dispositivos da rede (celular/tablet do garçom) não conseguem alcançá-la porque o site usa `localhost:9100` hardcoded.
2. O nome da impressora ainda não pode ser trocado pela UI — precisa editar `config.json` na mão no PC.

## O que vou fazer

### 1. Configuração do IP da Bridge

**Local**: `src/lib/thermal-printer.ts`
- Trocar URL hardcoded `http://localhost:9100` por leitura de `localStorage.getItem('bridge_url')` com fallback `http://localhost:9100`.
- Função `setBridgeUrl(url)` salva no localStorage.

**UI**: `src/components/admin/PrinterDiagnostics.tsx`
- Nova seção "Endereço da Bridge" com:
  - Input pré-preenchido com URL atual
  - Placeholder mostrando `http://192.168.1.23:9100`
  - Botão "Salvar e Testar" → salva + chama `/health`
  - Texto explicativo: "Use o IP do PC onde o lp-bridge.exe está rodando"

### 2. Seletor de Impressora

**Local**: `src/lib/thermal-printer.ts`
- `listBridgePrinters()` → `GET /printers`
- `setBridgePrinter(name)` → `POST /config { printer_name }`

**UI**: `src/components/admin/PrinterDiagnostics.tsx` (mesma seção)
- Botão "Listar Impressoras" → popula um Select
- Select com impressoras detectadas
- Botão "Salvar Impressora" → chama `setBridgePrinter`
- Mostra impressora atual lida do `/health`

### 3. Indicador "qual modo está ativo"

No painel já existente, mostrar:
- `printer_method: spooler-powershell` → badge laranja "Modo PowerShell (lento mas estável)"
- `printer_method: spooler-native` → badge verde "Modo Nativo (rápido)"

## Arquivos tocados

- `src/lib/thermal-printer.ts` — adicionar `getBridgeUrl/setBridgeUrl/listBridgePrinters/setBridgePrinter`
- `src/components/admin/PrinterDiagnostics.tsx` — nova seção "Configuração da Bridge"

Nenhuma mudança no `.exe`, nada no Supabase, nada de migrations.

## Critérios de aceite

- Admin consegue trocar URL da bridge de `localhost:9100` pra `192.168.1.23:9100` e salvar
- Após salvar, o `/health` no painel responde verde
- Admin consegue listar impressoras e selecionar `POS80_MeuSistema` (ou outra)
- Cupons de teste imprimem da palm/cozinha rodando no celular do garçom

