

# Retorno mais natural + entender pergunta de valor da mesa

## Mudanças em `supabase/functions/telegram-webhook/index.ts`

### 1. Trocar "Entendi" por verbo de ação conforme o resultado
Hoje toda confirmação de voz começa com `🎤 Entendi: ...`. Vou diferenciar pelo tipo de ação executada:

- **Lançar pedido (ADD)** → `🍽️ Lancei: mesa 2 +1 Medalhão de Frango ✅`
- **Remover do pedido (REMOVE)** → `🗑️ Removi: mesa 2 −1 Coca ✅`
- **Estoque entrada/saída/ajuste** → `📦 Atualizei estoque: +5 Coca (saldo 12) ✅`
- **Consulta (ver pedido / valor da mesa / estoque)** → `👀 Consulta: ...` seguido do resultado
- **Múltiplos comandos** → cabeçalho `✅ Pronto:` com bullets por linha (cada bullet usa o verbo certo).
- **Confirmação pendente** → continua `🤔 Ouvi: "..."` (porque ainda não fez nada).

A escolha do verbo vem do `cmd.kind` resolvido — adiciono um helper `voiceVerb(kind)` chamado em ambos os caminhos (single-line ~linha 4602 e multi-line ~linha 4767).

### 2. "Qual o valor da mesa 2?" e variações conversacionais
Hoje "qual o valor da mesa 2" cai em PARSE_ERROR porque o parser exige verbo de operação. Vou adicionar um novo `kind: "TABLE_VALUE"` (variação do VIEW que mostra só o total) e expandir o `parseCommand` com regex para perguntas de consulta:

- **Valor/conta da mesa**: `qual (o )?valor da mesa N`, `quanto (deu|ta|esta|ficou) (a|na) mesa N`, `conta da mesa N`, `total (da )?mesa N`, `fechamento (da )?mesa N` → `TABLE_VALUE` que responde `💰 Mesa N: R$ XX,XX (Y itens)`.
- **Ver pedido** (já existe `mesa N ver pedido`): adicionar `o que tem na mesa N`, `o que pediram na mesa N`, `lista da mesa N`, `pedido da mesa N` → mesma rota VIEW existente.

Implementação: 3-4 regex novas no início de `parseCommand` (antes dos blocos f1/f2/f3 atuais), que extraem `table` e retornam `{ kind: "TABLE_VALUE", table }` ou reutilizam `VIEW`. Handler novo para TABLE_VALUE que usa a mesma query do VIEW mas formata curto (só total + contagem).

### 3. Reforço no prompt do Gemini
Acrescentar uma linha curta ao prompt de transcrição: *"Perguntas como 'qual o valor', 'quanto deu', 'quanto ficou', 'conta da mesa' devem ser preservadas literalmente — NÃO reescreva como comando de pedido."* Evita que o Gemini "ajude demais" e transforme uma pergunta em ADD/REMOVE.

### 4. Mensagem de fallback mais útil
Quando mesmo assim não reconhecer, em vez de só `Ex.: mesa 2 mais 1 medalhão`, mostrar 3 exemplos cobrindo lançar/consultar/estoque:
```
🎤 Ouvi: "..."
⚠️ Não consegui transformar em comando.
Tente:
• "mesa 2 mais 1 medalhão" (lançar)
• "qual o valor da mesa 2" (consultar)
• "entrada 5 coca" (estoque)
```

## O que NÃO muda
- Fluxo de impressão, kanban, pagamento, cardápio, apelidos.
- Comandos por texto continuam funcionando idênticos (apenas ganham as novas frases de consulta).
- Confiança/gate de confirmação ✅/❌ permanece.
- Indicador "🎤 Ouvindo..." e edição da mensagem permanecem.
- Suprimir ruído de estoque por voz (já implementado) permanece.

## Arquivos afetados
- `supabase/functions/telegram-webhook/index.ts` — novo `TABLE_VALUE`, regex de consulta, helper `voiceVerb`, prompt do Gemini, fallback expandido.
- `supabase/functions/telegram-webhook/parser_test.ts` — testes para as novas frases de consulta e TABLE_VALUE.

## Critério de sucesso
1. Áudio "lança um medalhão na mesa 2" → `🍽️ Lancei: mesa 2 +1 Medalhão de Frango ✅`
2. Áudio "qual o valor da mesa 2" → `💰 Mesa 2: R$ 45,00 (3 itens)`
3. Áudio "entrada 5 coca" → `📦 Atualizei estoque: +5 Coca (saldo 12) ✅`
4. Áudio inválido → fallback com 3 exemplos.

