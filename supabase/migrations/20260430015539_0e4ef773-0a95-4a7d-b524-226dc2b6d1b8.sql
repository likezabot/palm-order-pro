-- Revoke broad permissions
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM public;

-- Revoke default privileges to prevent future broad access
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM public;

-- Grant to Public-facing functions (anon + authenticated)
GRANT EXECUTE ON FUNCTION public.get_public_order_status(uuid, uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_orders(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_restaurant_open(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.calculate_delivery_fee(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_loyalty_status(text, text, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_public_loyalty_status(text, text, numeric, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.normalize_phone(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_rpc_consistency() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_customer_profile(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_last_customer_address(text) TO anon, authenticated;

-- Grant to POS/Palm-facing functions (anon + authenticated)
GRANT EXECUTE ON FUNCTION public.update_order_status(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.pay_order(uuid, text, numeric, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_order_items(uuid, numeric, jsonb, jsonb, text, integer, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order(text, text, numeric, jsonb, boolean, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rename_order_table(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.move_order_to_table(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_print_job(uuid, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_print_config() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_order_print(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_order_print(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fail_order_print(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_print_job() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_print_job(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_print_failure() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_print_recovered() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.requeue_stuck_print_jobs(integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.requeue_stuck_print_jobs_v2(integer) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cash_open(text, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cash_close(text, uuid, numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.verify_manager_pin(text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public._require_manager_pin(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.force_clear_orphan_prints() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.merge_table_duplicates(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_table_renamed() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_order_updated() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_cash_closed() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.toggle_product_active(uuid, boolean) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_served_at_on_new_items() TO anon, authenticated;

-- Admin and sensitive functions remain restricted to authenticated
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;
