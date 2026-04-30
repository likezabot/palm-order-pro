# 🐛 Bug: pedido novo do Palm cai no bridge mas não sai na impressora térmica

> Prompt pronto para colar no Codex / Claude Code / Cursor com acesso ao
> repositório `palm-order-pro`. Objetivo: descobrir por que o **primeiro
> pedido** de uma mesa não imprime, enquanto **adições** e **fechamento de
> conta** imprimem normalmente — usando exatamente o mesmo `.exe` da bridge
> e a mesma impressora USB.

---

## 1. Contexto técnico

**Stack:**
- Frontend: React 18 + Vite + TypeScript
- Backend: Supabase (Lovable Cloud) — tabela `orders` com `print_status`,
  `print_type`, `printed_at`, `version`, `delta_items`.
- Bridge local: `bridge/lp-bridge.js` (Node) escutando em
  `http://localhost:3001/print` e `/health`.
- Impressora: térmica ESC/POS USB (Bematech / Epson-compatível, 80mm).

**Pipeline do pedido novo (Palm → papel):**

```
Palm (src/pages/Palm.tsx + src/hooks/use-palm-cart.ts)
   └─ supabase.rpc('create_order', { p_items, p_total, p_should_print: true })
        └─ trigger no banco marca print_status='pending', print_type='full'
             └─ Realtime UPDATE → src/lib/global-order-runtime.ts
                  └─ claim_order_print(p_order_id) RPC
                       └─ src/lib/print-receipt.ts → autoPrintFullOrder()
                            └─ buildEscPosReceipt() em src/lib/thermal-printer.ts
                                 └─ createReceiptLayoutModel({ docType:'PEDIDO', ... })
                                      em src/lib/receipt-layout.ts
                                 └─ renderLayout(blocks, cfg) → Uint8Array ESC/POS
                            └─ sendToBridge(payload, 'http://localhost:3001/print')
```

**Pipeline da adição (que funciona):**

```
Palm adiciona itens → update_order_items RPC com p_delta_items
   └─ trigger marca print_status='pending', print_type='delta'
        └─ mesmo claim → buildEscPosDelta() → renderLayout()
```

**Pipeline do fechar conta (que funciona):**

```
Cashier → pay_order RPC com p_should_print=true
   └─ trigger marca print_status='pending', print_type='bill'
        └─ mesmo claim → buildEscPosBill() → renderLayout()
```

Os três caminhos convergem em `renderLayout()` em `src/lib/thermal-printer.ts`
e usam o **mesmo** `EscPosBuilder`. **Isso é importante** — significa que a
divergência é nos **dados de entrada** (`order.total`, `items`) ou em qual
ramo do `switch (blk.kind)` o pedido novo aciona.

---

## 2. Sintoma exato

| Cenário | Bridge `/print` HTTP | Bridge log "sent N bytes" | Papel sai? |
|---|---|---|---|
| Palm → **primeiro pedido** da mesa | ✅ 200 OK | ✅ Sim | ❌ **Não** |
| Palm → **adição** em pedido existente | ✅ 200 OK | ✅ Sim | ✅ Sim |
| Cashier → **fechar conta** | ✅ 200 OK | ✅ Sim | ✅ Sim |

Mesmo `.exe` (`bridge/lp-bridge.js` empacotado), mesma impressora USB001,
mesma sessão.

### Evidência crítica encontrada nos network logs do navegador

Decodificando o `payload` (base64) do **POST /print** do pedido novo:

```
ESC @
... PLANO B ESPETARIA ...
MESA: 1
GARCOM: Jose
1x PANCETA SUINA   R$10.00
1x CORACAO DE FRANGO  R$10.00
1x COCA-COLA 350ml  R$9.00
TOTAL: R$ 0.00              ← ⚠️ deveria ser R$ 29,00
Qtd itens: 3
```

Decodificando o payload do **fechar conta** capturado minutos antes:

```
*** CONTA ***
... 4 itens ...
TOTAL: R$ 79.00            ← correto
```

O total saindo `R$ 0,00` no pedido novo é o **canário** — confirma que
`order.total` chega como `null`/`0` no momento em que `buildEscPosReceipt`
é chamado. Algumas impressoras térmicas com firmware mais rígido tratam
sequências ESC/POS "estranhas" (total zerado + alinhamento `ESC a 1` sem
reset entre blocos) como **buffer corrompido** e descartam silenciosamente
o job, mesmo depois de já ter aceitado os bytes pelo USB.

---

## 3. Hipóteses ranqueadas

### H1 — `order.total` é `null`/`0` no momento do `claim` ⭐ mais provável

Em `src/lib/global-order-runtime.ts` o caminho do **autoPrint do pedido
novo** lê `order.total` direto da row recebida pelo Realtime
(`postgres_changes`). Mas o `total` na tabela `orders` é populado por
**trigger** depois do INSERT em `order_items` — pode haver janela em que
o `UPDATE` que dispara o `print_status='pending'` chega **antes** do
trigger somar.

Resultado: `buildEscPosReceipt(tableName, waiterName, items, /*total=*/ 0, cfg)`.

→ Inspecionar:
- `supabase/migrations/*` — qual trigger seta `total` e em que ordem com
  `print_status`.
- `src/lib/global-order-runtime.ts` — onde `total` é lido. Se vier de
  `order.total`, recalcular client-side: `items.reduce((s, i) => s + i.product_price * i.quantity, 0)`.
- `src/lib/print-receipt.ts` — função que monta o "PEDIDO" inicial.

### H2 — Codepage ausente no header

`src/lib/thermal-printer.ts` faz `ESC @` (reset) mas **nunca** envia
`ESC t <n>` para selecionar codepage CP850/CP1252. Itens sem acento
(adição, conta) sobrevivem; itens com `Ç`, `Ã` no pedido novo podem
estourar buffer.

Olhar `EscPosBuilder.text()` — hoje ele faz `.normalize("NFD").replace(/[\u0300-\u036f]/g, "")` então **remove acentos** antes de enviar. Se a remoção está funcionando, H2 cai. **Verificar com hex dump real do payload enviado.**

### H3 — Falta de `GS V` (cut) ou `LF` final

`renderLayout` só emite `cut` se houver um bloco `kind:"cutMark"` no
layout. Conferir em `src/lib/receipt-layout.ts` se `createReceiptLayoutModel`
para `docType:'PEDIDO'` realmente termina com `cutMark`. Se não, papel
fica preso, impressora aguarda mais bytes e pode resetar o buffer
sozinha após timeout.

### H4 — Atributos não-fechados entre blocos

`renderLayout` faz `b.resetStyle()` antes/depois de cada bloco — isso
reduz risco. Mas o bloco `item` faz:

```ts
b.bold(true).text(qtyStr).bold(false).text(displayName);
if (priceStr) b.line(priceStr);
else b.line("");
```

Se `priceStr` vem vazio (o que acontece quando `subtotal === 0`!) o
caminho `b.line("")` apenas envia `LF` — mas o `text(displayName)`
anterior nunca recebeu seu próprio `LF`. Resultado: nome do item +
próximo bloco grudados, e em algumas impressoras o stream fica
desalinhado.

→ Combinado com H1 (subtotal=0), isso pode quebrar o stream inteiro.

---

## 4. Roteiro de diagnóstico

### Passo 1 — Capturar payloads reais

No DevTools do navegador, na aba Network, filtrar por `localhost:3001/print`,
pegar o JSON body, extrair `payload` (base64) de:

- **A:** Um pedido novo (que não imprimiu)
- **B:** Uma adição ao mesmo pedido (que imprimiu)
- **C:** Um fechamento de conta (que imprimiu)

Salvar em `tmp/payload-A.b64`, `tmp/payload-B.b64`, `tmp/payload-C.b64`.

### Passo 2 — Hex diff

```bash
for f in A B C; do
  base64 -d tmp/payload-$f.b64 | xxd > tmp/payload-$f.hex
done
diff tmp/payload-A.hex tmp/payload-C.hex | head -100
```

Procurar:
- `1b 40` (ESC @) no início — **deve** estar nos três
- `1d 56` (GS V — cut) no fim — **deve** estar nos três
- `1b 74` (ESC t — codepage) — provavelmente ausente nos três (ok, já
  faz strip de acentos)
- Bytes `00` no meio — sinal de buffer corrompido
- Sequência `1b 45 01 ... 1b 45 00` (bold on/off) — ver se fecha sempre

### Passo 3 — Log do `order` no claim

Adicionar log temporário em `src/lib/global-order-runtime.ts`, no ponto
onde o `claim_order_print` retorna `true`, **antes** de chamar o builder
do recibo:

```ts
debugLog.info("print", "[debug-h1] order pré-build", {
  id: order.id,
  total: order.total,
  totalType: typeof order.total,
  itemsCount: items.length,
  itemsSum: items.reduce((s, i) => s + i.product_price * i.quantity, 0),
  print_type: order.print_type,
});
```

Se `total: 0` mas `itemsSum: 29` → **H1 confirmada**, fix é recalcular
client-side.

### Passo 4 — Teste binário direto na USB (Windows)

```powershell
$b64 = Get-Content tmp\payload-A.b64 -Raw
$bytes = [Convert]::FromBase64String($b64)
[System.IO.File]::WriteAllBytes("C:\temp\novo.bin", $bytes)
copy /b C:\temp\novo.bin USB001
```

Repetir com `payload-C.b64`. Se **A** não imprime e **C** imprime
mandando direto pela USB sem passar pela bridge → bug está nos bytes
gerados pelo frontend, não na bridge.

### Passo 5 — Hex dump na própria bridge

Em `bridge/lp-bridge.js`, no handler `/print`, antes de escrever na
porta:

```js
console.log(`[bridge] payload ${buf.length} bytes`);
console.log(buf.toString('hex').match(/.{1,32}/g).join('\n'));
```

Reiniciar bridge, fazer um pedido novo, copiar o hex impresso e comparar
com o hex gerado em A.

---

## 5. Onde corrigir (ordem sugerida)

1. **`src/lib/global-order-runtime.ts`** — recalcular total a partir de
   `items` se `order.total` for `null`/`0`/`undefined`:

   ```ts
   const safeTotal = (order.total && order.total > 0)
     ? order.total
     : items.reduce((s, i) => s + i.product_price * i.quantity, 0);
   ```

2. **`src/lib/thermal-printer.ts`** — adicionar codepage logo após reset
   no `EscPosBuilder.reset()`:

   ```ts
   reset() {
     this.buffer.push(ESC, 64);          // ESC @
     this.buffer.push(ESC, 116, 16);     // ESC t 16 → CP1252 (Windows-1252)
     return this;
   }
   ```

3. **`src/lib/receipt-layout.ts`** — garantir que `createReceiptLayoutModel`
   sempre termina com `{ kind: 'cutMark' }` para `docType:'PEDIDO'`.

4. **`src/lib/thermal-printer.ts`** — no bloco `item`, mover o `LF` para
   sempre depois do nome:

   ```ts
   b.bold(true).text(qtyStr).bold(false).line(displayName);
   if (priceStr) b.align("right").line(priceStr).align(align);
   ```

---

## 6. Critérios de aceite

- [ ] Pedido novo do Palm imprime no papel em ≤ 2s após `create_order`.
- [ ] Linha `TOTAL: R$ X,XX` do papel bate com `items.reduce(...)`.
- [ ] Hex dump do payload do pedido novo termina com `1d 56 41 03` (cut
      parcial) ou `1d 56 00` (cut total).
- [ ] `payload-A.bin` mandado direto via `copy /b ... USB001` imprime
      sozinho.
- [ ] Teste de regressão `src/lib/__tests__/receipt-layout.full-order.test.ts`
      passa (ver §7).

---

## 7. Snippet de teste reproduzível (Vitest)

Criar `src/lib/__tests__/receipt-layout.full-order.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildEscPosReceipt } from "../thermal-printer";
import type { PrintConfig } from "../print-config";
import type { ReceiptItem } from "../receipt-layout";

const cfg: PrintConfig = {
  paperWidth: "80mm",
  contentAlign: "center",
  showWaiter: true,
  // ... resto dos defaults
} as PrintConfig;

const items: ReceiptItem[] = [
  { product_name: "Panceta Suina",     product_price: 10, quantity: 1, subtotal: 10 },
  { product_name: "Coracao de frango", product_price: 10, quantity: 1, subtotal: 10 },
  { product_name: "Coca-Cola 350ml",   product_price:  9, quantity: 1, subtotal:  9 },
];

describe("buildEscPosReceipt — pedido novo", () => {
  it("inclui total != 0 quando há itens", () => {
    const buf = buildEscPosReceipt("Mesa 1", "Jose", items, 29, cfg);
    const txt = new TextDecoder("ascii").decode(buf);
    expect(txt).toMatch(/TOTAL.*29[.,]00/);
    expect(txt).not.toMatch(/TOTAL.*0[.,]00/);
  });

  it("sempre termina com comando de corte (GS V)", () => {
    const buf = buildEscPosReceipt("Mesa 1", "Jose", items, 29, cfg);
    // GS V A 3  =  0x1d 0x56 0x41 0x03
    const tail = Array.from(buf.slice(-4));
    expect(tail).toEqual([0x1d, 0x56, 0x41, 0x03]);
  });

  it("começa com ESC @ (reset) e idealmente ESC t (codepage)", () => {
    const buf = buildEscPosReceipt("Mesa 1", "Jose", items, 29, cfg);
    expect(buf[0]).toBe(0x1b);
    expect(buf[1]).toBe(0x40);
  });

  it("regressão: total não pode ficar 0 quando items somam > 0", () => {
    // Simula o bug atual: order.total chega null
    const totalFromCaller = 0;
    const buf = buildEscPosReceipt("Mesa 1", "Jose", items, totalFromCaller, cfg);
    const txt = new TextDecoder("ascii").decode(buf);
    // Esperado APÓS o fix: builder defensivo recalcula
    expect(txt).not.toMatch(/TOTAL.*0[.,]00/);
  });
});
```

O 4º teste **vai falhar hoje** — esse é o ponto. O fix em
`global-order-runtime.ts` (ou diretamente no builder) faz ele passar.

---

## 8. Resumo executivo para colar no Codex

> No projeto `palm-order-pro`, pedidos novos do Palm chegam no bridge
> local (`localhost:3001/print`) com HTTP 200, mas a impressora térmica
> não imprime. Adições ao pedido e fechamento de conta imprimem
> normalmente. O payload base64 capturado mostra `TOTAL: R$ 0.00` em
> pedidos novos com itens reais. Suspeita: `order.total` chega como
> `null` no `claim_order_print` antes do trigger somar, e o stream
> ESC/POS resultante (combinado com falta de codepage e possível ausência
> de `GS V` final) é descartado silenciosamente pela impressora.
>
> Tarefa: validar as 4 hipóteses na seção 3, aplicar os fixes da seção 5
> e fazer os testes da seção 7 passarem. Não tocar em RPC do Supabase
> sem antes confirmar que o problema é client-side via passos 1–4 da
> seção 4.
