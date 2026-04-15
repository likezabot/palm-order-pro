export interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  active: boolean;
  created_at: string;
}

export interface CartItem {
  product: Product;
  quantity: number;
  note: string;
}

export interface Order {
  id: string;
  table_name: string;
  status: string;
  waiter_name: string | null;
  total: number | null;
  payment_method: string | null;
  amount_paid: number | null;
  created_at: string;
  updated_at: string;
  delta_items?: any[] | null;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  product_price: number;
  quantity: number;
  note: string | null;
  subtotal: number;
}

export const CATEGORY_LABELS: Record<string, string> = {
  refeicoes: "Refeições",
  espetos: "Espetos",
  bebidas: "Bebidas",
  cervejas: "Cervejas",
};

export const CATEGORIES = ["refeicoes", "espetos", "bebidas", "cervejas"] as const;
