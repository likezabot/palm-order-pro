

## Hardening do fluxo de envio de pedido (anti-multiclique, anti-race, sem overlay travado)

### Causa raiz

A tela `OrderReview` permite múltiplos disparos concorrentes do envio:

1. **Botões do `AlertDialog` "Deseja imprimir?"** (`Enviar e imprimir` / `Enviar sem imprimir`) são `<button>` puros, **sem `disabled`**. Dois toques rápidos (~50ms) disparam `handleFinalize` duas vezes antes do `setSending(true)` propagar — a guarda `if (sending) return` lê estado **stale**.
2. O guard usa `useState` em vez de `useRef`, então não bloqueia chamadas no mesmo tick.
3. Não há **timeout de segurança**: se a RPC travar (rede ruim no celular), o botão fica em `"ENVIANDO..."` para sempre.
4. `OrderSuccess` usa `min-h-screen` (100vh) em vez de `h-[100dvh]` — em iPhone com safe-area + body com `padding-top/bottom`, o verde "vaza" acima e abaixo do conteúdo (faixas verdes nas screenshots). Combinado com transição de step, dá o efeito de "overlay verde grande quebrado".
5. Em caso de erro silencioso (ex.: throw fora do catch, navegação interrompida), `sending` nunca volta a `false`.
6. Sem cancelamento/ignore de respostas tardias — se o usuário recarregar/voltar e a RPC responder depois, há `setState` em componente desmontado.

### Solução (refator estrutural mas pequeno em superfície)

**1. Lock por `useRef` + máquina de estados explícita em `OrderReview`**

Substituir `const [sending, setSending] = useState(false)` por uma máquina:
```tsx
type SendState = "idle" | "sending" | "success" | "error";
const [sendState, setSendState] = useState<SendState>("idle");
const sendingRef = useRef(false);          // lock síncrono real
const mountedRef = useRef(true);
useEffect(() => () => { mountedRef.current = false; }, []);

const safeSet = (s: SendState) => { if (mountedRef.current) setSendState(s); };
```

`handleFinalize` no topo:
```tsx
if (sendingRef.current) return;            // bloqueio síncrono — imune a stale state
sendingRef.current = true;
safeSet("sending");
setShowConfirm(false);
```

No `finally`, sempre liberar o lock:
```tsx
} finally {
  sendingRef.current = false;
  // safeSet("idle") só se ainda estamos na tela (sucesso navega para fora)
  if (mountedRef.current && sendState !== "success") safeSet("idle");
}
```

**2. Timeout de segurança de 20s**

Antes do `await supabase.rpc(...)`, criar:
```tsx
const timeoutId = setTimeout(() => {
  if (sendingRef.current) {
    sendingRef.current = false;
    safeSet("error");
    toast({ title: "Tempo esgotado", description: "Verifique a conexão e tente de novo.", variant: "destructive" });
  }
}, 20000);
```
Limpar no `finally` com `clearTimeout(timeoutId)`.

**3. Botões do AlertDialog realmente desabilitados durante envio**

Em `OrderReview.tsx`, os dois botões "Enviar e imprimir" / "Enviar sem imprimir" passam a ter:
```tsx
<button
  type="button"
  disabled={sendState === "sending"}
  onClick={() => handleFinalize(true)}
  className="... disabled:opacity-40 disabled:pointer-events-none"
>
```
Adicionar `pointer-events-none` quando `sending` para garantir bloqueio mesmo durante animação de fechamento do Radix.

**4. Trigger do dialog também protegido**

`OrderReviewFooter` já recebe `sending` — passar `sendState === "sending"` no lugar e garantir que `onFinalize` (que abre o `AlertDialog`) seja ignorado se o lock estiver ativo. No `OrderReview`:
```tsx
onFinalize={() => { if (!sendingRef.current) setShowConfirm(true); }}
```

**5. Corrigir `OrderSuccess` para não vazar nas safe-areas**

Em `src/components/palm/OrderSuccess.tsx`:
- Trocar `min-h-screen` por `min-h-[100dvh] w-full fixed inset-0` para cobrir a viewport real do iPhone (incluindo área da safe-area, já que o `bg-success` é intencional como fundo cheio).
- Adicionar `overflow-hidden` para garantir que nada extrapole.
- Adicionar `mountedRef` + `clearTimeout` defensivo (já existe parcial, reforçar).
- Garantir que o `setTimeout(onReset, ...)` só dispare uma vez (`useRef` flag), evitando reset duplo se o componente reabrir.

**6. Ignorar respostas tardias de RPC**

Adicionar um `requestIdRef` que incrementa a cada `handleFinalize`. Após o `await`, comparar:
```tsx
const myReq = ++requestIdRef.current;
const { data, error } = await supabase.rpc(...);
if (myReq !== requestIdRef.current) return;   // request antiga, descarta
```

**7. Botão `Reimprimir senha` (no header) também precisa de lock** — está disparando RPC sem proteção contra duplo toque. Adicionar `useRef` próprio (`reprintingRef`) + `disabled` visual.

### Arquivos afetados

- **`src/components/palm/OrderReview.tsx`** — máquina de estados (`idle/sending/success/error`), `useRef` lock, `mountedRef`, timeout de 20s, `requestIdRef`, botões do AlertDialog com `disabled` + `pointer-events-none`, lock no botão "Reimprimir senha".
- **`src/components/palm/OrderReviewFooter.tsx`** — receber `sendState` em vez de `sending`, expor `disabled` correto, garantir `pointer-events-none` durante envio.
- **`src/components/palm/OrderSuccess.tsx`** — `fixed inset-0` + `min-h-[100dvh]` + `overflow-hidden`, ref para `onReset` único, cleanup robusto de timers.

### Resultado esperado

- Tocar 10x rápido em "Enviar e imprimir" → 1 RPC apenas; demais cliques ignorados silenciosamente.
- RPC travada por mais de 20s → toast de erro, botão volta para "FINALIZAR PEDIDO" usável.
- Sem faixa verde "vazando" acima/abaixo no iPhone — `OrderSuccess` cobre a viewport inteira corretamente.
- Sem `setState` em componente desmontado (sem warnings no console).
- Sem botão eternamente em "ENVIANDO...".
- Visual idêntico ao atual em fluxo normal — só fica robusto sob uso agressivo.

### Notas

- Sem mudança de banco, sem mudança de RPCs, sem mudança de tipos.
- Preserva 100% do comportamento de impressão, conflito de mesa e versão otimista.
- Não altera o `Button` global (`src/components/ui/button.tsx`) — o lock fica local ao fluxo crítico para não afetar performance de cliques rotineiros.

