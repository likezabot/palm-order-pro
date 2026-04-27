## Diagnóstico — o que não funciona hoje

A aba **Cardápio Online → Personalizar** tem 8 sub-abas com muitos controles. Auditoria mostrou:

**Controles que NÃO surtem efeito no cardápio público (`/menu/<slug>`):**
1. **Estilo de botão** (Sólido / Contorno / Suave) — salvo no banco mas nunca aplicado em nenhum componente. Trocar não muda nada.
2. **Estilo de card global** (Elevado / Plano) — `cardElevated` é lido só para o card de boas-vindas; cada `ProductCard` recebe sempre `cardStyle="detailed"` fixo, ignorando a escolha global.
3. **Mensagem de boas-vindas** — editada na aba "Visual", mas exigência de toggle "Card de boas-vindas" está em "Seções"; resultado: usuário edita o texto, não vê aparecer, e não entende que precisa ligar o switch em outra aba.
4. **Banner**: enviar banner muda só estado local; se sair sem clicar "Salvar identidade visual" o upload se perde silenciosamente.

**Confusão / duplicação:**
5. 8 sub-abas (Visual, Hero, Seções, Paleta, Layout, Categorias, Por categoria, Destaques) numa linha que quebra em 2-3 fileiras.
6. "Visual" + "Paleta" + "Layout" se sobrepõem — cor de destaque em "Visual" e demais cores em "Paleta"; layout global em "Layout" mas overrides por categoria em outra.
7. "Destaques" duplica algo que já está na aba "Cardápio" (estrela do produto) e na aba "Cardápio Online → Cardápio".
8. Falta feedback de "alterações não salvas" — cada painel tem seu botão Salvar isolado; é fácil trocar de aba e perder.

**Pequenos bugs:**
9. `welcome` na aba Visual sempre envia `clear_welcome_message` quando vazio — pode apagar a mensagem por engano ao salvar só a cor de destaque.
10. Preview à direita ocupa 420px fixos — em telas menores (<1280px) o painel de edição vira inutilizável.

---

## O que vamos fazer

### 1. Remodelar a aba "Personalizar" — 8 abas → 4 seções claras

Trocar `Tabs` por uma lista vertical (acordeão) à esquerda, com 4 grupos:

```text
┌─ Identidade ──────────────────────────┐  ┌──────────────┐
│ • Link & QR Code                      │  │   Preview    │
│ • Logo, banner, cores                 │  │   ao vivo    │
│ • Mensagem de boas-vindas             │  │              │
├─ Home (capa & seções) ────────────────┤  │  [📱] [🖥️]    │
│ • Hero (título, alinhamento, badges)  │  │              │
│ • Ordem dos blocos                    │  │              │
│ • Toggles: destaques, busca, WhatsApp │  │              │
├─ Estilo dos produtos ─────────────────┤  │              │
│ • Layout global (lista/grade)         │  │              │
│ • Imagem, cards, botões, radius       │  │              │
│ • Mostrar fotos / descrições          │  │              │
├─ Categorias ──────────────────────────┤  │              │
│ • Reordenar / ocultar                 │  │              │
│ • Personalização por categoria        │  │              │
│ • Ordem dos produtos por categoria    │  └──────────────┘
└───────────────────────────────────────┘
```

- Aba "Destaques" some daqui (já existe na aba "Cardápio"). Adicionamos um link discreto "Gerenciar destaques na aba Cardápio".
- Cada seção mostra uma barrinha de status: "Tudo salvo" / "Alterações não salvas".

### 2. Fazer os controles funcionarem

**Estilo de botão** (`button_style`):
- Aplicar via CSS variable nova `--btn-style` no escopo do PublicMenu, e propagar para os componentes que renderizam ações: `ProductCard` (botão "+"), `PublicCartFab`, `CartDrawer` botão checkout, `WhatsAppFab`, `OpenStatusBadge`.
- 3 estilos: `solid` (default), `outline` (borda + fundo transparente), `soft` (fundo `primary/15` + texto `primary`).
- Implementação: adicionar atributo `data-btn-style={settings.button_style}` no `PublicMenuLayout` e classes condicionais nos botões que usam o accent.

**Estilo de card global** (`card_style`):
- Hoje cada `ProductCard` recebe `cardStyle="detailed"` fixo. Passar a usar `settings.card_style` global como default e o override por categoria quando definido.
- Adicionar opção `flat` no select global (já existe no enum DB) e respeitar: `flat` → sem sombra, `elevated` → com sombra (já existe `--shadow-soft`).
- Renomear no admin para "Sombra dos cards" (Sim/Não) — o conceito real.

**Mensagem de boas-vindas**:
- Mover toggle "mostrar card de boas-vindas" para junto do textarea (mesma seção "Identidade").
- Auto-ligar o toggle quando o usuário digitar texto pela primeira vez.

**Banner**:
- Após upload, salvar imediatamente no servidor (não só no estado).
- Mostrar "Banner salvo ✓" inline.

### 3. Polir UX

- Botão **"Salvar todas as mudanças"** sticky no rodapé do painel de edição, que confirma todos os pendentes em uma chamada (RPC já aceita patch único multi-campo).
- Remover painéis individuais de salvar (cada seção marca dirty; só um Save global).
- Indicador "Você tem N alterações não salvas" + confirmação ao trocar de aba/sair.
- Em telas <1280px, preview vira drawer aberto via botão "Ver preview" no header da aba.

### 4. Pequenos consertos de bug

- Não enviar `clear_welcome_message` quando o usuário não tocou no campo (rastrear `dirty` por campo).
- Idem para banner, hero_title, hero_subtitle e cores.
- Validação: se hex inválido, destacar campo em vermelho ao invés de só `toast.error` no submit.

---

## Detalhes técnicos

**Arquivos editados:**
- `src/components/admin/PublicMenuCustomizer.tsx` — refatorar layout (Tabs → Acordeão sticky), unir painéis duplicados, adicionar dirty tracking + save global, mover destaques para fora.
- `src/pages/PublicMenu.tsx` — usar `settings.card_style` como default em `catCardStyle`; aplicar `data-btn-style` no `PublicMenuLayout` ou root.
- `src/components/public-menu/PublicMenuLayout.tsx` — receber `buttonStyle` prop e expor via data-attribute / CSS var.
- `src/components/public-menu/ProductCard.tsx` — botão "+" respeita `data-btn-style` ancestral via classes Tailwind condicionais (variant CSS).
- `src/components/public-menu/PublicCartFab.tsx`, `CartDrawer.tsx`, `WhatsAppFab.tsx` — idem.
- `src/index.css` — pequenas regras `[data-btn-style="outline"] .btn-accent { ... }` etc.

**Sem mudança de banco:** o schema `public_menu_settings` já tem todos os campos necessários; a RPC `admin_update_public_menu_settings` já aceita patch parcial — basta enviar só os campos `dirty`.

**Sem migração nova.**

**Testes manuais:**
- Trocar cada controle no admin → ver preview atualizar em <2s (já tem refetchInterval 2s no preview).
- Confirmar que `button_style=outline` muda visualmente o botão "+" do produto e o FAB do carrinho.
- Confirmar `card_style=flat` remove sombra de todos os cards.
- Salvar com vários campos pendentes em uma única chamada (verificar Network: 1 RPC).
- Trocar aba com alterações não salvas → confirma diálogo.

**Não-objetivos** (fora do escopo desta iteração):
- Não muda a aba "Cardápio" (lista de produtos) nem "Configurações" (horários/zonas/info).
- Não muda templates de impressão.
- Não toca em nada do EXE/PWA — é puramente web.
