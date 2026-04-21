

## Refinar botão "Servir" + propagar status para Cozinha e PDV

### Problemas atuais
1. Chip "Servir" é grande, com borda dupla e label longo — polui o card
2. Após servir, o chip continua ocupando espaço com "Servido · 12min"
3. Cozinha (Kanban) e PDV (Caixa) não sabem que a mesa foi servida — sem feedback visual

### Mudanças

**1. Botão "Servir" mais elegante (`src/components/palm/TableGrid.tsx`)**
- **Não servida**: ícone `UtensilsCrossed` sozinho num botão circular pequeno (32×32) no canto superior direito do card, fundo `bg-background/60 backdrop-blur`, borda sutil. Sem label de texto. Tooltip "Marcar como servido".
- **Servida**: o chip **some completamente**. O próprio card já comunica via cor azul + badge "Servido HH:MM" discreto no rodapé (substitui o tempo de produção).
- Para **desmarcar** (caso de erro): toque longo (long-press 600ms) no card servido abre confirmação "Desmarcar como servido?". Mantém UI limpa sem botão visível.

**2. Avisar Cozinha (`src/pages/Kitchen.tsx` + `KanbanCard.tsx`)**
- Buscar `served_at` no select de orders
- Card do kanban ganha **badge "✓ Servido HH:MM"** verde no canto quando `served_at != null`
- Ordem visual: cards servidos descem para o final da coluna (são prioridade baixa pra cozinha)
- Realtime já cobre — `orders` está no `supabase_realtime` publication

**3. Avisar PDV/Caixa (`src/components/pdv/OrderRow.tsx` + `OrderSection.tsx`)**
- Buscar `served_at` no select
- Linha do pedido ganha **ícone `UtensilsCrossed` verde + tooltip "Servido HH:MM"** ao lado do nome da mesa
- Útil pro caixa saber que pode cobrar com mais confiança

**4. Realtime já garantido**
- Migração anterior aplicou `REPLICA IDENTITY FULL` em `orders` — payloads completos chegam em todos os listeners
- Palm, Kitchen e PDV já têm canais subscritos em `orders` que invalidam queries

### Arquivos
- **Editado**: `src/components/palm/TableGrid.tsx` — chip redesenhado (ícone-only), long-press para desmarcar, badge "Servido HH:MM" no rodapé
- **Editado**: `src/components/kitchen/KanbanCard.tsx` — badge servido + leitura de `served_at`
- **Editado**: `src/pages/Kitchen.tsx` — incluir `served_at` no select; ordenar servidos no fim
- **Editado**: `src/components/pdv/OrderRow.tsx` — ícone servido ao lado da mesa
- **Editado**: `src/components/pdv/OrderSection.tsx` (se necessário) — passar `served_at` adiante
- **Editado**: `src/pages/Pdv.tsx` — incluir `served_at` no select

### Sem mudanças no banco
Coluna `served_at` e trigger de reset já existem.

### Resultado
- Card do Palm fica **limpo**: ícone discreto canto superior quando não servido, badge "Servido HH:MM" sutil no rodapé quando servido
- Cozinha vê em tempo real quais mesas já estão comendo (badge verde + ordem ajustada)
- Caixa vê em tempo real quais mesas já foram servidas (ícone na linha do pedido)
- Long-press evita toques acidentais ao desmarcar

