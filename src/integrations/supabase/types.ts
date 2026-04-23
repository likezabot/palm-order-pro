export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      cash_movements: {
        Row: {
          amount: number
          cash_register_id: string | null
          created_at: string | null
          id: string
          reason: string | null
          type: string
        }
        Insert: {
          amount: number
          cash_register_id?: string | null
          created_at?: string | null
          id?: string
          reason?: string | null
          type: string
        }
        Update: {
          amount?: number
          cash_register_id?: string | null
          created_at?: string | null
          id?: string
          reason?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_cash_register_id_fkey"
            columns: ["cash_register_id"]
            isOneToOne: false
            referencedRelation: "cash_register"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_register: {
        Row: {
          closed_at: string | null
          final_amount: number | null
          id: string
          initial_amount: number
          opened_at: string | null
          status: string | null
          total_sales: number | null
          user_id: string | null
        }
        Insert: {
          closed_at?: string | null
          final_amount?: number | null
          id?: string
          initial_amount?: number
          opened_at?: string | null
          status?: string | null
          total_sales?: number | null
          user_id?: string | null
        }
        Update: {
          closed_at?: string | null
          final_amount?: number | null
          id?: string
          initial_amount?: number
          opened_at?: string | null
          status?: string | null
          total_sales?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_register_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      daily_product_stats: {
        Row: {
          created_at: string
          date: string
          product_id: string | null
          product_name: string
          quantity_sold: number
          revenue: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          product_id?: string | null
          product_name: string
          quantity_sold?: number
          revenue?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          product_id?: string | null
          product_name?: string
          quantity_sold?: number
          revenue?: number
          updated_at?: string
        }
        Relationships: []
      }
      daily_sales_summary: {
        Row: {
          created_at: string
          date: string
          orders_count: number
          payment_breakdown: Json
          total_revenue: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          orders_count?: number
          payment_breakdown?: Json
          total_revenue?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          orders_count?: number
          payment_breakdown?: Json
          total_revenue?: number
          updated_at?: string
        }
        Relationships: []
      }
      daily_waiter_stats: {
        Row: {
          created_at: string
          date: string
          items_count: number
          orders_count: number
          revenue: number
          tables_count: number
          updated_at: string
          waiter_name: string
        }
        Insert: {
          created_at?: string
          date: string
          items_count?: number
          orders_count?: number
          revenue?: number
          tables_count?: number
          updated_at?: string
          waiter_name: string
        }
        Update: {
          created_at?: string
          date?: string
          items_count?: number
          orders_count?: number
          revenue?: number
          tables_count?: number
          updated_at?: string
          waiter_name?: string
        }
        Relationships: []
      }
      data_retention_log: {
        Row: {
          days_kept: number
          duration_ms: number | null
          error_message: string | null
          executed_at: string
          id: number
          idempotency_key: string
          result: Json
          status: string
          trigger_source: string
        }
        Insert: {
          days_kept: number
          duration_ms?: number | null
          error_message?: string | null
          executed_at?: string
          id?: number
          idempotency_key: string
          result?: Json
          status?: string
          trigger_source?: string
        }
        Update: {
          days_kept?: number
          duration_ms?: number | null
          error_message?: string | null
          executed_at?: string
          id?: number
          idempotency_key?: string
          result?: Json
          status?: string
          trigger_source?: string
        }
        Relationships: []
      }
      inventory_items: {
        Row: {
          aliases: string[]
          category: string
          created_at: string
          current_stock: number
          id: string
          is_active: boolean
          min_stock: number
          name: string
          product_id: string | null
          slug: string
          unit: string
          updated_at: string
        }
        Insert: {
          aliases?: string[]
          category?: string
          created_at?: string
          current_stock?: number
          id?: string
          is_active?: boolean
          min_stock?: number
          name: string
          product_id?: string | null
          slug: string
          unit?: string
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          category?: string
          created_at?: string
          current_stock?: number
          id?: string
          is_active?: boolean
          min_stock?: number
          name?: string
          product_id?: string | null
          slug?: string
          unit?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory_movements: {
        Row: {
          created_at: string
          id: string
          item_id: string
          movement_type: string
          note: string | null
          quantity: number
          source: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          movement_type: string
          note?: string | null
          quantity: number
          source?: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          movement_type?: string
          note?: string | null
          quantity?: number
          source?: string
        }
        Relationships: []
      }
      notification_log: {
        Row: {
          dedupe_key: string
          entity_id: string
          event_type: string
          id: number
          sent_at: string
        }
        Insert: {
          dedupe_key: string
          entity_id: string
          event_type: string
          id?: number
          sent_at?: string
        }
        Update: {
          dedupe_key?: string
          entity_id?: string
          event_type?: string
          id?: number
          sent_at?: string
        }
        Relationships: []
      }
      notification_queue: {
        Row: {
          consolidate_key: string
          created_at: string
          entity_id: string
          event_type: string
          id: number
          payload: Json
          processed_at: string | null
          send_after: string
        }
        Insert: {
          consolidate_key: string
          created_at?: string
          entity_id: string
          event_type: string
          id?: number
          payload?: Json
          processed_at?: string | null
          send_after?: string
        }
        Update: {
          consolidate_key?: string
          created_at?: string
          entity_id?: string
          event_type?: string
          id?: number
          payload?: Json
          processed_at?: string | null
          send_after?: string
        }
        Relationships: []
      }
      order_items: {
        Row: {
          id: string
          note: string | null
          order_id: string
          product_id: string | null
          product_name: string
          product_price: number
          quantity: number
          subtotal: number
          waiter_name: string | null
        }
        Insert: {
          id?: string
          note?: string | null
          order_id: string
          product_id?: string | null
          product_name: string
          product_price: number
          quantity?: number
          subtotal: number
          waiter_name?: string | null
        }
        Update: {
          id?: string
          note?: string | null
          order_id?: string
          product_id?: string | null
          product_name?: string
          product_price?: number
          quantity?: number
          subtotal?: number
          waiter_name?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          amount_paid: number | null
          created_at: string
          delta_items: Json | null
          id: string
          is_printed: boolean | null
          original_table_name: string | null
          payment_method: string | null
          print_claimed_at: string | null
          print_last_error: string | null
          print_status: string
          print_type: string | null
          printed_at: string | null
          served_at: string | null
          status: string
          table_name: string
          total: number | null
          updated_at: string
          version: number
          waiter_name: string | null
        }
        Insert: {
          amount_paid?: number | null
          created_at?: string
          delta_items?: Json | null
          id?: string
          is_printed?: boolean | null
          original_table_name?: string | null
          payment_method?: string | null
          print_claimed_at?: string | null
          print_last_error?: string | null
          print_status?: string
          print_type?: string | null
          printed_at?: string | null
          served_at?: string | null
          status?: string
          table_name: string
          total?: number | null
          updated_at?: string
          version?: number
          waiter_name?: string | null
        }
        Update: {
          amount_paid?: number | null
          created_at?: string
          delta_items?: Json | null
          id?: string
          is_printed?: boolean | null
          original_table_name?: string | null
          payment_method?: string | null
          print_claimed_at?: string | null
          print_last_error?: string | null
          print_status?: string
          print_type?: string | null
          printed_at?: string | null
          served_at?: string | null
          status?: string
          table_name?: string
          total?: number | null
          updated_at?: string
          version?: number
          waiter_name?: string | null
        }
        Relationships: []
      }
      pin_attempt_log: {
        Row: {
          attempted_at: string
          client_fingerprint: string
          id: number
          success: boolean
        }
        Insert: {
          attempted_at?: string
          client_fingerprint: string
          id?: number
          success: boolean
        }
        Update: {
          attempted_at?: string
          client_fingerprint?: string
          id?: number
          success?: boolean
        }
        Relationships: []
      }
      product_recipes: {
        Row: {
          created_at: string
          id: string
          ingredient_product_id: string
          product_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          ingredient_product_id: string
          product_id: string
        }
        Update: {
          created_at?: string
          id?: string
          ingredient_product_id?: string
          product_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          active: boolean
          aliases: string[]
          category: string
          created_at: string
          id: string
          name: string
          price: number
          stock_quantity: number | null
          unit: string | null
        }
        Insert: {
          active?: boolean
          aliases?: string[]
          category: string
          created_at?: string
          id?: string
          name: string
          price: number
          stock_quantity?: number | null
          unit?: string | null
        }
        Update: {
          active?: boolean
          aliases?: string[]
          category?: string
          created_at?: string
          id?: string
          name?: string
          price?: number
          stock_quantity?: number | null
          unit?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string | null
          id: string
          name: string
          pin_hash: string | null
          role: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          pin_hash?: string | null
          role: string
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          pin_hash?: string | null
          role?: string
        }
        Relationships: []
      }
      settings: {
        Row: {
          created_at: string
          id: string
          key: string
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string
          id?: string
          key: string
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string
          id?: string
          key?: string
          updated_at?: string
          value?: string
        }
        Relationships: []
      }
      stock_movements: {
        Row: {
          created_at: string | null
          id: string
          product_id: string | null
          quantity: number
          reason: string | null
          type: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_id?: string | null
          quantity: number
          reason?: string | null
          type: string
        }
        Update: {
          created_at?: string | null
          id?: string
          product_id?: string | null
          quantity?: number
          reason?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      telegram_chat_state: {
        Row: {
          chat_id: number
          data: Json
          expires_at: string
          step: string
          updated_at: string
        }
        Insert: {
          chat_id: number
          data?: Json
          expires_at?: string
          step: string
          updated_at?: string
        }
        Update: {
          chat_id?: number
          data?: Json
          expires_at?: string
          step?: string
          updated_at?: string
        }
        Relationships: []
      }
      telegram_undo_stack: {
        Row: {
          chat_id: number
          consumed_at: string | null
          created_at: string
          ops: Json
          table_name: string
          token: string
        }
        Insert: {
          chat_id: number
          consumed_at?: string | null
          created_at?: string
          ops: Json
          table_name: string
          token: string
        }
        Update: {
          chat_id?: number
          consumed_at?: string | null
          created_at?: string
          ops?: Json
          table_name?: string
          token?: string
        }
        Relationships: []
      }
      telegram_user_bindings: {
        Row: {
          bound_at: string
          telegram_user_id: number
          telegram_username: string | null
          waiter_name: string
        }
        Insert: {
          bound_at?: string
          telegram_user_id: number
          telegram_username?: string | null
          waiter_name: string
        }
        Update: {
          bound_at?: string
          telegram_user_id?: number
          telegram_username?: string | null
          waiter_name?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _require_manager_pin: { Args: { p_pin: string }; Returns: undefined }
      admin_bulk_import_inventory: {
        Args: { p_items: Json; p_pin: string }
        Returns: number
      }
      admin_bulk_set_active: {
        Args: { p_active: boolean; p_ids: string[]; p_pin: string }
        Returns: number
      }
      admin_bulk_set_price: {
        Args: { p_pin: string; p_updates: Json }
        Returns: number
      }
      admin_delete_product: {
        Args: { p_id: string; p_pin: string }
        Returns: undefined
      }
      admin_delete_recipe: {
        Args: { p_id: string; p_pin: string }
        Returns: undefined
      }
      admin_set_recipe: {
        Args: {
          p_ingredient_product_id: string
          p_pin: string
          p_product_id: string
        }
        Returns: string
      }
      admin_set_setting: {
        Args: { p_key: string; p_pin: string; p_value: string }
        Returns: undefined
      }
      admin_upsert_inventory_item: {
        Args: {
          p_aliases?: string[]
          p_category: string
          p_current_stock?: number
          p_id: string
          p_is_active?: boolean
          p_min_stock?: number
          p_name: string
          p_pin: string
          p_product_id?: string
          p_slug: string
          p_unit: string
        }
        Returns: string
      }
      admin_upsert_product: {
        Args: {
          p_active?: boolean
          p_aliases?: string[]
          p_category: string
          p_id: string
          p_name: string
          p_pin: string
          p_price: number
          p_unit?: string
        }
        Returns: string
      }
      apply_inventory_movement: {
        Args: {
          p_item_id: string
          p_note?: string
          p_quantity: number
          p_source?: string
          p_type: string
        }
        Returns: Json
      }
      archive_and_purge_old_data:
        | { Args: { p_days_keep?: number }; Returns: Json }
        | { Args: { p_days_keep?: number; p_source?: string }; Returns: Json }
      cash_close: {
        Args: { p_final_amount: number; p_pin: string; p_register_id: string }
        Returns: undefined
      }
      cash_movement_add: {
        Args: {
          p_amount: number
          p_pin: string
          p_reason?: string
          p_register_id: string
          p_type: string
        }
        Returns: string
      }
      cash_open: {
        Args: { p_initial_amount: number; p_pin: string }
        Returns: string
      }
      claim_order_print: { Args: { p_order_id: string }; Returns: boolean }
      complete_order_print: { Args: { p_order_id: string }; Returns: undefined }
      consume_undo_token: {
        Args: { p_chat_id: number; p_token: string }
        Returns: Json
      }
      create_order: {
        Args: {
          p_items: Json
          p_original_table_name?: string
          p_should_print?: boolean
          p_table_name: string
          p_total: number
          p_waiter_name: string
        }
        Returns: Json
      }
      defer_order_print: { Args: { p_order_id: string }; Returns: undefined }
      fail_order_print: {
        Args: { p_error?: string; p_order_id: string }
        Returns: undefined
      }
      find_inventory_item_by_text: {
        Args: { p_text: string }
        Returns: {
          aliases: string[]
          category: string
          created_at: string
          current_stock: number
          id: string
          is_active: boolean
          min_stock: number
          name: string
          product_id: string | null
          slug: string
          unit: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "inventory_items"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      force_clear_orphan_prints: { Args: never; Returns: Json }
      merge_table_duplicates: { Args: { p_table_name: string }; Returns: Json }
      move_order_to_table: {
        Args: { p_order_id: string; p_target_table: string }
        Returns: undefined
      }
      normalize_waiter_name: { Args: { p_name: string }; Returns: string }
      pay_order: {
        Args: {
          p_amount_paid: number
          p_order_id: string
          p_payment_method: string
          p_should_print?: boolean
        }
        Returns: undefined
      }
      preview_operational_data: { Args: never; Returns: Json }
      preview_operational_data_period: {
        Args: { p_days?: number }
        Returns: Json
      }
      recover_stuck_prints: { Args: never; Returns: Json }
      rename_order_table: {
        Args: { p_new_name: string; p_order_id: string }
        Returns: undefined
      }
      requeue_stuck_print_jobs: { Args: { p_seconds?: number }; Returns: Json }
      reset_operational_data: { Args: never; Returns: Json }
      reset_operational_data_period: {
        Args: { p_days?: number; p_reset_stock?: boolean }
        Returns: Json
      }
      toggle_product_active: {
        Args: { p_active: boolean; p_id: string }
        Returns: undefined
      }
      update_order_items: {
        Args: {
          p_delta_items?: Json
          p_expected_version?: number
          p_items: Json
          p_order_id: string
          p_print_type?: string
          p_should_print?: boolean
          p_total: number
        }
        Returns: Json
      }
      update_order_status: {
        Args: { p_order_id: string; p_status: string }
        Returns: undefined
      }
      verify_manager_pin: {
        Args: { p_fingerprint?: string; p_pin: string }
        Returns: boolean
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
