## Plano

Vou aplicar uma correção cirúrgica para fazer o checkout voltar a finalizar sem redesenhar a tela.

### Diagnóstico confirmado
O erro atual não está na busca do cliente nem nos pontos. O envio do pedido está falhando porque o checkout está chamando a função de criação com o slug literal `:slug` em vez do slug real do restaurante.

Evidência encontrada:
- rota ativa no preview: `/menu/:slug/checkout`
- payload enviado ao backend: `p_restaurant_slug: ":slug"`
- resposta do backend: `restaurant_not_found`

Ou seja: o pedido quebra antes da gravação porque o restaurante não é localizado.

### O que vou corrigir
1. Criar uma resolução segura do slug do restaurante nas páginas públicas.
   - Se o parâmetro da rota vier inválido (`:slug`, vazio, placeholder ou valor malformado), usar o slug real do restaurante carregado do backend.
   - Se necessário, usar fallback pelo restaurante principal do sistema.

2. Aplicar essa resolução no checkout público.
   - Usar o slug resolvido em:
     - busca do restaurante
     - busca do cliente por telefone
     - consulta de fidelidade
     - criação do pedido
     - navegação para sucesso/voltar ao cardápio
   - Isso mantém a tela igual, mudando só a origem do dado.

3. Melhorar a tolerância de erro no submit.
   - Tratar `restaurant_not_found` com mensagem clara caso ainda ocorra.
   - Evitar que o usuário fique preso num erro genérico quando o problema for o slug.

4. Validar os cenários críticos sem refatoração ampla.
   - checkout em rota correta: `/menu/plano-b-espetaria/checkout`
   - checkout em rota com placeholder: `/menu/:slug/checkout`
   - cliente encontrado por telefone
   - entrega com endereço salvo
   - retirada sem endereço
   - pedido com e sem brinde

## Arquivos mais prováveis
- `src/pages/PublicCheckout.tsx`
- `src/lib/public-menu.ts`
- possivelmente `src/pages/PublicOrderSuccess.tsx` se eu precisar alinhar a navegação pós-pedido com o slug resolvido

## Resultado esperado
Após a correção:
- o botão Confirmar pedido volta a funcionar
- a busca de cliente continua funcionando
- pontos/brindes não bloqueiam o envio indevidamente
- a interface permanece praticamente igual

## Detalhes técnicos
Estratégia prevista:

```text
useParams().slug
   -> validar
   -> se inválido, usar restaurantQuery.data?.slug
   -> se ainda faltar, buscar fetchCurrentRestaurant()
   -> resolvedSlug
   -> usar resolvedSlug em todas as RPCs e navegações do checkout
```

Também vou manter a correção focada, sem mexer em preços, estoque, categorias, carrinho, checkout visual ou regras fora do envio do pedido.