<final-text>Diagnóstico encontrado:
- O pop-up de “Enviar e imprimir / Enviar sem imprimir” já existe no frontend compartilhado em `src/components/palm/OrderReview.tsx`.
- `src/pages/Palm.tsx` sempre usa esse mesmo `OrderReview`, sem desvio por navegador.
- Então o comportamento diferente entre “tela de testes” e Chrome/Brave não indica falta do modal no código atual; indica cliente publicado desatualizado.
- O ponto mais suspeito é o service worker atual em `public/sw.js`: ele usa cache-first para `/` e `/index.html`, com `CACHE_NAME = "plano-b-v1"` fixo e sem limpeza de caches antigos. Isso pode prender Chrome, Brave e PWA instalado em bundle antigo, que ainda envia direto sem abrir o modal.

Plano de correção:
1. Corrigir a estratégia de cache do PWA
- Atualizar `public/sw.js` para não servir HTML antigo indefinidamente.
- Trocar navegação/`index.html` para network-first ou remover o cache do app shell.
- Versionar o cache e apagar caches antigos no `activate`.
- Garantir update imediato do service worker novo.

2. Forçar o app a adotar a versão nova
- Ajustar `src/main.tsx` para lidar melhor com atualização do SW.
- Fazer reload controlado quando uma nova versão assumir controle, evitando Chrome/Brave presos no bundle velho.

3. Blindar o fluxo do Palm
- Revisar `src/components/palm/OrderReview.tsx` para manter o botão principal abrindo apenas o modal antes de qualquer RPC.
- Manter a decisão de impressão só depois do clique em:
  - `Enviar e imprimir`
  - `Enviar sem imprimir`

4. Manter consistência no fechamento
- Revisar `src/components/cashier/CloseOrder.tsx` para o mesmo padrão de confirmação, evitando divergência entre Palm e fechamento de conta.

5. Validar sincronismo real
- Confirmar no navegador comum e no PWA instalado:
  - `Finalizar pedido` abre modal
  - `Atualizar pedido` abre modal
  - escolha com impressão envia com `p_should_print = true`
  - escolha sem impressão envia com `p_should_print = false`

Arquivos que vou ajustar:
- `public/sw.js`
- `src/main.tsx`
- `src/components/palm/OrderReview.tsx`
- `src/components/cashier/CloseOrder.tsx`

Observação técnica importante:
- Para este sintoma específico, o problema principal não parece ser a RPC nem o bridge.
- O bridge/configuração de impressão decide como imprimir depois.
- Quem decide se o modal aparece é o frontend do Palm — e ele já está correto no código atual.
- O que precisa ser corrigido é a entrega/atualização da versão publicada para que Chrome e Brave parem de rodar a versão antiga.

Validação final que vou garantir após implementar:
- Chrome: não envia direto; abre modal antes.
- Brave: não envia direto; abre modal antes.
- PWA instalado: atualiza para a nova versão e para de usar bundle antigo.
- O fluxo fica igual no web e no ambiente desktop que usa o mesmo frontend.

Se o app `.exe` embute uma cópia estática do frontend em vez de apontar para a versão publicada, a mesma correção de frontend precisará entrar no build dele também; se ele usa a versão publicada, a correção do service worker resolve o sincronismo.</final-text>