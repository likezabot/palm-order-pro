

# Plano: alerta único de impressora offline + alerta de "voltou ao ar"

## O que muda

Hoje o sistema manda **1 alerta a cada 10 minutos** enquanto a ponte de impressão está offline. Você quer:

1. **1 único alerta** quando a impressora cair (após 10 min offline contínuo, pra evitar piscadas de rede curtas).
2. **Silêncio total** enquanto continuar offline — sem repetir.
3. **1 alerta de "voltou ao ar"** quando a ponte reconectar e imprimir com sucesso.

## Como vai funcionar

### Estado persistido em `settings`

Crio uma chave `printer_bridge_state` com o formato:
```json
{ "status": "online" | "offline", "since": "2026-04-23T11:30:00Z", "alerted": true|false }
```

Isso permite a função saber **o estado anterior** e só agir nas transições.

### Lógica nova no `notify-telegram`

Substituo o bloco atual de "alerta a cada 10 min" por uma máquina de estados:

```text
Estado atual    | Sinal recebido           | Ação
----------------|--------------------------|------------------------------------------
online          | falha de ponte           | marca offline (since=agora, alerted=false)
offline (<10m)  | falha de ponte           | nada (aguardando confirmar 10min)
offline (≥10m)  | falha de ponte, !alerted | envia "🔌 Impressora offline há 10min"
                |                          | marca alerted=true
offline         | impressão bem-sucedida   | envia "✅ Impressora voltou ao ar"
                |                          | marca online
online          | impressão bem-sucedida   | nada
```

### Detectando "voltou ao ar"

Adiciono um **novo trigger no banco** `queue_print_recovered` em `orders`: quando `print_status` muda de `pending`/`printing` para `printed` e o estado salvo é `offline`, enfileira evento `print_recovered`.

A função `notify-telegram` processa esse evento, envia a mensagem de recuperação e marca o estado como `online`.

### Mensagens

- **Cai (após 10 min):** `🔌 Impressora offline há 10 minutos. Pedidos estão na fila e imprimem quando voltar.`
- **Volta:** `✅ Impressora voltou ao ar! Pedidos pendentes serão impressos automaticamente.`

## Arquivos afetados

**Edge Function** `supabase/functions/notify-telegram/index.ts`:
- Remove o loop de "1 a cada 10 min".
- Adiciona leitura/escrita de `printer_bridge_state` em `settings`.
- Implementa máquina de estados (offline/online) com transições.
- Processa novo evento `print_recovered`.

**Migração SQL** (nova):
- Trigger `queue_print_recovered` em `orders` que detecta transição `pending|printing → printed` e enfileira evento na `notification_queue`.
- Insert inicial em `settings` com `printer_bridge_state = {"status":"online"}`.

## Resultado prático

- Internet do PC oscila por 2-3 min → **nenhum aviso** (não atinge os 10 min).
- Impressora fica desligada de manhã inteira → **1 aviso** quando passa dos 10 min, depois silêncio.
- Você liga a impressora de novo → **1 aviso** "voltou ao ar" assim que o primeiro pedido imprimir.

