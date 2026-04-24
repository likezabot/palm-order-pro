

# Prompt para o Codex testar a Bridge v2.1 + Site localmente

Vou gerar um documento `docs/PROMPT_CODEX_TESTE_LOCAL_BRIDGE_V2_1.md` com instruções completas pro Codex (que tem acesso ao git e ao PC) executar o ciclo de teste end-to-end: bridge rodando + site apontando pro IP certo + impressão real saindo do celular.

## O que o prompt vai conter

### 1. Contexto (pra Codex entender o cenário)
- Bridge v2.1 já compilada e rodando como `lp-bridge-v2.1.exe` em `spooler-powershell` mode
- Site já tem UI de configuração de IP + seletor de impressora em **Admin → Sistema → Diagnóstico de Impressora**
- Problema atual: precisa validar fim-a-fim que o celular do garçom (em `192.168.x.x`) consegue mandar cupom pra impressora `POS80_MeuSistema` no PC

### 2. Pré-checagem (Codex roda no PC)
```powershell
# Descobrir IP do PC na rede
ipconfig | findstr IPv4

# Confirmar bridge viva
Invoke-RestMethod http://localhost:9100/health

# Confirmar bridge ouve em todas interfaces (não só localhost)
netstat -ano | findstr :9100
# Esperado: 0.0.0.0:9100 LISTENING
```

### 3. Liberar firewall (causa #1 de falha silenciosa)
```powershell
New-NetFirewallRule -DisplayName "LP Bridge 9100" `
  -Direction Inbound -Protocol TCP -LocalPort 9100 -Action Allow
```

### 4. Teste de rede do celular
- Celular abre `http://<IP_DO_PC>:9100/health` no navegador
- Se responder JSON → rede OK
- Se "não conseguiu conectar" → firewall ou rede Wi-Fi diferente

### 5. Configuração no site (passo a passo na UI)
1. Celular abre `https://palm-order-pro.lovable.app`
2. Vai em **Admin** (PIN gerente) → aba **Sistema** → **Diagnóstico de Impressora**
3. Seção **"Endereço da Bridge"**:
   - Cola `http://<IP_DO_PC>:9100`
   - Clica **Salvar e Testar** → deve ficar verde com versão `2.1.0`
4. Seção **"Impressora"**:
   - Clica **Listar Impressoras** → dropdown popula
   - Seleciona `POS80_MeuSistema`
   - Clica **Salvar Impressora**
5. Clica **Imprimir Teste** → cupom sai no PC

### 6. Teste real de fluxo (palm → cozinha → impressora)
- Abre **Palm** no celular
- Cria pedido em qualquer mesa, adiciona 1 espeto
- Confirma → cupom de cozinha deve sair automaticamente

### 7. Diagnóstico se falhar
Tabela com sintoma → causa → comando de check:
- Site mostra "Bridge offline" → checar `bridgeUrl` no localStorage do celular: `localStorage.getItem('print_config_v1')`
- `/health` responde mas `/print` falha → checar `printer_status` no `/health`
- Cupom sai cortado / com lixo → modo `spooler-powershell` está ok pra texto puro, problema é encoding (CP860 vs UTF-8 no driver)

### 8. Git: o que commitar se Codex precisar ajustar algo
- Bridge: `bridge/lp-bridge.js`, `bridge/package.json`
- Site: `src/lib/thermal-printer.ts`, `src/components/admin/PrinterDiagnostics.tsx`, `src/components/admin/NetworkTab.tsx`
- Branch sugerida: `fix/bridge-v2.1-network-validation`
- Lovable sincroniza automaticamente via GitHub bidirectional sync

## Arquivo tocado

- **Novo**: `docs/PROMPT_CODEX_TESTE_LOCAL_BRIDGE_V2_1.md`

Nenhum código de produção alterado. Só documentação.

## Critério de aceite

- Codex consegue, seguindo o prompt sem fazer perguntas, validar os 7 passos e reportar de volta com:
  - IP do PC usado
  - Resposta do `/health` remoto
  - Print do cupom que saiu (foto ou "saiu OK")
  - Lista de erros encontrados, se houver

