-- Create a table for printer logs
CREATE TABLE public.printer_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    message TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.printer_logs ENABLE ROW LEVEL SECURITY;

-- Create policies (allowing select for everyone, insert for everyone)
CREATE POLICY "Printer logs are viewable by everyone" 
ON public.printer_logs 
FOR SELECT 
USING (true);

CREATE POLICY "Anyone can insert printer logs" 
ON public.printer_logs 
FOR INSERT 
WITH CHECK (true);

-- Index for performance
CREATE INDEX idx_printer_logs_created_at ON public.printer_logs(created_at DESC);
CREATE INDEX idx_printer_logs_order_id ON public.printer_logs(order_id);
