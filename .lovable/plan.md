

## Aliases inteligentes para reconhecimento no Telegram

### O que será feito

Popular a coluna `aliases` (TEXT[]) de cada `inventory_items` ativo com sinônimos curtos e naturais. O `find_inventory_item_by_text` já normaliza (lowercase + remove acentos) e bate exato em `slug` OU em qualquer entrada de `aliases`, então basta inserir variações **normalizadas, em minúsculas, sem acento**.

### Regras dos aliases

- Sempre normalizado: lowercase, sem acento, sem caractere especial além de espaço, dígito e hífen.
- **Sem aliases ambíguos**: se duas variantes existirem (ex: Coca 350 e Coca 600), o termo curto "coca" **não** entra em nenhuma — força o usuário a especificar. Idem "fanta", "guarana", "sprite" se tiverem mais de um tamanho.
- Aliases ÚNICOS no sistema inteiro: se "agua" só puder ser "Água sem gás" (decisão de produto), liberamos; senão, fica fora.
- Sempre incluir versão sem hífen do nome (ex: "coca cola 350", "coca cola zero 350") além do slug.

### Mapa proposto (apenas itens onde há ganho real)

**Carnes / espetos** (sem ambiguidade — atribuímos termos curtos):
| Item | Aliases |
|---|---|
| Bovino | `boi`, `carne`, `espeto bovino`, `espeto de boi` |
| Porco | `suino`, `espeto de porco`, `espeto suino` |
| Coração de frango | `coracao`, `coracaozinho`, `espeto de coracao` |
| Costela de boi (borboleta) | `costela`, `costela boi`, `borboleta` |
| Costela suína | `costelinha`, `costela porco`, `costela suina` |
| Linguiça toscana | `linguica`, `toscana`, `espeto de linguica` |
| Medalhão de Frango | `medalhao`, `frango`, `espeto de frango` |
| Panceta suína | `panceta`, `barriga de porco` |
| Pão de alho | `pao alho`, `paodealho` |
| Queijo coalho | `queijo`, `coalho`, `espeto de queijo` |
| Tulipa (meio da asa) | `tulipa`, `asa`, `asinha`, `meio da asa` |
| Janta de costela bovina | `janta de costela`, `janta costela`, `janta` |
| Jantinha | `janta pequena` |
| Arroz (200g) | `arroz`, `arroz 200`, `arroz porcao` |
| Salada Un | `salada` |

**Bebidas** (cuidado com ambiguidade entre tamanhos):
| Item | Aliases |
|---|---|
| Água sem gás | `agua`, `agua sem gas`, `agua mineral` |
| Água com gás | `agua com gas`, `agua gas` |
| Coca-Cola 220ml | `coca 220`, `coca-cola 220`, `coca cola 220`, `mini coca`, `mini coca 220` |
| Coca-Cola 350ml | `coca 350`, `coca cola 350`, `coca lata`, `lata de coca` |
| Coca-Cola 600ml | `coca 600`, `coca cola 600` |
| Coca-Cola 2L | `coca 2l`, `coca 2 litros`, `coca cola 2l` |
| Coca-Cola 1L vidro (somente local) | `coca 1l`, `coca vidro`, `coca cola 1l` |
| Coca-Cola Zero 220ml | `coca zero 220`, `mini coca zero` |
| Coca-Cola Zero 350ml | `coca zero 350`, `coca zero lata`, `zero lata` |
| Coca-Cola Zero 600ml | `coca zero 600` |
| Coca-Cola Zero 2L | `coca zero 2l`, `coca zero 2 litros` |
| Fanta-laranja 220ml | `fanta laranja`, `fanta`, `laranja` |
| Fanta-uva 220ml | `fanta uva`, `uva` |
| Guaraná 220ml | `guarana 220`, `mini guarana`, `guaraninha` |
| Guaraná 1L | `guarana 1l`, `guarana 1 litro` |
| Sprite 220ml | `sprite`, `sprite 220`, `mini sprite` |
| Suco Del Valle Maracujá 290ml | `suco maracuja`, `del valle maracuja`, `maracuja` |
| Suco Del Valle Pêssego 290ml | `suco pessego`, `del valle pessego`, `pessego` |
| Suco Del Valle Uva 290ml | `suco uva`, `del valle uva`, `suco de uva` |
| KS Coca-Cola Normal 290ml | `ks coca`, `ks 290`, `coca ks` |
| KS Coca-Cola Zero 290ml | `ks coca zero`, `ks zero` |
| Tubaina 600ml | `tubaina`, `tubaina 600` |
| Skol 269ml | `skol lata`, `skol 269`, `lata skol` |
| Skol 600ml | `skol 600`, `skolzao` |
| Original 600ml | `original`, `cerveja original`, `original 600` |
| Antarctica Boa | `antarctica`, `boa`, `antartica boa` |
| Outra cerveja | `outra cerveja` |

**Decisão sobre termos curtos ambíguos**:
- `coca` (sozinho) → **não vira alias** de nenhuma. Quando o usuário mandar só "coca", o parser cai no fuzzy fallback (`ILIKE '%coca%'`), retorna 5+ matches e o bot responde "vários encontrados, especifique o tamanho". Mantém a regra "nunca chuta".
- `guarana`, `sprite`, `fanta` → idem se houver múltiplas variantes; onde só existe uma (ex: Sprite 220ml é único hoje), liberamos o termo curto.
- `frango` aparece tanto em "Medalhão de Frango" quanto em "Coração de frango" — atribuído **só** ao Medalhão (item principal). "Coração" sempre exige a palavra coracao.

### Como será aplicado

Um único bloco `UPDATE` por item (executado via insert tool, não migration — é dado, não schema). Exemplo:
```sql
UPDATE inventory_items SET aliases = ARRAY['boi','carne','espeto bovino','espeto de boi']
WHERE slug = 'bovino';
```
Total: ~40 updates, um por item da tabela acima.

### Validação pós-aplicação

Após popular, rodar consulta de sanidade que detecta colisões:
```sql
SELECT alias, array_agg(name) AS items
FROM inventory_items, unnest(aliases) AS alias
WHERE is_active
GROUP BY alias HAVING count(*) > 1;
```
Resultado esperado: **0 linhas**. Se algum alias colidir, removemos antes de fechar.

### Memória do projeto

Atualizar `mem://features/telegram-bot.md` com a regra: "Aliases curtos ambíguos não entram — força o fuzzy a perguntar variante".

### O que NÃO faz parte

- Mexer no parser ou na função `find_inventory_item_by_text` (já funcionam).
- Aliases para itens inativos ou sem `product_id` (não vão pro pedido mesmo).
- Auto-geração de aliases por IA — lista é curada manualmente para garantir zero ambiguidade.

