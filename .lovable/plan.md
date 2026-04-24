

# Prompt para o Codex: Bridge v2 com fila, singleton USB e status real

## Objetivo

Gerar um único arquivo Markdown — `docs/PROMPT_CODEX_BRIDGE_V2.md` — pronto pra você copiar e colar no Codex Desktop. Esse prompt instrui o Codex a reescrever o `lp-bridge.js` (e empacotar de novo o `.exe`) corrigindo as 8 falhas identificadas na auditoria anterior.

## O que o prompt vai conter

### 1. Contexto resumido
- O que é a bridge hoje (Express + escpos-usb na porta 9100).
- Sintoma observado em produção: imprime nos primeiros minutos, depois para silenciosamente. Bridge continua respondendo `200 OK` mesmo quando a impressora não imprime mais.
- Causa raiz suspeita: nova instância USB por request → `LIBUSB_ERROR_BUSY` acumulando + `device.write` resolvendo antes da impressora terminar.

### 2. Especificação completa da v2

**Arquitetura nova** (mantém compatibilidade total com `POST /print` atual):

```text
bridge/
  lp-bridge.js          ← entry point Express
  lib/
    printer.js          ← singleton USB + leitura de status DLE EOT
    queue.js            ← FIFO worker, 1 job por vez
    logger.js           ← winston rotativo, bridge.log
  package.json          ← +winston
  start-bridge.bat      ← inalterado
```

**Endpoints obrigatórios**:
- `GET /health` → `{ online, bridge_version: "2.0.0", printer_connected, printer_status: "ok"|"paper_out"|"cover_open"|"offline", queue_depth, last_print_at, last_error }`
- `POST /print` → mantém contrato atual (`{payload, format, source}`); responde `{ success, jobId, printed_at, printer_ok }` **só depois** do job terminar (fila serializa).
- `GET /jobs/:id` → status do job.
- `GET /test` → enfileira payload mínimo (`ESC @` + "TESTE BRIDGE v2\n\n\n" + `GS V`) e retorna jobId. Pra testar abrindo no navegador.
- `GET /printers` → mantém igual.

**Regras técnicas que o Codex precisa implementar**:
1. **Singleton USB**: abre device 1x no boot e mantém. Reabre só em erro fatal (`LIBUSB_ERROR_NO_DEVICE`).
2. **Fila FIFO in-memory**: 1 worker, processa um job por vez. Nada de paralelo.
3. **Status físico real**: antes e depois do write, lê `DLE EOT 1` (printer status) e `DLE EOT 4` (paper sensor). Reflete em `printer_status`.
4. **Retry interno**: 2 retries com 500ms se erro for recuperável (`LIBUSB_ERROR_BUSY`, `LIBUSB_ERROR_TIMEOUT`).
5. **Timeout duro**: 8s por job. Se estourar, `device.close()` + reopen + erro pro caller.
6. **Auto-recovery**: 3 erros seguidos → `device.close()` + reopen automático.
7. **Log persistente**: winston em `%APPDATA%/lp-bridge/bridge.log`, rotativo diário, 7 dias de retenção, nível info por padrão e debug se `LP_BRIDGE_DEBUG=1`.
8. **CORS**: mantém aberto pra qualquer origem (web em produção bate de fora do localhost).
9. **Listen em `0.0.0.0:9100`**, não `127.0.0.1` — pra celular na mesma rede conseguir alcançar.

### 3. Critérios de aceite (testes manuais que o Codex deve documentar no README)

- Abrir `http://localhost:9100/test` no Chrome → sai cupom "TESTE BRIDGE v2".
- Abrir `http://localhost:9100/health` → JSON com `bridge_version: "2.0.0"` e `printer_status` real.
- Disparar 20 prints em loop via `curl` → todos saem em ordem, nenhum perdido.
- Tirar papel da impressora → `/health` reporta `paper_out` em até 2s.
- Desligar impressora → `/health` reporta `offline`, próximos jobs falham com erro claro.
- Religar impressora → bridge volta sozinha, sem reiniciar `.exe`.

### 4. Empacotamento `.exe`

Instruções pro Codex empacotar com `pkg`:
```bash
npm install -g pkg
pkg lp-bridge.js --targets node18-win-x64 --output lp-bridge.exe
```
Lembrar de incluir `escpos-usb` nativo via `--public-packages "*"` se necessário.

### 5. Compatibilidade com a v1
A v2 mantém `POST /print` com mesmo body e response (`{success, error}`). Os campos novos (`jobId`, `printed_at`, `printer_ok`) são adicionais. Site funciona com qualquer versão; quando detectar `bridge_version >= 2.0.0` no `/health`, ativa os campos extras (já preparados no código web da Parte 1).

## Arquivos tocados neste passo

- **Novo**: `docs/PROMPT_CODEX_BRIDGE_V2.md` — único arquivo, pronto pra copiar e colar.

Nenhum código de produção é alterado. Bridge antiga continua rodando até você gerar o novo `.exe`.

