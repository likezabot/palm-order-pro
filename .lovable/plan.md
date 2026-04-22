

## Ativar o item "Porco" no cardápio e dar estoque às 3 variantes

### Diagnóstico

Consultei o banco:

| Item | Cardápio (products) | Estoque (inventory_items) |
|---|---|---|
| **Porco** | ❌ não existe | ❌ não existe |
| **Panceta suína** | ✅ ativo, R$ 10,00 | ✅ existe, mas `current_stock=0` |
| **Costela suína** | ✅ ativo, R$ 10,00 | ✅ existe, mas `current_stock=0` |

Por isso o popup mostra:
- **Porco** → "Não cadastrado no admin" (desabilitado)
- **Panceta/Costela** → ESGOTADO (estoque zero)

### O que vou fazer (via migração SQL)

**1. Criar o produto "Porco" no cardápio**
```sql
INSERT INTO products (name, category, price, active)
VALUES ('Porco', 'espetos', 10.00, true);
```

**2. Criar o item de estoque vinculado ao Porco**
```sql
INSERT INTO inventory_items (product_id, name, unit, current_stock, min_stock)
VALUES (<id-do-porco>, 'Porco', 'unidade', 10, 5);
```

**3. Repor estoque inicial das outras 2 variantes** para sair do ESGOTADO:
```sql
UPDATE inventory_items SET current_stock = 10, min_stock = 5
WHERE id IN ('f4fb50ef-...panceta', '308a27d3-...costela');
```

### Resultado esperado

- Popup do Porco no PALM passa a mostrar **3 cards ativos** com preço R$ 10,00 cada, sem ESGOTADO.
- Banner do "Grupo Porco" no Admin e Estoque mostra os 3 itens ativos com estoque normal.
- Card "Porco" no PALM (com selo 🐷 GRUPO) abre o popup com as 3 variantes utilizáveis.

### Perguntas rápidas

1. **Estoque inicial das 3 variantes**: usar **10 unidades** com mínimo **5**? Ou prefere outros valores (ex: 0/0 e você lança entrada manualmente depois)?
2. **Preço do "Porco"**: confirmar **R$ 10,00** (igual às outras variantes do grupo)?

Se confirmar (ou aceitar os defaults), eu rodo a migração na próxima mensagem.

