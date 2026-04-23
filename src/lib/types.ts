export interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
  active: boolean;
  created_at: string;
  /** Apelidos / variações para reconhecimento por voz/texto no Telegram. */
  aliases?: string[];
}

export interface CartItem {
  product: Product;
  quantity: number;
  note: string;
  waiter_name?: string;
}

export type OrderPrintType = "extra" | "full" | "bill";
export type OrderPrintStatus = "pending" | "printing" | "printed" | "failed";

export interface Order {
  id: string;
  table_name: string;
  original_table_name?: string | null;
  status: string;
  waiter_name: string | null;
  total: number | null;
  payment_method: string | null;
  amount_paid: number | null;
  created_at: string;
  updated_at: string;
  printed_at?: string | null;
  delta_items?: any | null;
  print_type?: OrderPrintType | null;
  print_status?: OrderPrintStatus;
  print_claimed_at?: string | null;
  print_last_error?: string | null;
  version?: number;
  served_at?: string | null;
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
  waiter_name?: string | null;
}

export const CATEGORY_LABELS: Record<string, string> = {
  refeicoes: "Refeições",
  espetos: "Espetos",
  bebidas: "Bebidas",
  cervejas: "Cervejas",
};

export const CATEGORIES = ["refeicoes", "espetos", "bebidas", "cervejas"] as const;
