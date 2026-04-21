-- Apaga itens dos pedidos criados hoje
DELETE FROM public.order_items
WHERE order_id IN (
  SELECT id FROM public.orders WHERE created_at::date = CURRENT_DATE
);

-- Apaga pedidos criados hoje
DELETE FROM public.orders WHERE created_at::date = CURRENT_DATE;

-- Apaga movimentos de caixa de hoje
DELETE FROM public.cash_movements WHERE created_at::date = CURRENT_DATE;

-- Fecha caixas abertos hoje (zerando totais)
UPDATE public.cash_register
SET status = 'closed',
    closed_at = now(),
    final_amount = 0,
    total_sales = 0
WHERE opened_at::date = CURRENT_DATE AND status = 'open';