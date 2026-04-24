# Corrigir falha de impressão no desktop integrado

## Problema identificado
Há 3 falhas combinadas:

1. A URL da bridge está sendo tratada como configuração global e sincronizada entre dispositivos. Isso faz `localhost` ou outro endereço “vazar” entre celular, web e desktop.
2. O frontend ainda interpreta o `/health` com o formato antigo da bridge (`printer_connected`) e pode marcar a bridge como indisponível/inválida mesmo com a v2.2 rodando.
3. A impressão manual no PDV está com bug de UI: `manualPrintOrder()` retorna um objeto, mas a tela trata isso como booleano e mostra sucesso mesmo quando a impressão falhou.

## O que vou implementar

### 1. Separar config compartilhada da config local do dispositivo
Vou ajustar `src/lib/print-config.ts` para que:
- layout do cupom continue sincronizado entre dispositivos
- `bridgeUrl` fique local por dispositivo
- `printMode` também possa permanecer local, evitando um device forçar o outro para modo bridge/browser

Isso evita que o desktop fique preso numa URL errada e evita que o celular receba `localhost`.

### 2. Compatibilizar o frontend com a bridge v2.2
Vou atualizar `src/lib/thermal-printer.ts` para aceitar os dois contratos de health:
- legado: `printer_connected`
- novo: `printer_ready`, `printer_name`, `printer_method`, `bridge_version`

Também vou melhorar a leitura de erro para distinguir:
- bridge offline
- bridge online sem impressora pronta
- timeout/localhost inacessível

### 3. Corrigir o diagnóstico e a UX do admin
Vou ajustar `src/components/admin/PrinterDiagnostics.tsx` e `src/components/admin/PrintConfigPanel.tsx` para:
- mostrar claramente quando a URL é local do dispositivo
- não sobrescrever a URL local com sync remoto
- refletir corretamente o status da bridge v2.2
- manter a mesma tela no web e no desktop, mas com comportamento de configuração local

### 4. Corrigir a impressão manual que hoje dá falso positivo
Vou corrigir `src/pages/Pdv.tsx` para tratar `ManualPrintResult` corretamente, igual ao fluxo já mais seguro do caixa.

Resultado esperado:
- não exibir “Cupom enviado para impressão!” quando a bridge falhar
- mostrar erro real ou status de fila
- alinhar o comportamento do PDV com `src/pages/Cashier.tsx`

### 5. Garantir que a fila local respeite o novo health
Vou validar `src/lib/print-queue-worker.ts` indiretamente via normalização do status, para que retries não parem por interpretar errado a resposta da bridge.

## Arquivos principais
- `src/lib/print-config.ts`
- `src/lib/thermal-printer.ts`
- `src/components/admin/PrinterDiagnostics.tsx`
- `src/components/admin/PrintConfigPanel.tsx`
- `src/pages/Pdv.tsx`

## Resultado esperado
Depois disso:
- o desktop pode usar `http://localhost:9100/print` sem quebrar o celular
- o celular pode usar `http://IP_DO_PC:9100/print` sem contaminar o desktop
- o admin mostra o status real da bridge integrada v2.2
- a impressão manual não vai mais mentir que imprimiu quando falhou
- os testes Health / Mínimo / Cupom ficam coerentes com o que a bridge realmente respondeu

## Detalhes técnicos
- Preservar localmente `bridgeUrl` e `printMode` ao fazer `syncPrintConfigFromDb()`
- Normalizar health com algo como:
  - `printer_connected ?? printer_ready ?? false`
- Ler metadados novos do payload bruto (`bridge_version`, `printer_name`, `printer_method`)
- Ajustar `Pdv.tsx` para verificar `result.ok`, `result.bridgeOk` e `result.queued` em vez de usar truthiness do objeto

Se você aprovar, eu implemento essas correções no frontend agora.