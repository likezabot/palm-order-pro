# RELATÓRIO TÉCNICO: RECRIAÇÃO DE EXE TESTE (VERSÃO 3.3.0 TESTE)

## 1. RESUMO EXECUTIVO
- **O que mudou no web:** O sistema de impressão foi totalmente reconstruído com um motor unificado (`print-engine`), novo roteamento de serviços (`print-dispatcher`), editor visual de cupom no Admin e suporte completo a Delivery/Retirada com layouts específicos.
- **Por que o EXE antigo não deve ser usado:** O EXE atual (3.2.0 ou anterior) contém um bundle web defasado e caminhos de impressão que ignoram as novas configurações do banco de dados e os novos layouts. Isso resulta em impressões com templates antigos e falta de informações críticas.
- **Necessidade do novo EXE:** É fundamental gerar um novo executável que utilize o build web atual para validar o novo fluxo de impressão térmica via Bridge local (porta 3001) e garantir que a configuração salva no Admin reflita fielmente no papel.

---

## 2. LISTA DE MUDANÇAS IMPLEMENTADAS

### Cardápio Público / Visual
- Interface remodelada para melhor performance em dispositivos móveis.
- Sistema de grupos e subgrupos sincronizado com o Admin.

### Fidelidade / Pontos
- Implementação de lógica de pontos por valor de compra.
- Resgate de brindes integrado ao checkout.
- Aviso visual no PDV para envio de pontos em pedidos de Delivery.

### Checkout / Brindes
- Validação de saldo de pontos no carrinho.
- Inclusão de itens de brinde no pedido e no cupom impresso.

### Admin / Impressão
- **Painel de Configuração Unificado:** Editor visual para largura do papel (58mm/80mm), tamanhos de fonte, presets de layout e visibilidade de seções.
- **Diagnóstico de Bridge:** Painel para testar conexão com a bridge local e latência.
- **Self-Test:** Botão para imprimir cupom de teste que valida todas as fontes e alinhamentos.

### Bridge / Diagnóstico
- Rastreamento de origem (`PrintOriginPanel`) para identificar de qual dispositivo/IP partiu a impressão.
- Detecção de "Fingerprints" no rodapé do cupom.

### Templates de Talão (`receipt-layout.ts`)
- **Mesa (Dine-in):** Foco em Mesa/Garçom. Omitir campos N/A.
- **Retirada/Balcão:** Banner em destaque "*** RETIRADA / BALCAO ***".
- **Delivery:** Layout exclusivo com endereço completo, telefone, taxa de entrega, descontos e observações do pedido em destaque.
- **Senha:** Layout tipo recibo de caixa com itens em tabela e número da venda.

### Dispatcher de Impressão (`print-dispatcher.ts`)
- Ponto central de decisão de impressão. Decide qual layout usar com base no `service_type` e `docType`.

### RLS / RPC / Configuração
- Configurações de impressão movidas do `localStorage` para a tabela `settings` no Supabase (compartilhada).
- RPCs seguras para salvar e ler configurações sem expor o restante do banco.

---

## 3. ARQUIVOS ALTERADOS (PRINCIPAIS)
- `src/lib/receipt-layout.ts`: Lógica canônica de construção de blocos do cupom.
- `src/lib/receipt-html.ts`: Conversor de blocos para HTML (preview).
- `src/lib/thermal-printer.ts`: Conversor de blocos para comandos ESC/POS (impressão real).
- `src/lib/print-receipt.ts`: Orquestrador de preview.
- `src/lib/print-service.ts`: Interface com a Bridge/Janela.
- `src/lib/print-dispatcher.ts`: Roteador de tipos de impressão.
- `src/lib/print-config.ts`: Gerenciador de persistência (Banco + Local).
- `src/lib/print-engine.ts`: Definições de build e fingerprints.
- `src/lib/print-origin-tracker.ts`: Rastreamento de IP/Device.
- `src/components/admin/PrintConfigPanel.tsx`: UI do editor de impressão.
- `src/components/admin/BridgeOriginDiagnostics.tsx`: UI de diagnóstico.
- `src/components/admin/PrintConfigSelfTest.tsx`: UI de teste de impressão.
- `src/components/admin/PrintOriginPanel.tsx`: Histórico de origens.
- `supabase/migrations/20260427063555_...sql`: Migrations das RPCs de configuração.

---

## 4. BANCO DE DADOS / MIGRATIONS / RPCS
- **Tabela:** `public.settings` (usada para armazenar `key='print_config'`).
- **Funções SQL (RPCs):**
  - `admin_save_print_config(p_config jsonb)`: Salva a configuração global (Security Definer).
  - `get_print_config()`: Retorna a configuração e o `updated_at` para sincronização.
- **RLS:** Acesso de leitura público (anon) para a bridge, escrita restrita via RPC.

---

## 5. CONFIGURAÇÃO DE IMPRESSÃO
- **Onde é salva:** Na tabela `settings` do banco de dados.
- **Cache Local:** O navegador/EXE mantém uma cópia no `localStorage` (`print_config`) para acesso instantâneo.
- **Sincronização:** A função `ensureFreshPrintConfig()` compara o `updated_at` local com o do banco antes de cada impressão. Se o banco for mais novo, atualiza o local.
- **Campos Locais (Não Sincronizados):**
  - `printMode`: (browser ou bridge) - Cada PC pode ter seu modo.
  - `bridgeUrl`: (ex.: http://localhost:3001/print) - Cada PC aponta para sua bridge.

---

## 6. NOVO MODELO DE IMPRESSÃO
- **Dispatcher Único:** Toda chamada de impressão deve passar por `printDispatcher`.
- **Impressão por Service Type:**
  - `delivery`: Layout detalhado de entrega.
  - `pickup` / `balcao`: Layout de retirada.
  - `dine_in`: Layout de mesa.
- **Fingerprints Obrigatórios (no rodapé):**
  - `PRINT_ENGINE`: Versão do motor (ex.: `v2026-04-27-delivery-layout`).
  - `APP_BUILD`: Timestamp ou versão do build web.
  - `PRINT_PATH`: Caminho lógico (ex.: `dispatcher.delivery`).
  - `ORDER`: Primeiros 8 caracteres do ID do pedido.
  - `SERVICE`: Tipo de serviço detectado.

---

## 7. PROBLEMA IDENTIFICADO NO EXE ANTIGO
- O EXE antigo servia a bridge na porta 3001 mas rodava um bundle web embutido (app.asar) muito antigo.
- Por causa disso, ao imprimir "pelo EXE", o sistema usava templates de meses atrás, ignorando as correções de layout de Delivery e Mesa.
- O novo EXE **precisa** conter o build gerado hoje para que o código de impressão dentro dele seja o mesmo do navegador.

---

## 8. REQUISITOS PARA O NOVO EXE TESTE
- **Nome do Produto:** `Plano B Fast Order PDV 3.3.0 TESTE`
- **AppId:** `com.planob.fastorder.pdv.teste` (Diferente da versão estável)
- **Pasta de Instalação:** `%AppData%/plano-b-pdv-teste` (Não sobrescrever a 3.2.0)
- **Porta Bridge:** Manter `3001`.
- **Build Web:** Deve usar o resultado de `npm run build` atual.
- **Cache:** O Electron deve iniciar com a sessão limpa ou garantir que o service worker não sirva arquivos antigos.

---

## 9. ESTRATÉGIA RECOMENDADA
**Abordagem:** EXE com Bundle Web Atualizado.
Embora o modo "Bridge-only" (onde o EXE só serve a porta 3001 e o usuário usa o Chrome) seja mais fácil de atualizar, o cliente prefere o EXE como aplicativo. Portanto, o EXE deve ser gerado contendo o build completo da Web para evitar discrepâncias.

---

## 10. COMANDOS E ARQUIVOS DE BUILD
- **Package Manager:** `npm` / `bun`.
- **Build Web:** `npm run build`.
- **Electron Config (A CONFIRMAR COM CODEX):** Verificar `electron-builder.yml` ou `package.json` (seção `build`).
- **Local do .exe:** Geralmente em `/dist` ou `/release`.

---

## 11. CHECKLIST PARA O CODEX
1. [ ] Executar `npm run build` na raiz.
2. [ ] Validar que `src/lib/print-engine.ts` tem a versão `v2026-04-27-delivery-layout`.
3. [ ] Alterar `name` e `productName` no `package.json` para a versão TESTE.
4. [ ] Gerar o instalador `.exe`.
5. [ ] Instalar em uma máquina de teste (lado a lado com a versão atual).
6. [ ] Abrir o Admin > Impressão e verificar se a Bridge está "Online".
7. [ ] Realizar os Testes Obrigatórios (ver seção 12).

---

## 12. TESTES OBRIGATÓRIOS NO EXE NOVO
- [ ] **Bridge Online:** Status verde no painel de impressão.
- [ ] **Teste de Configuração:** O botão "Imprimir Teste" sai com o layout e fontes corretas?
- [ ] **Mesa:** Imprimir um pedido de mesa. Aparece "Mesa: X" e "Garçom: Y"?
- [ ] **Retirada:** Imprimir balcão. Aparece o banner "*** RETIRADA / BALCAO ***"?
- [ ] **Delivery:** Imprimir entrega. O endereço e taxa aparecem corretamente?
- [ ] **Fingerprints:** O rodapé contém `PRINT_ENGINE`, `APP_BUILD` e `PRINT_PATH`?

---

## 13. O QUE NÃO PODE ACONTECER
- **Sobrescrever a versão 3.2.0:** O cliente usa a 3.2.0 para trabalhar. A 3.3.0 TESTE deve ser independente.
- **Reutilizar app.asar antigo:** O build deve ser 100% novo.
- **Alterar dados de produção:** O EXE deve ler o mesmo banco, mas não deve disparar comandos de "limpeza" ou "reset" sem aviso.

---

## 14. PROMPT FINAL PARA O CODEX

> **PROMPT PARA O CODEX:**
> "Olá Codex. Preciso que você gere um novo executável (.exe) de TESTE para este projeto, seguindo as diretrizes do relatório `RELATORIO_PARA_RECRIAR_EXE_TESTE.md`. 
> 
> 1. Localize os arquivos de configuração do Electron/Build (ex.: `package.json`, `electron-builder.json`).
> 2. Mude o nome do produto para 'Plano B Fast Order PDV 3.3.0 TESTE' e o AppID para algo único que não sobrescreva a versão estável 3.2.0.
> 3. Certifique-se de realizar um novo `npm run build` da web para incluir todos os novos layouts de impressão (`receipt-layout.ts`) e o motor `print-engine`.
> 4. Gere o instalador e me informe o caminho do arquivo final. 
> 5. **NÃO** remova a funcionalidade de Bridge na porta 3001.
> 6. Validar que o `APP_BUILD` e `PRINT_ENGINE` (v2026-04-27...) aparecem corretamente nos logs ou no console do Electron."
