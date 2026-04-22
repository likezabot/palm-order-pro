

## Parser Telegram: plurais + mensagens de erro melhores

### Mudanças (arquivo único: `supabase/functions/telegram-webhook/index.ts`)

#### 1. Plural simples no `productText`

Adicionar helper `singularize(text)` aplicado **antes** de chamar `resolveProduct`:

- Regras de despluralização tokenizada (palavra a palavra), conservadora:
  - `...ões` → `...ao` (ex: `medalhoes` → `medalhao`)
  - `...ais` → `...al`, `...eis` → `...el`, `...ois` → `...ol`, `...uis` → `...ul` (ex: `pasteis` → `pastel`)
  - `...ns` → `...m` (ex: `garagens` → `garagem`)
  - `...res`/`...zes`/`...ses` → tira `es` (ex: `colheres` → `colher`)
  - `...s` final (não precedido por vogal acentuada nem `s`) → tira `s` (ex: `cocas` → `coca`, `bovinos` → `bovino`, `aguas` → `agua`)
- Palavras com ≤3 letras ou que terminam em `ás/és/ís/ós/ús` permanecem intactas (evita quebrar `gas`, `mes`).
- Aplicado token a token preservando dígitos e unidades (`350`, `2l`, `600ml` ficam como estão).
- Como o fallback de `resolveProduct` já usa `ILIKE %norm%`, singularizar aumenta acerto sem regredir buscas que já funcionam (a versão singular sempre casa o nome cadastrado, que está no singular).

Validação dos exemplos pedidos:
| Entrada | Após parser | Singularizado | Resolve |
|---|---|---|---|
| `mesa 1 mais duas cocas 350` | qty=2, "cocas 350" | "coca 350" | alias `coca 350` ✅ |
| `tira duas aguas da mesa 1` | qty=2, "aguas" | "agua" | alias `agua` (Água sem gás) ✅ |
| `acrescenta tres bovinos na mesa 2` | qty=3, "bovinos" | "bovino" | slug `bovino` ✅ |

#### 2. Mensagens de erro mais claras e úteis

Reescrita das respostas em `handleCommand` e do `HELP_TEXT`:

- **PARSE_ERROR**: explica o que faltou (mesa? operador? produto?) e mostra 2 exemplos curtos no topo (não dump do help completo).
  ```
  ❓ Não consegui interpretar: "<raw>"
  
  Faltou identificar mesa/ação/produto. Exemplos:
  • mesa 3 + 2 coca 350
  • tira 1 agua da mesa 1
  
  Envie "ajuda" para ver todos os formatos.
  ```
- **not_found**: sugere os 3 produtos mais próximos via `ILIKE` parcial em palavras do texto (se houver). Sem sugestões → texto atual.
  ```
  ❓ Não achei "<productText>" no cardápio.
  Talvez quis dizer: Coca-Cola 350ml, Coca-Cola 600ml, Coca-Cola 2L?
  Repita com o nome exato.
  ```
- **ambiguous**: numera candidatos e dá dica concreta (qual diferença olhar — tamanho/variante).
  ```
  🤔 Encontrei várias opções para "<productText>":
    1) Coca-Cola 350ml
    2) Coca-Cola 600ml
    3) Coca-Cola 2L
  Especifique o tamanho/variante e reenvie.
  ```
- **is_group_trigger**: lista variantes em bullets (não vírgula corrida) — fica legível em mobile.
- **out_of_stock**: já é claro; só adiciona dica de tentar variante alternativa quando aplicável.
- **version_conflict**: incluir sugestão "aguarde 5s e reenvie".
- **HELP_TEXT**: ampliar com a sintaxe natural já suportada (mais/tira/acrescenta), número por extenso, e a regra de plural.

Sem mudança em fluxo (`executeAdd`/`executeRemove`/`resolveProduct`/banco) — apenas helper novo + textos.

### Garantias

- **Compatibilidade total**: singularize é puro string→string aplicado entre parser e resolver; canônico `mesa N + 1 coca` continua intacto.
- **Sem ambiguidade silenciosa**: singularize **não altera** a lógica de resolução ambígua. "cocas" vira "coca" → fuzzy retorna 5 matches → bot pede para especificar (regra atual mantida).
- **Sem mudança de banco**: nenhum migration, nenhuma alteração em RLS/aliases.
- **Sem mudança em pedidos**: zero toque em `executeAdd`/`executeRemove`.

### Fora de escopo

- Plurais irregulares (`pães` → `pão` etc.) — não há produto cadastrado que precise hoje.
- Concordância de número/gênero em adjetivos compostos.
- Múltiplos comandos por mensagem (próxima iteração).
- Fuzzy phonetic / typo-tolerance (Levenshtein) — fora desta etapa.

