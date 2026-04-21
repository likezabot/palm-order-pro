

## Indicador de status de impressão (enviando / impresso / falhou)

Mostrar visualmente quando a impressão local (modo browser ignora) ou via ponte térmica realmente termina, tanto na **tela de sucesso** quanto no **botão de reimprimir senha**, com animação enquanto imprime.

### Comportamento

**Tela `OrderSuccess`** (após criar pedido com `should_print=true` e for BALCÃO com senha):
- Hoje: dispara `printSenha` em `setTimeout(800ms)` e ignora o retorno (`Promise<boolean>`).
- Novo: rastrear o estado da promessa e exibir um chip visual abaixo da senha:
  - `idle` (modo browser, sem ponte): nada.
  - `printing`: ícone `Printer` com animação `animate-pulse` + barra de progresso indeterminada (estilo "papel saindo") + texto **"Imprimindo senha..."**.
  - `success`: ícone `CheckCircle2` verde claro + **"Senha impressa ✓"** (fade-in).
  - `error`: ícone `AlertTriangle` + **"Falha na impressão"** + botão pequeno "Tentar de novo" (chama `printSenha` com `force=true`).
- O auto-reset de 5s só dispara **após** o estado atingir `success` ou `error` (ou após 8s de fallback se ficar travado em `printing`), evitando "saltar" para a próxima tela enquanto a impressão ainda está em andamento.
- Botão **"IMPRIMIR NOVAMENTE"** ganha mesmos 3 estados visuais (idle/printing/success/error), com `disabled` durante `printing`, ícone girando e texto dinâmico.

**Botão "Reimprimir senha" no header de `OrderReview`** (BALCÃO + pedido existente):
- Hoje já tem `reprinting` boolean + `RotateCw` com `animate-spin`.
- Acrescentar feedback de resultado **inline** por 2.5s:
  - Durante: `RotateCw animate-spin` + "Reimprimindo..."
  - Sucesso: `CheckCircle2` verde + "Impresso ✓" (substitui o texto por 2.5s, depois volta).
  - Erro: `AlertTriangle` + "Falhou" (substitui por 2.5s).
- Estado visual via novo `reprintStatus: "idle" | "printing" | "success" | "error"` no componente.

### Animação de impressão

Adicionar duas keyframes utilitárias em `tailwind.config.ts`:
- `print-feed`: barra horizontal de 0% → 100% de largura, repetindo (efeito "papel saindo da impressora"), 1.4s linear infinite.
- `print-bounce`: ícone `Printer` com leve `translateY` ±2px, 0.6s ease-in-out infinite.

Componente reusável **`PrintStatusBadge`** (`src/components/palm/PrintStatusBadge.tsx`):
```tsx
type Status = "idle" | "printing" | "success" | "error";
interface Props { status: Status; labelPrinting?: string; labelSuccess?: string; labelError?: string; }
```
Renderiza chip arredondado com cor/ícone/texto conforme status + barrinha animada quando `printing`. Usa tokens (`bg-white/15`, `text-white`, `bg-success/20`, etc).

### Como saber se "imprimiu" de fato

`printSenha` já retorna `Promise<boolean>`:
- `true` quando `sendToBridge` confirmou (ponte respondeu OK).
- `false` quando: modo browser (não imprime senha por design), ponte falhou, ou toggle desativado.

Distinguir os 3 casos:
1. Antes de chamar, verificar `loadPrintConfig().printMode`. Se ≠ `"bridge"`, status fica em `idle` e exibe nota cinza **"Impressão local desativada"** (sem barrinha, sem erro).
2. Se `bridge`, status vai para `printing` → resolve para `success` (true) ou `error` (false).
3. Timeout de segurança de 8s no estado `printing` → vira `error` ("Sem resposta da impressora").

### Arquivos afetados

- **Novo**: `src/components/palm/PrintStatusBadge.tsx` — chip visual com 3 estados + barra animada.
- **Editado**: `src/components/palm/OrderSuccess.tsx` — substituir disparo "fire-and-forget" por `useState<Status>` + `await printSenha(...)`, gating do auto-reset, render do badge, botão "Imprimir novamente" com mesmos estados, expor estado de modo browser, timeout 8s.
- **Editado**: `src/components/palm/OrderReview.tsx` — `handleReprint` passa a usar `reprintStatus` (idle/printing/success/error) em vez de só boolean; botão muda ícone+label conforme estado por 2.5s após resolver.
- **Editado**: `tailwind.config.ts` — adicionar keyframes `print-feed` e `print-bounce` + classes `animate-print-feed` e `animate-print-bounce`.

### Sem alterações
- Nenhuma mudança em banco, RPCs, lógica de impressão (`printSenha` / `reprintSenhaForOrder` mantêm assinatura).
- Não muda o comportamento real da impressora — apenas torna o resultado **visível** ao usuário.
- Não interfere no fluxo de envio de pedido nem no anti-multiclique já implementado.

