

## Plano: Atualizar indicador de versão para refletir o histórico real

### Histórico de versões baseado nas mudanças reais do projeto

| Versão | Data | Descrição |
|---|---|---|
| **1.0.0** | 14/04 | Sistema completo inicial: Palm, Cozinha, PDV, Admin, banco de dados, Realtime, tema escuro |
| **1.1.0** | 14/04 | Teclado numérico corrigido, fluxo de impressão com PrintStation, toggle ativo/inativo no Admin |
| **1.2.0** | 14/04 | Garçom persistente (localStorage), PDV Desktop unificado |
| **1.3.0** | 14/04 | Feedback tátil/sonoro (vibração + bips), tela de seleção de atendimento |
| **1.4.0** | 14/04 | Grid visual de mesas (substitui fluxo de 3 telas), otimização UX |
| **1.5.0** | 14/04 | Balcão multi-pedido, redução para 10 mesas, config de mesas no Admin |
| **1.6.0** | 14/04 | PWA instalável (ícones, manifest, banner de instalação), edição de pedidos do balcão, senhas sequenciais (#001, #002...) |
| **1.7.0** | 14/04 | Impressão térmica reescrita do zero (ESC/POS, 58mm/80mm, popup isolado) |
| **1.8.0** | 15/04 | Ponte local USB (bridge Node.js), impressão automática via Realtime |
| **1.9.0** | 15/04 | Sistema de delta/acréscimo (imprime só itens novos), 3 botões manuais (Acréscimo/Pedido/Conta) |
| **1.10.0** | 15/04 | PDV e Caixa unificados, comprovante com CNPJ, modal de dados do cliente |
| **1.10.1** | 15/04 | Correção: botões do Palm viram toggle (não imprimem no celular), print_type salvo no banco |
| **1.10.2** | 15/04 | Correção: impressão web bloqueada (só bridge imprime), mensagens contextuais |
| **1.10.3** | 15/04 | Correção PWA: ícones regenerados, service worker corrigido |
| **1.11.0** | 16/04 | Modal "Enviar e imprimir / sem imprimir" unificado Palm + CloseOrder, p_should_print no RPC |
| **1.11.1** | 16/04 | Correção: overloads de RPC removidos, erro real no toast, logs detalhados |
| **1.12.0** | 16/04 | Fechar conta no Palm + PDV com confirmação de impressão |
| **1.13.0** | 16/04 | Sistema de atualização automática de versão (cache-busting, SW v4, UpdateBanner) |

**Versão atual: v1.13.0**

### Alteração

Atualizar `src/pages/Index.tsx` para exibir `v1.13.0` em vez de `v1.0`, mantendo a data do build entre parênteses:

```
v1.13.0 (2026-04-16)
```

Arquivo alterado: `src/pages/Index.tsx` — uma linha.

