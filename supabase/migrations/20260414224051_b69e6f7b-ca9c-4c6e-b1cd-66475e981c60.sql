-- Add columns to products
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_quantity INTEGER DEFAULT 0;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'unidade';

-- Add columns to orders
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS is_printed BOOLEAN DEFAULT FALSE;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS payment_method TEXT;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS amount_paid NUMERIC;

-- Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('waiter', 'cook', 'cashier', 'manager', 'owner')),
  pin TEXT, -- 4 digit PIN
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public profiles are viewable by everyone" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Only managers/owners can modify profiles" ON public.profiles FOR ALL USING (
  -- For now, let's allow all for dev, or implement proper check if we had auth
  true 
);

-- Create cash_register table
CREATE TABLE IF NOT EXISTS public.cash_register (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  opened_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  closed_at TIMESTAMP WITH TIME ZONE,
  user_id UUID REFERENCES public.profiles(id),
  initial_amount NUMERIC NOT NULL DEFAULT 0,
  final_amount NUMERIC,
  total_sales NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed'))
);

-- Enable RLS on cash_register
ALTER TABLE public.cash_register ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cash register viewable by everyone" ON public.cash_register FOR SELECT USING (true);
CREATE POLICY "Cash register manageable by everyone" ON public.cash_register FOR ALL USING (true);

-- Create cash_movements (Sangrias/Reforços)
CREATE TABLE IF NOT EXISTS public.cash_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cash_register_id UUID REFERENCES public.cash_register(id),
  type TEXT NOT NULL CHECK (type IN ('in', 'out')), -- 'out' for Sangria
  amount NUMERIC NOT NULL,
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on cash_movements
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Cash movements viewable by everyone" ON public.cash_movements FOR SELECT USING (true);
CREATE POLICY "Cash movements manageable by everyone" ON public.cash_movements FOR ALL USING (true);

-- Create stock_movements
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID REFERENCES public.products(id),
  quantity INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('in', 'out')),
  reason TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on stock_movements
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Stock movements viewable by everyone" ON public.stock_movements FOR SELECT USING (true);
CREATE POLICY "Stock movements manageable by everyone" ON public.stock_movements FOR ALL USING (true);

-- Seed some profiles
INSERT INTO public.profiles (name, role, pin) VALUES 
('Garçom 1', 'waiter', NULL),
('Churrasqueiro 1', 'cook', NULL),
('Caixa 1', 'cashier', '1234'),
('Gerente', 'manager', '4321'),
('Dono', 'owner', 'Zabot');

-- Create function to update updated_at if it exists in other tables
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';
