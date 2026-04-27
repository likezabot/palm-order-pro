## Diagnóstico certo

Não acho ideal refazer do zero o sistema inteiro de impressão. O núcleo bom já existe e deve ser preservado:

- `receipt-layout.ts` já é a fonte canônica do layout
- `thermal-printer.ts` já transforma esse layout em ESC/POS
- `sendToBridge()` só transporta base64 para a ponte
- a ponte/EXE não formata o talão

O problema está na camada web de orquestração e persistência, não no transporte.

### O que encontrei

1. **A configuração do Admin não está salvando no backend**
   - O console mostra erro real e objetivo:
   - `new row violates row-level security policy for table "settings"`
   - Hoje `savePrintConfig()` salva primeiro em `localStorage` e depois tenta gravar em `settings`, mas esse write está sendo negado.
   - Resultado: o preview muda na tela do Admin, mas o papel real pode continuar usando config antiga em outra instância/dispositivo/cache.

2. **Ainda existem múltiplos caminhos de entrada para impressão**
   Fluxo atual:
   ```text
   global-order-runtime / ações manuais
     -> print-service.ts
       -> print-receipt.ts
         -> thermal-printer.ts
           -> sendToBridge()
   ```
   O renderer já está centralizado, mas a decisão de qual tipo de cupom gerar ainda está espalhada.

3. **Há um furo importante no roteamento de delivery**
   - `autoPrintOrder()` já busca `service_type` e manda delivery para `printDelivery()`.
   - `manualPrintOrder()` também já trata delivery.
   - **Mas `autoPrintUpdate()` não busca `service_type` nem dados de delivery** e ainda pode cair em `printReceipt()` / `buildEscPosReceipt()` como se fosse mesa.
   - Isso explica por que pode continuar saindo `MESA: Delivery #...` em alguns cenários reais.

4. **O problema do Admin refletir no papel não é “só cache”**
   - Existe mecanismo de sync (`ensureFreshPrintConfig()`), mas ele só funciona se a gravação no backend der certo.
   - Como o save falha por RLS, a sincronização não resolve.

5. **Pelo código disponível, o bridge não contém template do talão**
   - `bridge/lp-bridge.js` apenas recebe base64 e envia bytes para a impressora.
   - Então **refazer bridge/EXE não resolve a causa principal**.

6. **Sobre bundle local vs URL remota**
   - O código e a documentação disponíveis apontam para app desktop/web carregando **URL remota** e usando **service worker/PWA**.
   - Também existe proteção de update (`updateViaCache: "none"`, leitura de `sw.js`, `APP_BUILD`).
   - Portanto, com o que está no repositório, o mais provável é:
     - ponte = transporte local
     - app = web remota/PWA
   - Ainda assim, pode haver cache antigo no dispositivo, mas **isso não explica o erro de persistência do Admin**, que já está confirmado.

## Recomendação

Em vez de “refazer tudo do zero”, eu recomendo uma **refatoração controlada da camada web de impressão**, preservando completamente:

- `bridge/lp-bridge.js`
- conexão USB
- envio base64
- fila/`print_jobs`
- automação de impressão

A ideia é **refazer a orquestração**, não o transporte.

## Plano proposto

1. **Consertar a persistência da configuração de impressão**
   - Ajustar o backend para permitir salvar **somente** `settings.key = 'print_config'` com segurança.
   - Manter `bridgeUrl` e `printMode` locais por dispositivo.
   - Garantir que o Admin mostre claramente:
     - salvo no backend
     - última atualização
     - origem da config (`db` ou `local`)

2. **Criar um dispatcher único de impressão**
   - Centralizar toda decisão em uma função única, algo como:
   - `resolvePrintJob(orderId, mode)`
   - Essa função vai carregar:
     - `service_type`
     - itens
     - cliente
     - telefone
     - endereço
     - pagamento
     - config atual
   - E então escolher um único documento válido:
     - mesa/pedido
     - delivery
     - conta
     - acréscimo
     - senha

3. **Eliminar roteamento legado espalhado**
   - Fazer `autoPrintOrder`, `autoPrintUpdate`, `manualPrintOrder`, `manualPrintBill`, `manualPrintDelta` virarem apenas wrappers finos do dispatcher.
   - Ninguém mais decide layout “na mão”.

4. **Bloquear combinações erradas**
   - `delivery` nunca pode usar layout de mesa
   - `pickup/balcão` nunca pode imprimir `MESA`
   - `waiter_name` vazio nunca pode virar `N/A`
   - se faltar dado crítico de delivery, avisar na UI e exigir confirmação manual quando aplicável

5. **Manter um único gerador real de ESC/POS**
   - Preservar `createReceiptLayoutModel()` como fonte única
   - Preservar `renderLayout()` como renderizador único
   - Redirecionar qualquer caminho antigo para esse modelo

6. **Melhorar diagnóstico visível no Admin**
   - Exibir:
     - `APP_BUILD`
     - `PRINT_ENGINE`
     - `config_updated_at`
     - `config_source`
   - Isso permite saber se o papel saiu da versão certa

7. **Fechar com testes de regressão**
   - mesa/pedido
   - delivery com taxa
   - delivery sem taxa
   - endereço longo
   - retirada/balcão
   - conta
   - senha
   - alteração do Admin refletindo no ESC/POS
   - nenhum caminho imprimindo `N/A`

## Decisão prática

**Minha recomendação é: sim, vale “refazer” a camada web de impressão, mas de forma cirúrgica e segura.**

Não refazer do zero o motor inteiro.
Não tocar no bridge.
Não tocar no USB.
Não tocar na automação.

O certo é:
- corrigir a persistência da config
- unificar o roteamento
- eliminar os caminhos legados que ainda escolhem o layout errado

## Detalhes técnicos

### Evidências confirmadas
- `src/lib/print-config.ts` grava em `settings`, mas o write falha por RLS
- `src/components/admin/PrintConfigPanel.tsx` depende desse save
- `src/lib/print-service.ts` ainda tem múltiplos entrypoints
- `src/lib/print-service.ts:autoPrintUpdate()` não carrega `service_type`
- `src/lib/thermal-printer.ts` já possui guard para delivery em alguns caminhos, mas não cobre tudo se o roteamento anterior omitir `extras.serviceType`
- `bridge/lp-bridge.js` apenas recebe payload base64

### Escopo preservado
Não mexer em:
- `bridge/lp-bridge.js`
- USB
- `print_jobs`
- fila de impressão
- banco de pedidos

Pode ser necessário mexer apenas em backend/config para liberar `print_config` com segurança.

### Resultado esperado após a refatoração
```text
Qualquer impressão
  -> dispatcher único
    -> carrega pedido + config atual
    -> escolhe documento correto
    -> createReceiptLayoutModel()
    -> renderLayout()
    -> sendToBridge()
```

Isso resolve a divergência entre preview, papel real e alterações do Admin.