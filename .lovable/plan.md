

# Plano: redesign Premium da aba "Rede"

## Problema atual

Olhando o screenshot que você mandou:
- Layout solto, cards "flutuando" sem hierarquia.
- Botão "Renomear" mal posicionado, quebrando a linha.
- Bolinhas coloridas grandes demais, parecem amadoras.
- Sparkline sem eixo, sem contexto — parece um risco perdido.
- Tipografia inconsistente (tamanhos misturados).
- Falta densidade de informação técnica (você quer **dados reais + linguagem simples juntos**).

## Novo design (Premium)

### Estrutura visual

```text
┌─────────────────────────────────────────────────┐
│ 📱 Celular (Admin)              [Renomear ✎]   │  ← header compacto
│ Última verificação há 2s · ⏸ Pausar           │
├─────────────────────────────────────────────────┤
│ ❌ Impressora desligada                         │  ← banner status geral
│    Pedidos estão na fila aguardando             │
└─────────────────────────────────────────────────┘

┌──────────────────┬──────────────────┬──────────────────┐
│ 📶 Internet      │ ☁ Servidor       │ 🖨 Impressora    │
│ ● Boa            │ ● Devagar        │ ● Desligada      │
│                  │                  │                  │
│ 93 ms            │ 221 ms           │ — ms             │
│ ▁▂▁▂▁▂▁▁▂▁      │ ▂▃▅▄▃▂▃▂▃▂      │ ▁▁▁▁▁▁▁▁▁▁      │
│ média 88ms       │ média 215ms      │ offline há 12min │
│                  │                  │                  │
│ Tudo normal nesse│ Servidor lento,  │ Pedidos ficam na │
│ celular.         │ pode atrasar.    │ fila até voltar. │
│                  │                  │                  │
│ [Testar agora]   │ [Testar agora]   │ [Testar agora]   │
└──────────────────┴──────────────────┴──────────────────┘

┌─────────────────────────────────────────────────┐
│ Detalhes técnicos                          ▼    │  ← collapsible
│  • navigator.onLine: true                       │
│  • Conexão: 4g (downlink 10Mbps, RTT 100ms)     │
│  • Realtime: SUBSCRIBED (heartbeat 3s atrás)    │
│  • Bridge URL: http://localhost:9100/health     │
│  • User agent: Mozilla/5.0 ...                  │
└─────────────────────────────────────────────────┘
```

### Especificações visuais

**Header**
- Avatar do device (ícone grande em círculo com `bg-primary/10`).
- Nome em `text-xl font-semibold`, badge da role ao lado (`Badge variant="outline"`).
- "Renomear" vira ícone-botão pequeno (`Pencil` lucide, ghost variant).
- Linha de meta (última verificação + pausar) em `text-xs text-muted-foreground`.

**Banner de resumo**
- Card dedicado com cor semântica forte: verde/amarelo/vermelho de fundo suave (ex.: `bg-destructive/10 border-destructive/30`).
- Ícone grande (24px) + título bold + subtítulo descritivo.
- Aparece só se houver problema; se tudo ok, mostra `✅ Tudo funcionando neste dispositivo` em verde sutil.

**Cards de métrica (3 colunas em desktop, empilhados em mobile)**
- Estrutura uniforme: header com ícone + label, status dot + label semântico (cor do tema), métrica grande (latência), sparkline, média, frase amigável, botão "Testar agora".
- **Status dot pequeno** (8px) ao lado do label, não bolão grande.
- **Latência em destaque**: `text-3xl font-bold tabular-nums` — esse é o "dado real" que faltava.
- **Sparkline melhorada**: SVG com gradient fill embaixo da linha, eixo Y implícito (escala automática), linha de 2px, cor seguindo o status. Altura 40px, largura 100%.
- **Linha auxiliar**: média das últimas 20 medições em texto pequeno.
- Para impressora, em vez de só "sem resposta": mostra **"offline há 12min"** (calculado do timestamp da última falha).

**Detalhes técnicos (collapsible)**
- Accordion fechado por padrão.
- Lista vertical de pares chave/valor em `font-mono text-xs`.
- Inclui: `navigator.onLine`, `navigator.connection.effectiveType/downlink/rtt`, status do Realtime + tempo desde último heartbeat, URL da bridge, contagem de impressoras detectadas, user agent resumido.
- Isso atende seu pedido de **"informações reais"** sem poluir a vista principal.

### Tokens de cor (semânticos, do design system)

| Status | Cor texto | Cor fundo card | Cor sparkline |
|---|---|---|---|
| Boa | `text-success` | `bg-success/5` | `stroke-success` |
| Devagar | `text-warning` | `bg-warning/5` | `stroke-warning` |
| Ruim/Offline | `text-destructive` | `bg-destructive/5` | `stroke-destructive` |

Sem cores hardcoded — tudo via tokens do `index.css`.

### Responsivo

- Desktop (≥1024px): 3 cards em grid horizontal.
- Tablet (640-1024px): 2 + 1 abaixo, ou 3 menores.
- Mobile (<640px): 1 coluna, cards full-width, sparkline reduzida.

## Arquivos a editar

**`src/components/admin/NetworkTab.tsx`** (reescrita visual completa):
- Mantém a lógica de medição/polling existente.
- Reestrutura JSX com novo layout (header + banner + grid de cards + accordion técnico).
- Substitui bolões por dots pequenos.
- Usa `Card`, `Badge`, `Button` do design system + `Accordion` do shadcn.
- Sparkline ganha gradient + escala dinâmica.
- Adiciona cálculo de "offline há X min" via `since` timestamp.
- Adiciona seção de detalhes técnicos com `navigator.connection`, heartbeat realtime, etc.

**`src/index.css`** (verificar/adicionar se faltar):
- Garantir que `--success` e `--warning` existem como tokens HSL (se não, adicionar para alinhar com `--destructive` existente).

## Resultado prático

- Visual limpo, denso, com hierarquia clara — parece dashboard de SaaS premium.
- **Dado real visível**: latência em ms grande, média, tempo offline, sparkline com escala.
- **Linguagem simples mantida**: status semântico + frase amigável em cada card.
- **Detalhes técnicos** num accordion pra quem quer ver `navigator.connection`, heartbeat realtime, etc.
- Funciona bem em celular (mobile-first) e em PC.

