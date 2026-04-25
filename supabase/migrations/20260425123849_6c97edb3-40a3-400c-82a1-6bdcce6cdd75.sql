-- Reverter estado
UPDATE public.restaurants SET is_open_override = 'auto' WHERE slug = 'plano-b-espetaria';
UPDATE public.products SET is_sold_out = false WHERE id = 'f860b627-8bc1-4cf4-9971-196de0b77bff';

-- Limpar dados de teste
DELETE FROM public.print_jobs WHERE order_id IN (SELECT id FROM public.orders WHERE customer_name_snapshot LIKE 'Teste Fase2%' OR customer_name_snapshot LIKE 'Teste T%');
DELETE FROM public.order_items WHERE order_id IN (SELECT id FROM public.orders WHERE customer_name_snapshot LIKE 'Teste Fase2%' OR customer_name_snapshot LIKE 'Teste T%');
DELETE FROM public.order_status_history WHERE order_id IN (SELECT id FROM public.orders WHERE customer_name_snapshot LIKE 'Teste Fase2%' OR customer_name_snapshot LIKE 'Teste T%');
DELETE FROM public.orders WHERE customer_name_snapshot LIKE 'Teste Fase2%' OR customer_name_snapshot LIKE 'Teste T%';
DELETE FROM public.customers WHERE phone IN ('11999990001','11999990002','11999990004','11999990005');