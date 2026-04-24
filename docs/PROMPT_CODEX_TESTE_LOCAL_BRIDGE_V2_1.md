# Prompt para Codex — Teste local end-to-end Bridge v2.1 + Site

> **Para o Codex:** você tem acesso ao git deste repo e ao PC Windows onde a bridge roda. Execute os passos abaixo **em ordem**, sem pular, e ao final me responda no formato do bloco "Relatório final" no fim deste documento. Não faça perguntas — se algo travar, anote no relatório e siga adiante.

---

## 1. Contexto

- **Bridge:** `lp-bridge-v2.1.0.exe` está rodando no PC Windows do balcão, em modo `spooler-powershell`, escutando em `:9100`.
- **Impressora física:** térmica USB, instalada no Windows como fila `POS80_MeuSistema` (compartilhada com o app de entregas — pode coexistir).
- **Site:** `https://palm-order-pro.lovable.app` (já em produção). UI de configuração da bridge fica em **Admin → Sistema → Diagnóstico de Impressora**.
- **Cenário a validar:** o **celular do garçom** (Android, mesmo Wi-Fi do PC, IP `192.168.x.y`) precisa conseguir abrir o site, mandar um pedido e o cupom sair na impressora do PC.
- **Hipótese atual de falha:** firewall do Windows bloqueando `:9100` para conexões externas, OU URL da bridge salva no localStorage do celular ainda apontando pra `localhost`.

---

## 2. Pré-checagem no PC (PowerShell como admin)

```powershell
# 2.1 — Descobrir IP do PC na LAN (anote pra usar nos próximos passos)
ipconfig | Select-String "IPv4"

# 2.2 — Bridge respondendo localmente?
Invoke-RestMethod http://localhost:9100/health | ConvertTo-Json -Depth 5

# 2.3 — Bridge ouvindo em TODAS as interfaces (não só 127.0.0.1)?
netstat -ano | Select-String ":9100"
# Esperado: TCP    0.0.0.0:9100    0.0.0.0:0    LISTENING    <PID>
# Se aparecer só 127.0.0.1:9100 → bridge precisa ser reiniciada com bind 0.0.0.0
```

**Se `netstat` mostrar apenas `127.0.0.1:9100`:** abrir `bridge/lp-bridge.js`, conferir se o `app.listen` está como `app.listen(PORT, '0.0.0.0', ...)` e não `app.listen(PORT, ...)`. Se precisar mexer, recompilar o `.exe` com `npm run build:exe` dentro de `bridge/`.

---

## 3. Liberar firewall do Windows (causa #1 de falha silenciosa)

```powershell
# Roda uma vez como admin. Idempotente — se já existir, vai dar erro inofensivo.
New-NetFirewallRule -DisplayName "LP Bridge 9100" `
  -Direction Inbound -Protocol TCP -LocalPort 9100 -Action Allow `
  -Profile Private,Domain
```

> Se o Wi-Fi do balcão estiver classificado como **Public** no Windows, troque `-Profile Private,Domain` por `-Profile Any`. Confirme em **Configurações → Rede → Propriedades** que o perfil bate.

---

## 4. Teste de rede a partir do celular

1. No celular Android conectado ao **mesmo Wi-Fi** do PC, abrir no Chrome:
   ```
   http://<IP_DO_PC>:9100/health
   ```
2. Resultado esperado: JSON com `"ok": true`, `"bridge_version": "2.1.0"`, `"printer_method": "spooler-powershell"`, `"printer_name": "POS80_MeuSistema"`.
3. Se der **"não foi possível conectar"**:
   - Confirmar que celular e PC estão na mesma sub-rede (`192.168.X.*` igual).
   - Reconfirmar regra de firewall (passo 3).
   - Alguns roteadores domésticos têm **AP/Client Isolation** ligado — desligar nas configs do roteador.

---

## 5. Configurar o site no celular (UI passo a passo)

1. Celular abre `https://palm-order-pro.lovable.app`.
2. Menu → **Admin** → digitar PIN do gerente.
3. Aba **Sistema** → rolar até o card **"Diagnóstico de Impressora"**.
4. **Endereço da Bridge:**
   - Apagar o que estiver e colar `http://<IP_DO_PC>:9100/print`
   - Clicar **Salvar**
   - Clicar **1. HEALTH** → deve aparecer evento verde com `Online · impressora detectada · v2.1.0`
5. **Impressora do Windows:**
   - Clicar **Listar** → dropdown popula com as impressoras do Windows
   - Selecionar `POS80_MeuSistema`
   - Clicar **Salvar**
6. **Teste físico:**
   - Clicar **2. MÍNIMO** → 1 linha curta deve sair na impressora
   - Clicar **3. CUPOM** → cupom completo de exemplo deve sair

> Se algum dos 3 botões falhar, anotar no relatório o texto exato do evento (timeline aparece logo abaixo dos botões).

---

## 6. Teste real do fluxo de produção

1. Voltar pra Home → **Palm** (garçom).
2. Escolher mesa qualquer (ex.: Mesa 1).
3. Adicionar **1 espeto** + **1 refrigerante**.
4. Confirmar pedido.
5. **Esperado:** cupom de cozinha sai automaticamente na impressora do PC dentro de ~3s.
6. Ir em **Cozinha** no PC ou em outro dispositivo e confirmar que o card apareceu na coluna "Pendente".
7. Em **Caixa**, fechar a mesa em dinheiro → cupom de fechamento deve sair.

---

## 7. Diagnóstico se algo falhar

| Sintoma | Causa provável | Como confirmar |
|---|---|---|
| Site mostra "Bridge offline" mesmo após salvar IP | URL antiga ainda no localStorage | No celular: DevTools → Application → Local Storage → `print_config_v1` deve ter `bridgeUrl` com IP, não `localhost` |
| `/health` responde mas `2. MÍNIMO` falha | Impressora não selecionada na bridge | `/health` deve trazer `printer_name` ≠ vazio. Se vazio, refazer passo 5.5 |
| Cupom sai com caracteres estranhos (`Ã§` em vez de `ç`) | Encoding do driver Windows | Trocar driver da impressora para "Generic / Text Only" no Windows, ou ajustar codepage no `lp-bridge.js` (CP860 pt-PT funciona bem com POS-80) |
| Cupom sai cortado / sem corte automático | Comando de corte ESC/POS não interpretado pelo driver Windows | Modo `spooler-powershell` repassa texto puro — o corte precisa ser feito pelo driver. Verificar nas propriedades da impressora se "auto-cut" está ligado |
| Pedido criado mas cupom nunca sai | Job ficou na fila sem ser claimed | No PC: `Invoke-RestMethod http://localhost:9100/health` → olhar `queue_size`. Se > 0 e não cai, restart do `.exe` |

---

## 8. Git — o que commitar se precisar ajustar

Se nos passos acima você precisou alterar código, separe em commits pequenos:

- **Bridge (Node.js do `.exe`):** `bridge/lp-bridge.js`, `bridge/package.json`, `bridge/BRIDGE_INSTRUCTIONS.md`
- **Site (frontend React):** `src/lib/thermal-printer.ts`, `src/components/admin/PrinterDiagnostics.tsx`, `src/components/admin/NetworkTab.tsx`, `src/components/print-station/ConnectionStatusBanner.tsx`

Branch sugerida: `fix/bridge-v2.1-network-validation`
PR alvo: `main`

> **Importante:** o repo tem sync bidirecional com Lovable. Qualquer push em `main` chega no editor automaticamente, e vice-versa. Não force-push em `main`.

---

## 9. Relatório final (responder neste formato)

Cole o template abaixo preenchido na sua resposta:

```
### Resultado do teste E2E Bridge v2.1

- IP do PC usado: 192.168.___.___
- Bridge ouvindo em 0.0.0.0:9100? [ sim / não ]
- Regra de firewall criada? [ sim / já existia / não foi necessário ]
- /health acessível do celular? [ sim / não ]  → JSON recebido: <colar aqui>
- HEALTH no painel: [ verde / vermelho ]  → mensagem: <...>
- MÍNIMO no painel: [ saiu papel / falhou ]
- CUPOM no painel: [ saiu papel / falhou ]
- Pedido real (palm → cozinha → impressora): [ ok / falhou na etapa X ]

### Erros encontrados
1. ...
2. ...

### Alterações de código (se houve)
- arquivo: motivo
- arquivo: motivo

### Sugestão de próximo passo pro humano
- ...
```
