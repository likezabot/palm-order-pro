

# Tema claro como padrão + modo Alto Contraste

## Objetivo

1. Todos os usuários (novos e antigos) abrem o app já no **tema claro** automaticamente.
2. Adicionar um modo **Alto Contraste** pensado em idosos: texto maior, peso mais forte, bordas e contornos reforçados, cores com contraste WCAG AAA.

## O que muda

### 1. Tema claro como padrão obrigatório

- `src/main.tsx` (script anti-flash): hoje aplica `dark` se não houver preferência salva. Inverter para aplicar **light** por padrão. Se o usuário tiver salvo `"dark"` manualmente no toggle, respeita.
- `src/hooks/use-theme.ts`: `readStoredTheme()` passa a retornar `"light"` por padrão (era `"dark"`).
- **Migração silenciosa para usuários existentes**: bump da chave de storage de `plano-b-theme` para `plano-b-theme-v2`. Quem já estava no app cai no novo default (claro) sem ficar preso no dark antigo. Quem trocar manualmente passa a persistir na nova chave.

### 2. Novo modo Alto Contraste (independente do claro/escuro)

Não substitui o toggle claro/escuro — é uma camada adicional. Pessoa idosa pode usar claro + alto contraste (combinação ideal) ou escuro + alto contraste.

**Novo hook `src/hooks/use-high-contrast.ts`**:
- Estado booleano persistido em `plano-b-high-contrast`.
- Aplica/remove a classe `hc` no `<html>`.

**Estilos em `src/index.css`** (camada adicional, não mexe nos tokens existentes):
- `.hc` aumenta o tamanho base da fonte (`font-size: 17px` → escala todo o app via `rem`).
- `.hc` reforça pesos: corpo `font-weight: 500`, títulos `600`.
- `.hc` engrossa bordas de cards/botões/inputs (`border-width: 2px`).
- `.hc` aumenta contraste de `--muted-foreground` (sai de cinza claro para quase preto/branco puro).
- `.hc` reforça foco visível (ring 3px) — bom para quem usa óculos.
- `.hc` aumenta altura mínima de toques: botões e cards `min-h-[64px]`.
- Não mexe na paleta brasa (laranja segue como acento).

**Anti-flash em `main.tsx`**: lê `plano-b-high-contrast` e aplica classe `hc` antes do React montar.

### 3. Toggle de Alto Contraste na UI

Adicionar ao lado do `ThemeToggle` (canto superior direito da Home):
- `src/components/HighContrastToggle.tsx` (novo): botão circular com ícone `Eye` / `EyeOff` (lucide-react) e mesmo estilo visual do `ThemeToggle`.
- `src/pages/Index.tsx`: agrupa os dois toggles num pequeno cluster no topo direito.
- `aria-pressed`, `title` e `aria-label` em PT-BR ("Ativar alto contraste", "Desativar alto contraste").

## Arquivos modificados / criados

**Novos (2):**
- `src/hooks/use-high-contrast.ts`
- `src/components/HighContrastToggle.tsx`

**Editados (4):**
- `src/main.tsx` — anti-flash light por padrão + aplicar `hc` se salvo + bump da chave de tema.
- `src/hooks/use-theme.ts` — default `"light"`, nova chave de storage.
- `src/index.css` — bloco `.hc { ... }` com regras de tamanho, peso, borda, contraste, foco.
- `src/pages/Index.tsx` — adicionar `HighContrastToggle` ao lado do `ThemeToggle`.

## Não tocado

- Paleta de cores e tokens existentes (claro e escuro continuam idênticos).
- Lógica de pedidos, impressão, runtime global, Telegram, bridge, banco.
- Cardápio, PDV, Kitchen, Admin, Stock — herdam o novo modo automaticamente via classes CSS globais.
- Toggle de tema atual (continua funcionando, só muda o default).

## Validação

1. Abrir o app pela primeira vez (storage limpo) → entra no claro.
2. Usuário antigo que tinha `plano-b-theme=dark` → cai no claro (chave nova).
3. Trocar para escuro manualmente → persiste, próxima visita abre escuro.
4. Ativar Alto Contraste no claro → fonte maior, bordas grossas, texto mais forte, foco evidente.
5. Combinar Alto Contraste + escuro → contraste máximo no escuro.
6. Reload mantém ambas as preferências sem flash.
7. `vitest` continua verde (mudanças são de UI/storage).

## Resultado esperado

Novos e antigos usuários abrem o app no tema claro. Um segundo botão no canto superior ativa o modo Alto Contraste, deixando textos maiores, bordas mais visíveis e cores com contraste reforçado — atendendo idosos sem alterar a identidade visual da marca.

