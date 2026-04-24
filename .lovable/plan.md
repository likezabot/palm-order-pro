

# Diagnóstico: pedido novo do Palm não sai na impressora, mas adições/fechamento saem

## O sintoma

- **Palm → primeiro pedido de uma mesa** → bridge `.exe` recebe o POST `/print`, retorna OK, mas **nada sai na impressora**.
- **Palm → adição em pedido existente / Cashier → fechar conta** → bridge recebe, retorna OK, **imprime normalmente**.

Mesmo `.exe`, mesma impressora, mesmo endpoint. Só muda o *tipo* do pedido.

## Evidência nos logs

Olhando os network requests da sessão atual:

1. `POST http://localhost:9100/print` às `02:15:11Z` — `Failed to fetch` (na verdade nem chegou ao bridge, porque o bridge estava offline naquele momento — `health` falhou logo antes). Mas o payload em si **decodificado em base64** revela algo importante.

2. Decodificando o payload do pedido novo (mesa 1, Jose, 3 itens):
   ```
   ESC @ ... PLANO B ESPETARIA ... MESA: 1 ... 1x PANCETA SUINA R$10.00 ...
   1x CORACAO DE FRANGO R$10.00 ... 1x COCA-COLA ... R$9.00 ...
   TOTAL: R$ 0.00          ← ⚠️
   Qtd itens: 3
   ```
   **Total impresso = R$ 0,00**, embora itens somem R$ 29,00.

3. Já o payload de **fechar conta** (request anterior, 01:58:53Z) traz:
   ```
   *** CONTA *** ... TOTAL: R$ 79.00
   ```
   Com total correto.

## Hipótese mais provável (a investigar no codex)

O layout do recibo do **pedido novo** (`print_type = 'full'` / pedido inicial) está sendo gerado com um **bug de cálculo / dado faltante** que produz uma string ESC/POS **válida sintaticamente, mas com algum byte de controle que faz a impressora térmica ignorar / engolir o job em silêncio**. Suspeitos típicos:

1. **Total = 0** vindo de `order.total` ainda `null` no momento da montagem do recibo (a primeira gravação do pedido só preenche `total` depois do trigger; o builder do recibo lê antes).
2. **Comando ESC/POS malformado ao montar a seção de itens** (ex.: alinhamento `ESC a` enviado dentro do meio de uma linha em negrito sem fechar atributos), o que algumas impressoras Bematech/Epson interpretam como "pular buffer".
3. **Falta de `LF` / `\n` final** ou **falta de `GS V` (cut)** no fim do payload do pedido novo — bridge devolve sucesso (gravou no spooler), mas a impressora espera o cut para liberar o papel.
4. **Codepage**: caracteres acentuados (`PANCETA SUÍNA`, `CORAÇÃO`) são gerados sem `ESC t <codepage>` no início do pedido novo, mas com codepage no fechar conta. Resultado: impressora rejeita o job ao encontrar byte fora da tabela.

A **diferença comportamental** (adição imprime, novo não) é o melhor sinal: o builder de adição usa o helper `delta-items` + `receipt-layout` que está correto. O builder do pedido novo (caminho `Palm → enqueue → claim → print full`) provavelmente passa por um path divergente.

## O que vou entregar

Um único arquivo **`docs/PROMPT_CODEX_BUG_IMPRESSAO_PEDIDO_NOVO.md`** com um prompt pronto para colar no Codex (ou em qualquer LLM com acesso ao repositório), contendo:

### 1. Contexto resumido
- Stack: React + Supabase + bridge local Node (`bridge/lp-bridge.js` na porta 9100), impressora ESC/POS USB.
- Pipeline: Palm cria pedido → `enqueue` → worker `claim_order_print` → monta payload em `src/lib/receipt-html.ts` + `src/lib/receipt-layout.ts` + `src/lib/thermal-printer.ts` → POST `/print` no bridge.

### 2. Sintoma exato
- Pedido novo: bridge 200 OK, papel não sai.
- Adição / fechar conta: bridge 200 OK, papel sai.
- Total no payload do pedido novo aparece como `R$ 0.00` mesmo com itens somando R$ 29,00 (evidência decodificada do base64 capturado no network log).

### 3. Hipóteses ranqueadas (com onde olhar)

| # | Hipótese | Arquivo a inspecionar |
|---|---|---|
| 1 | `order.total` ainda `null` quando o recibo é montado | `src/lib/global-order-runtime.ts` (caminho do `claim` → `buildPayload`) e `src/lib/receipt-layout.ts` |
| 2 | Codepage ausente no header do pedido novo (`ESC t`) | `src/lib/thermal-printer.ts` (comparar header de `buildFullReceipt` vs `buildBillReceipt`) |
| 3 | Falta de `GS V` (cut) no fim do payload do pedido novo | mesmo arquivo, função final de fechamento |
| 4 | Atributos ESC (`ESC E 1` negrito) não-fechados antes de `ESC a` | `src/lib/receipt-layout.ts` linhas que misturam alinhamento + bold |

### 4. Roteiro de diagnóstico que o Codex deve seguir
1. Decodificar base64 dos dois payloads (novo vs fechar) e fazer **diff byte a byte**.
2. Logar `order` completo no momento do `claim` antes de chamar `buildFullReceipt`.
3. Rodar o bridge com `console.log(buffer.toString('hex'))` para confirmar o que chega.
4. Testar manualmente via PowerShell:
   ```powershell
   $bytes = [Convert]::FromBase64String("<payload_novo>")
   [System.IO.File]::WriteAllBytes("C:\temp\novo.bin", $bytes)
   copy /b C:\temp\novo.bin USB001
   ```
   Se `novo.bin` não imprime mas `fechar.bin` imprime → bug é no payload, não no bridge.

### 5. Critério de aceite
- Pedido novo do Palm imprime na térmica em ≤2s.
- `Total: R$ X,XX` no recibo bate com soma dos itens.
- `payload` do pedido novo passa no mesmo teste binário direto na porta USB.

### 6. Snippet de teste reproduzível (TypeScript)
Um pequeno script que monta um pedido fake com 3 itens, chama o builder e compara o output com o esperado — para o Codex rodar via `vitest` e pegar a regressão.

## Arquivos tocados

- **Novo**: `docs/PROMPT_CODEX_BUG_IMPRESSAO_PEDIDO_NOVO.md` — único arquivo, pronto para você copiar e colar onde precisar.

Nada de código de produção é alterado neste passo — é só o prompt de diagnóstico.

