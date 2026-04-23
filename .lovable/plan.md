

# Plano: aba "Rede" individual por dispositivo + linguagem simples

## O que muda

A aba "Rede" hoje mostra "Internet (do PC/tablet)" de forma genérica. Você quer:

1. **Identificar o dispositivo atual** (esse celular, esse PC, esse tablet) com nome amigável.
2. **Medir a internet desse aparelho específico** (não genérico).
3. **Mostrar um resumo em linguagem simples**, tipo "📶 Sua internet está ruim, pode travar pedidos" em vez de "latência 850ms".

## Como vai aparecer

### Cabeçalho da aba
```
📱 Este dispositivo: iPhone de Jose (Palm)
   Última verificação: agora mesmo
```

Detecta automaticamente:
- **Tipo**: celular / tablet / PC (via `navigator.userAgent` + viewport)
- **Modo de uso**: Palm / Cozinha / Caixa / Admin (rota atual)
- **Nome opcional editável**: salvo em `localStorage` (ex.: "Tablet do balcão")

### 3 cards com resumo simples

**Card 1 — Sua internet (deste aparelho)**
```
🟢 Boa — 45ms
Tudo funcionando normal nesse celular.
```
ou
```
🟡 Lenta — 650ms
Sua internet está oscilando. Pedidos podem demorar pra chegar.
```
ou
```
🔴 Ruim — sem resposta
Esse aparelho está sem internet. Verifique Wi-Fi ou dados móveis.
```

**Card 2 — Servidor**
```
🟢 Online — 120ms
Servidor respondendo bem.
```

**Card 3 — Impressora local** (só aparece se a rota usar impressora — Caixa/Admin/Estação)
```
🔴 Desligada
A impressora não está respondendo. Pedidos ficam na fila.
```

No celular do garçom (Palm), o card da impressora **não aparece** (não faz sentido).

### Resumo geral no topo

Uma linha resumo acima dos cards:
```
✅ Tudo ok neste aparelho
```
ou
```
⚠️ Internet do seu celular está lenta — pedidos podem atrasar
```
ou
```
❌ Sem conexão neste aparelho
```

## Arquivos a editar

**`src/components/admin/NetworkTab.tsx`** (reescrita):
- Detecta dispositivo: `getDeviceInfo()` retorna `{ type: 'mobile'|'tablet'|'desktop', name, role }`.
- Nome editável persistido em `localStorage` (`device_friendly_name`).
- Card de impressora condicional (oculto em rotas que não imprimem).
- Mensagens em **português coloquial**, sem termos técnicos no card principal.
- Latência ainda aparece, mas como secundária (cinza, pequena).
- Mantém sparkline e botão "Testar agora".

**Novo helper**: `src/lib/device-info.ts`
- `getDeviceType()`: classifica via UA + `window.innerWidth`.
- `getDeviceFriendlyName()`: lê/salva localStorage.
- `getCurrentRole()`: extrai da rota (`/palm`, `/kitchen`, `/cashier`, etc.).

## Tradução técnico → simples

| Técnico (antes) | Simples (depois) |
|---|---|
| Latência 45ms | 🟢 Boa |
| Latência 350ms | 🟡 Lenta |
| Latência > 800ms | 🔴 Ruim |
| Offline | ❌ Sem conexão |
| Realtime TIMED_OUT | "Servidor demorando pra responder" |
| Bridge 9100 offline | "Impressora desligada" |

## Resultado prático

- Garçom abre Admin no celular dele → vê **"📱 Celular do João — Sua internet está boa"**.
- Caixa abre Admin no PC → vê **"💻 PC do Caixa — Internet ok, impressora desligada"**.
- Sem jargão. Sem confundir "qual internet é essa".
- Cada aparelho mostra **a sua própria** medição.

