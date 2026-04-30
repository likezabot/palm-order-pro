# RELATÓRIO TÉCNICO: RECRIAÇÃO DE EXE TESTE (VERSÃO 3.3.0 TESTE)

## 1. RESUMO EXECUTIVO
- **O que mudou no web:** O sistema de impressão foi totalmente reconstruído com um motor unificado (`print-engine`), novo roteamento de serviços (`print-dispatcher`), editor visual de cupom no Admin e suporte completo a Delivery/Retirada com layouts específicos. Foi implementado o sistema de Fidelidade (pontos/brindes) e diagnóstico de Bridge.
- **Por que o EXE antigo não deve ser usado:** O EXE atual (3.2.0 ou anterior) contém um bundle web antigo e caminhos de impressão que ignoram as novas configurações do banco de dados (`print_config`) e os novos layouts corrigidos. Isso causa divergência entre o que o cliente vê na tela (web) e o que sai na impressora (EXE).
- **Necessidade do novo EXE:** O novo EXE servirá para validar o build aprovado em ambiente desktop, garantindo que a impressão térmica local (porta 3001) utilize exatamente a mesma lógica do navegador atual.

---

## 2. LISTA DE MUDANÇAS IMPLEMENTADAS

### Cardápio Público / Visual
- Sincronização de grupos e subgrupos via banco.
- Interface otimizada para dispositivos móveis.
- Exibição de pontos acumulados e brindes disponíveis durante o checkout.

### Fidelidade / Pontos
- Cadastro de clientes via telefone.
- Cálculo automático de pontos (`points_per_real`).
- Resgate de brindes condicionado a saldo e valor mínimo de pedido (`min_order_subtotal`).
- Bloqueio de brindes específicos para tipos de serviço (ex: apenas retirada).

### Checkout / Brindes
- Integração de brindes no carrinho (`public-cart.ts`).
- Validação server-side dos pontos no fechamento do pedido.

### Admin / Impressão
- **Painel de Configuração:** Editor para `paperWidth` (58mm/80mm), `headerText`, `footerText`, `layoutPreset` e visibilidade de seções (`visibleSections`).
- **Diagnóstico:** Histórico de origens de impressão e status da Bridge local.
- **Self-Test:** Botão para imprimir cupom de teste direto do Admin.

### Bridge / Diagnóstico
- Rastreamento de origem (`print-origin-tracker.ts`) enviando IP e identificador do dispositivo.
- Diagnóstico detalhado de falhas de comunicação com a porta 3001.

### Templates de Talão
- Layouts unificados em `receipt-layout.ts`.
- **Mesa:** Foco em `waiter_name` e `table_name`.
- **Retirada/Balcão:** Identificação clara do cliente.
- **Delivery:** Bloco de endereço multilinha, taxa de entrega, descontos e resumo financeiro.

### Dispatcher de Impressão
- Centralização de todas as chamadas em `print-dispatcher.ts`, garantindo que o roteamento (`delivery`, `pickup`, `dine_in_full`) seja seguido rigorosamente.

### RLS / RPC / Configuração
- Migração de configurações do `localStorage` para a tabela `settings`.
- Implementação de RPCs `admin_save_print_config` e `get_print_config`.

### Diagnóstico de Origem
- Inclusão de `PRINT_PATH` e `PRINT_ENGINE` no rodapé do cupom para auditoria.

### Correções de Layout
- Remoção de labels "N/A" ou "---" quando campos estão vazios.
- Alinhamento centralizado para cabeçalho/rodapé e configurável para o corpo.

---

## 3. ARQUIVOS ALTERADOS / CRIADOS
- `src/lib/receipt-layout.ts` (Core do layout)
- `src/lib/receipt-html.ts` (Preview Web)
- `src/lib/thermal-printer.ts` (Comunicação Bridge)
- `src/lib/print-receipt.ts` (Orquestrador)
- `src/lib/print-service.ts` (Bridge Client)
- `src/lib/print-dispatcher.ts` (Roteador de Impressão)
- `src/lib/print-config.ts` (Sincronização Banco/Local)
- `src/lib/print-engine.ts` (Metadados de Build)
- `src/lib/print-origin-tracker.ts` (Diagnóstico)
- `src/components/admin/PrintConfigPanel.tsx` (Editor UI)
- `src/components/admin/BridgeOriginDiagnostics.tsx`
- `src/components/admin/PrintConfigSelfTest.tsx`
- `src/components/admin/PrintOriginPanel.tsx`
- `src/lib/loyalty.ts` (Sistema de Pontos)
- `supabase/migrations/20260427063555_48b23654-d669-43a0-ad5c-62e7b8f708d8.sql` (RPCs print_config)

---

## 4. BANCO DE DADOS / MIGRATIONS / RPCS
- **Configurações:** Salvas na tabela `settings` com chave `print_config`.
- **RPC `admin_save_print_config(p_config jsonb)`**: Salva via Security Definer.
- **RPC `get_print_config()`**: Retorna `{value, updated_at}`.
- **Fidelidade:**
  - Tabela `loyalty_points` (histórico de transações).
  - Tabela `loyalty_rewards` (cadastro de brindes).
  - RPC `get_public_loyalty_status(p_phone, p_restaurant_slug, ...)` para consulta segura.

---

## 5. CONFIGURAÇÃO DE IMPRESSÃO
- **Sincronização:** O Admin salva no banco. O PDV (Web ou EXE) verifica se o banco é mais novo via `ensureFreshPrintConfig()`.
- **Campos Locais (Não sincronizam):**
  - `printMode`: Determina se o PC usa Bridge ou Browser.
  - `bridgeUrl`: IP/Porta da bridge (ex: `http://localhost:3001/print`).
- **Cache:** Sempre sincronizado com `localStorage` (`print_config`) para evitar delay na primeira impressão.

---

## 6. NOVO MODELO DE IMPRESSÃO
- **Dispatcher Único:** Toda impressão deve chamar `printDispatcher.print(...)`.
- **Fingerprints Obrigatórios:**
  - `PRINT_ENGINE`: `v2026-04-27-delivery-layout`
  - `APP_BUILD`: Versão atual do build web.
  - `PRINT_PATH`: Identifica a rota (ex: `dispatcher.delivery`).
  - `ORDER`: ID curto do pedido.
  - `SERVICE`: `delivery`, `pickup` ou `dine_in`.

---

## 7. PROBLEMA IDENTIFICADO NO EXE ANTIGO
- O EXE antigo serve a Bridge mas carrega um build web embutido (app.asar) desatualizado.
- Ao imprimir, ele usa as funções de layout que estão no seu bundle antigo, resultando em cupons sem as correções de Delivery e sem as configurações de fonte do Admin.

---

## 8. REQUISITOS PARA O NOVO EXE TESTE
- **Nome:** `Plano B Fast Order PDV 3.3.0 TESTE`
- **appId:** `com.planob.fastorder.pdv.teste` (Não sobrescrever a 3.2.0 estável).
- **Pasta:** `%AppData%/PlanoBFastOrderPDVTeste`.
- **Porta:** Manter `3001` (Bridge ativa).
- **Build:** Usar build web atual (saída de `npm run build`).
- **Identificação:** Deve mostrar `PRINT_ENGINE: v2026-04-27-delivery-layout` no cupom.

---

## 9. ESTRATÉGIA RECOMENDADA DO EXE
O EXE deve ser um wrapper (Electron) que contém o build web atualizado. A recomendação é:
1. Gerar o EXE com o bundle web embutido para performance offline local.
2. Garantir que o EXE respeite a configuração `ensureFreshPrintConfig()` para baixar novas configs do Admin via banco.

---

## 10. COMANDOS / ARQUIVOS NECESSÁRIOS PARA BUILD
- **Manager:** `npm` ou `bun`.
- **Build Web:** `npm run build`.
- **Build Desktop:** Verificar scripts no `package.json` (geralmente `electron-builder`).
- **AppId/Name:** Alterar no `package.json` ou `electron-builder.json` antes de gerar.
- **Output:** Instalador `.exe` gerado em `/dist` ou `/release`.

---

## 11. CHECKLIST PARA CODEX GERAR O EXE
- [ ] Rodar `npm run build`.
- [ ] Alterar versão para `3.3.0-TESTE` no `package.json`.
- [ ] Alterar `name` para `plano-b-pdv-teste`.
- [ ] Confirmar que `src/lib/print-engine.ts` tem a constante `v2026-04-27-delivery-layout`.
- [ ] Gerar instalador.
- [ ] Testar instalação paralela (não deve remover a versão antiga).
- [ ] Testar impressão de mesa e delivery.

---

## 12. TESTES OBRIGATÓRIOS NO EXE NOVO
- [ ] Status da Bridge "Online" no Admin.
- [ ] Impressão de "Teste de Configuração" com fingerprints corretos.
- [ ] Pedido de Delivery saindo com endereço completo.
- [ ] Pedido de Mesa saindo sem campos "NAO INFORMADO".
- [ ] Persistência de `bridgeUrl` após reiniciar o EXE.

---

## 13. O QUE NÃO PODE ACONTECER
- **Sobrescrever o ícone/atalho da 3.2.0 estável.**
- **Remover o serviço de Bridge na porta 3001.**
- **Conectar em um banco de dados diferente (deve usar o mesmo Supabase).**

---

## 14. PROMPT FINAL PARA O CODEX

```text
PROMPT_FINAL_PARA_CODEX:

"Olá Codex. Preciso que você gere um novo instalador .exe de TESTE para o projeto, seguindo rigorosamente as diretrizes em 'docs/RELATORIO_PARA_RECRIAR_EXE_TESTE.md'.

Objetivo: Gerar a versão 'Plano B Fast Order PDV 3.3.0 TESTE' com appId único para não sobrescrever a instalação atual 3.2.0.

Passos:
1. Leia o relatório técnico em docs/RELATORIO_PARA_RECRIAR_EXE_TESTE.md.
2. Localize os arquivos de configuração do Electron (package.json e electron-builder.json se houver).
3. Certifique-se de realizar um novo 'npm run build' para capturar as mudanças de layout e motor de impressão (print-engine v2026-04-27).
4. Gere o executável preservando a Bridge na porta 3001.
5. Valide que o APP_BUILD e fingerprints aparecem no rodapé das impressões.
6. Forneça o link ou caminho para o instalador gerado sem publicar como versão definitiva."
```
