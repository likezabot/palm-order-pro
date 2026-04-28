-- Update fail_order_print to be terminal (requires manual action)
CREATE OR REPLACE FUNCTION public.fail_order_print(p_order_id uuid, p_error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.orders
  SET print_status = 'failed', -- Changed from 'pending' to 'failed'
      print_claimed_at = NULL,
      print_last_error = p_error
  WHERE id = p_order_id
    AND print_status = 'printing';
END;
$function$;

-- Update complete_order_print to accept 'failed' as a starting state (for manual retries)
CREATE OR REPLACE FUNCTION public.complete_order_print(p_order_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE public.orders
  SET print_status = 'printed',
      printed_at = now(),
      print_claimed_at = NULL,
      print_last_error = NULL
  WHERE id = p_order_id
    AND print_status IN ('pending', 'printing', 'queued', 'failed'); -- Added 'failed'
END;
$function$;
