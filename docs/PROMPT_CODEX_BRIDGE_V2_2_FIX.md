# PROMPT PARA O CODEX — Corrigir Bridge v2.2 + alinhar contrato com o site

## Contexto

O frontend (Lovable) acabou de receber 4 correções:

1. `bridgeUrl` e `printMode` agora são **locais por dispositivo** (não sincronizam mais via Supabase). Cada PC/celular guarda a sua URL.
2. O parser de `/health` no site agora aceita os campos novos da bridge v2.2: `printer_ok`, `printer_ready`, `printer_name`, `printer_method`, `bridge_version`, `queue_size`.
3. A fila local de retry não exige mais `printer_connected=true` — basta `online=true` (porque no modo `spooler-powershell` o status fica `UNKNOWN` mas a impressão funciona).
4. O PDV não exibe mais "Cupom enviado!" quando na verdade falhou.

Agora preciso que **a bridge v2.2 (dentro do .exe `Plano B Fast Order`) bata com esse contrato e funcione de verdade no PC do cliente.**

---

## Problema observado nos logs

```
[BOOT] Bridge v2.2.0
[BOOT] Modo de impressao: spooler-powershell
[BOOT] Impressora configurada: POS80_MeuSistema
[BOOT] HTTP: http://0.0.0.0:3001
warn: node-printer indisponivel (Cannot find module '@thiagoelg/node-printer')
```

E no navegador:
```
GET http://localhost:3001/health → signal is aborted without reason  (timeout 1500ms)
```

Ou seja:
- Bridge sobe e diz que está ouvindo em `0.0.0.0:3001`
- Mas o `fetch` do site para `http://localhost:3001/health` **não recebe resposta em 1.5s**
- E o módulo nativo `@thiagoelg/node-printer` não foi empacotado

---

## O que você precisa fazer (Codex)

### 1. Garantir que `/health` responda em < 500ms SEM bloquear

Hoje o `/health` provavelmente está chamando PowerShell para checar a impressora a cada request, e isso demora mais de 1.5s (timeout do site).

Refatorar o handler de `/health` para:

- **NÃO** rodar PowerShell síncrono no request
- Manter um cache em memória do último estado da impressora (ttl 5s)
- Atualizar esse cache em background a cada 5s
- Responder o `/health` direto desse cache

Contrato JSON esperado pelo site (já implementado no frontend):

```json
{
  "ok": true,
  "bridge_version": "2.2.0",
  "printer_method": "spooler-powershell",
  "printer_name": "POS80_MeuSistema",
  "printer_status": "UNKNOWN",
  "printer_ok": true,
  "printer_ready": true,
  "printer_connected": true,
  "queue_size": 0,
  "uptime_s": 360
}
```

Importante:
- `printer_ok` deve ser `true` quando há `printer_name` configurada e o spooler do Windows está respondendo, **independente** do `printer_status`
- Manter `printer_connected` (alias de `printer_ok`) por compatibilidade
- Sempre responder mesmo se ainda não checou — devolve cache vazio com `printer_ok: false` em vez de travar

### 2. Empacotar o módulo nativo ou aceitar fallback de forma limpa

O log mostra:
```
Cannot find module '@thiagoelg/node-printer'
- C:\Users\...\Plano B Fast Order\resources\app.asar\bridge\printer.js
```

Duas opções, escolha a mais simples:

**Opção A — empacotar o módulo nativo (preferida):**
- Adicionar `@thiagoelg/node-printer` em `dependencies` do `package.json` do desktop
- No `electron-builder.yml` (ou config equivalente), incluir em `extraResources` / desempacotar de `app.asar` os binários `.node` desse módulo
- Rebuild para Windows com `electron-builder --win`

**Opção B — manter só PowerShell (se o nativo continuar dando trabalho):**
- Remover qualquer `require("@thiagoelg/node-printer")` que jogue stack trace
- Logar 1x na inicialização: `[BOOT] node-printer ausente — usando spooler PowerShell` e seguir
- Garantir que o método `spooler-powershell` realmente imprime (ver passo 3)

### 3. Validar que `POST /print` realmente imprime via spooler

Caminho atual: o site manda `{ payload: <base64 ESC/POS>, format: "escpos" }` para `/print`.

A bridge precisa:
1. Decodificar o base64
2. Salvar em arquivo temporário (`%TEMP%\lpb-<uuid>.bin`)
3. Mandar para a impressora `POS80_MeuSistema` usando:
   ```powershell
   Get-Content -Encoding Byte -ReadCount 0 "<arquivo>" | Out-Printer -Name "POS80_MeuSistema"
   ```
   OU usar `print /D:"\\localhost\POS80_MeuSistema"` se Out-Printer falhar com binário.
4. Apagar o arquivo temporário
5. Responder:
   ```json
   { "success": true, "jobId": "<uuid>", "printed_at": "<iso>" }
   ```

Se falhar, responder HTTP 500 com:
```json
{ "success": false, "error": "<mensagem clara>" }
```

### 4. Endpoints obrigatórios (manter)

- `GET /` — info da bridge
- `GET /health` — JSON do passo 1
- `GET /printers` — lista impressoras do Windows: `[{ "name": "POS80_MeuSistema", "is_default": true, "status": "Ready" }, ...]`
- `POST /config` — body `{ "printer_name": "..." }` salva no `config.json` em `%APPDATA%\lp-bridge\`
- `POST /print` — passo 3
- `POST /test` (opcional) — payload mínimo para teste

CORS: liberar `*` em todos.

### 5. Bind correto

Continuar ouvindo em `0.0.0.0:3001`. **Não** mudar para `127.0.0.1` — o celular precisa acessar pelo IP da rede.

### 6. Firewall (instalar regra automaticamente)

No instalador (NSIS / electron-builder), adicionar script `installer-include.nsh` que rode na instalação:

```
ExecWait 'netsh advfirewall firewall add rule name="Plano B Fast Order Bridge" dir=in action=allow protocol=TCP localport=3001'
```

E no uninstall:
```
ExecWait 'netsh advfirewall firewall delete rule name="Plano B Fast Order Bridge"'
```

Isso elimina o passo manual do usuário.

### 7. Logs

Manter logs em `%APPDATA%\lp-bridge\logs\bridge-YYYY-MM-DD.log` com rotação de 7 dias (já está OK).
Adicionar log explícito quando `/print` for chamado:
```
[PRINT] job=<uuid> bytes=<n> printer=<name> ms=<latencia> result=<ok|fail>
```

---

## Como testar (você roda no PC, Codex)

```powershell
# 1. Build do .exe
npm run dist:win

# 2. Instalar e abrir o app

# 3. Verificar bind
netstat -ano | findstr :3001
# Esperado: 0.0.0.0:3001 LISTENING

# 4. Health rápido
Measure-Command { Invoke-RestMethod http://localhost:3001/health }
# Esperado: TotalMilliseconds < 200

# 5. Confirmar campos novos
(Invoke-RestMethod http://localhost:3001/health) | ConvertTo-Json
# Esperado ver: bridge_version=2.2.0, printer_ok=true, printer_name="POS80_MeuSistema"

# 6. Listar impressoras
Invoke-RestMethod http://localhost:3001/printers

# 7. Teste de print real (payload mínimo ESC/POS = ESC @ + texto + LF + cut)
$bytes = [byte[]](27,64) + [System.Text.Encoding]::ASCII.GetBytes("TESTE BRIDGE`n`n`n") + [byte[]](29,86,65,3)
$b64 = [Convert]::ToBase64String($bytes)
Invoke-RestMethod -Method Post -Uri http://localhost:3001/print `
  -ContentType "application/json" `
  -Body (@{ payload=$b64; format="escpos"; source="codex-test" } | ConvertTo-Json)
# Esperado: { success: true, jobId: ..., printed_at: ... } E SAIR PAPEL DA IMPRESSORA
```

## Critério de sucesso

- [ ] `/health` responde em menos de 500ms
- [ ] `/health` retorna `printer_ok: true` quando há impressora configurada
- [ ] Site (desktop) abre Admin → Diagnóstico e mostra **ONLINE · v2.2.0**
- [ ] Botão **2. MÍNIMO** no Diagnóstico imprime de verdade
- [ ] Botão **3. CUPOM** no Diagnóstico imprime de verdade
- [ ] Pedido novo no celular (na mesma rede Wi-Fi, apontando pra `http://IP_DO_PC:3001/print`) sai automaticamente na impressora
- [ ] Instalador adiciona regra de firewall sozinho

## Repositório

- Branch sugerida: `fix/bridge-v2.2-health-cache-and-print`
- Arquivos prováveis a tocar:
  - `desktop/bridge/server.js`
  - `desktop/bridge/printer.js`
  - `desktop/bridge/health.js` (criar se não existir)
  - `desktop/package.json` (dependências e build config)
  - `desktop/build/installer-include.nsh` (criar)

## Observações importantes

- **NÃO** usar Zadig nem mexer em driver USB. A impressora já está instalada como impressora do Windows e o app de entregas usa o mesmo nome — precisa continuar compartilhada.
- **NÃO** mudar a porta 3001.
- **NÃO** voltar a sincronizar `bridgeUrl` pelo Supabase — o site agora trata isso como local.
