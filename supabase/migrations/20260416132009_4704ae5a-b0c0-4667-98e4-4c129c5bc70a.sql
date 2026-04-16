-- Drop OLD overloads (without p_should_print)
DROP FUNCTION IF EXISTS public.create_order(text, text, numeric, jsonb);
DROP FUNCTION IF EXISTS public.update_order_items(uuid, numeric, jsonb, jsonb, text);
DROP FUNCTION IF EXISTS public.update_order_items(uuid, numeric, jsonb, jsonb, text, integer);
DROP FUNCTION IF EXISTS public.pay_order(uuid, text, numeric);