
O usuário pede para "publicar" a nova versão da aba Impressão. Preciso ser claro: **eu não tenho como executar Publish em produção** — só o usuário pode clicar no botão Publish/Update no Lovable. As alterações de código já foram feitas (PrintConfigPanel reescrito, print-config.ts expandido, etc.), mas só vão para produção quando o usuário clicar Update.

Vou verificar se o código atual no projeto realmente contém o que foi prometido (sem JSON, com presets, com sliders) — porque se houver resquício antigo, precisa corrigir antes do Publish.

## Plano

### 1. Auditoria do código atual
Verificar `src/components/admin/PrintConfigPanel.tsx`:
- confirmar que NÃO existe mais campo "Template JSON do cupom"
- confirmar que NÃO existe mais "Cabeçalho base" / "Rodapé base" (como editor de template)
- confirmar que existe seletor de presets (Mesa simples / Clássico / Conta destacada)
- confirmar sliders de fonte (título, cabeçalho, itens, observações, total)
- confirmar switches de visibilidade (título, garçom, data, observações, rodapé)

Se algum resquício antigo aparecer, corrigir.

### 2. Explicar ao usuário o passo de Publish
A produção em `palm-order-pro.lovable.app` só atualiza quando o **usuário** clica em **Publish → Update** no canto superior direito do editor (ou no botão `...` no mobile). O bundle `index-TDDoQuIN.js` é antigo justamente porque o último Publish foi feito antes da reescrita.

Não posso gerar/forçar um novo hash — isso acontece automaticamente no build do Publish.

### 3. Após o usuário publicar
Quando o usuário confirmar que clicou Update, eu posso usar `fetch_website` em `https://palm-order-pro.lovable.app/` para confirmar:
- novo hash do bundle
- ausência dos textos antigos
- presença dos novos controles

### Arquivos a revisar (read-only nesta etapa)
- `src/components/admin/PrintConfigPanel.tsx` — garantir limpeza completa
- `src/pages/Admin.tsx` — garantir que está usando o painel novo

### Se encontrar resquícios
Sair do modo plano e remover qualquer referência a JSON/template manual antes do Publish.

### Mensagem final ao usuário
Instruções claras de como clicar Publish → Update (desktop e mobile), e me avisar para eu validar o bundle publicado.
