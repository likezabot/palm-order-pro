DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='orders' AND policyname='orders_insert') THEN
    CREATE POLICY "orders_insert" ON public.orders FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='orders' AND policyname='orders_update') THEN
    CREATE POLICY "orders_update" ON public.orders FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='order_items' AND policyname='order_items_insert') THEN
    CREATE POLICY "order_items_insert" ON public.order_items FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='order_items' AND policyname='order_items_update') THEN
    CREATE POLICY "order_items_update" ON public.order_items FOR UPDATE USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='order_items' AND policyname='order_items_delete') THEN
    CREATE POLICY "order_items_delete" ON public.order_items FOR DELETE USING (true);
  END IF;
END $$;