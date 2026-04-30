---
name: EXE packaging strategy
description: Regras para gerar EXE TESTE da bridge sem sobrescrever versão estável 3.2.0
type: constraint
---

# Estratégia de empacotamento EXE

**Decisão (com Codex):** WEB primeiro, EXE depois. Só gerar EXE quando o web estiver totalmente validado.

## Regras obrigatórias para o próximo EXE TESTE

- Usar EXATAMENTE o mesmo bundle/build do web aprovado
- Deve mostrar o mesmo `APP_BUILD` e `PRINT_ENGINE` que o web
- Bridge local funcionando na porta 3001
- NÃO pode imprimir com template antigo
- Pedido real DEVE sair com `PRINT_PATH`, `ORDER`, `SERVICE` no rodapé
- Instalar em pasta separada da estável
- `appId` diferente da estável
- Nome diferente, exemplo: `Plano B Fast Order PDV 3.3.0 TESTE`
- NÃO sobrescrever `Plano B Fast Order PDV 3.2.0` estável (versão de produção)

## Por quê
A versão estável 3.2.0 está rodando no PC da impressora. Qualquer teste novo
precisa coexistir, não substituir, até validação no papel.
