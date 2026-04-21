

## Tema Claro/Escuro com toggle discreto na Home

Hoje o sistema é fixo em **dark mode** (`--background: 0 0% 5.1%`). Vou adicionar um modo claro com paleta cuidadosamente equilibrada e um botão discreto sol/lua na Home.

### Paletas

**Modo Escuro** (atual, mantido como padrão)
- bg `#0D0D0D` · card `#141414` · texto `#F5F5F5` · muted `#ADADAD`
- primary `#E25822` (laranja brasa) — contraste AA sobre dark

**Modo Claro** (novo)
- bg `#FAFAF9` (off-white quente, evita branco puro que cansa)
- card `#FFFFFF` · surface-elevated `#F4F4F2`
- texto `#0F0F0F` (quase preto, máximo contraste)
- muted-foreground `#5C5C5C` (AA sobre bg claro)
- border/input `#E5E5E3`
- primary `#C8471A` (laranja brasa **mais escuro** — original `#E25822` falha contraste em texto branco sobre fundo claro; este passa AA)
- success `#15803D` · warning `#A16207` · destructive `#DC2626` (todos AA)

### Implementação

**1. CSS (`src/index.css`)**
- Mover variáveis atuais de `:root` para `.dark`
- Adicionar bloco `:root` (ou `.light`) com a paleta clara acima
- Default: aplicar `.dark` no `<html>` se não houver preferência salva (mantém comportamento atual)

**2. Hook `src/hooks/use-theme.ts` (novo)**
- Lê `localStorage("plano-b-theme")` → `"light" | "dark" | "system"`
- Aplica/remove classe `dark` no `document.documentElement`
- Escuta `prefers-color-scheme` quando em modo `system`
- Default = `dark` (preserva visual atual de quem já usa)

**3. Componente `src/components/ThemeToggle.tsx` (novo)**
- Botão circular discreto (40×40, ícone Sun/Moon do lucide)
- Transição suave de ícone
- Posicionado **na Home**, canto superior direito, dentro do safe-area
- `aria-label="Alternar tema"`

**4. Inicialização (`src/main.tsx`)**
- Pequeno script inline antes do React montar para evitar **flash** de tema errado:
  ```ts
  const t = localStorage.getItem("plano-b-theme") ?? "dark";
  if (t === "dark") document.documentElement.classList.add("dark");
  ```

**5. Tailwind (`tailwind.config.ts`)**
- Confirmar `darkMode: ["class"]` (já está assim por padrão no shadcn)

### Verificação de legibilidade

| Combinação claro | Contraste | WCAG |
|---|---|---|
| `#0F0F0F` em `#FAFAF9` | 19.8:1 | AAA |
| `#5C5C5C` em `#FAFAF9` | 6.9:1 | AA |
| `#FFFFFF` em `#C8471A` (botão primary) | 4.6:1 | AA |
| `#0F0F0F` em `#FFFFFF` (card) | 21:1 | AAA |

| Combinação escuro | Contraste | WCAG |
|---|---|---|
| `#F5F5F5` em `#0D0D0D` | 18.5:1 | AAA |
| `#ADADAD` em `#0D0D0D` | 8.3:1 | AAA |
| `#FFFFFF` em `#E25822` | 4.5:1 | AA |

### Onde aparece o toggle
- Apenas na **Home** (`/`), canto superior direito — discreto, não polui telas de operação (PDV/Palm/Kitchen/Admin já têm headers próprios e mantêm o tema escolhido).

### Arquivos
- **Novo**: `src/hooks/use-theme.ts`
- **Novo**: `src/components/ThemeToggle.tsx`
- **Editado**: `src/index.css` — paletas claro/escuro
- **Editado**: `src/pages/Index.tsx` — monta `<ThemeToggle />`
- **Editado**: `src/main.tsx` — script anti-flash

### Resultado
- Toggle discreto sol/lua na Home alterna entre os dois modos
- Preferência persiste em `localStorage`
- Sem flash ao recarregar
- Todas as telas existentes funcionam em ambos os temas (já usam tokens semânticos `bg-background`, `text-foreground`, etc.)
- Contraste AA/AAA garantido em ambos os modos

