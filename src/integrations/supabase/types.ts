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
      business_hours: {
        Row: {
          closes_at: string | null
          created_at: string
          id: string
          is_closed: boolean
          opens_at: string | null
          restaurant_id: string
          weekday: number
        }
        Insert: {
          closes_at?: string | null
          created_at?: string
          id?: string
          is_closed?: boolean
          opens_at?: string | null
          restaurant_id: string
          weekday: number
        }
        Update: {
          closes_at?: string | null
          created_at?: string
          id?: string
          is_closed?: boolean
          opens_at?: string | null
          restaurant_id?: string
          weekday?: number
        }
        Relationships: [
          {
            foreignKeyName: "business_hours_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
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
      customer_addresses: {
        Row: {
          city: string | null
          complement: string | null
          created_at: string
          customer_id: string
          delivery_zone_id: string | null
          id: string
          is_default: boolean
          label: string | null
          neighborhood: string | null
          number: string | null
          reference: string | null
          street: string | null
          zip: string | null
        }
        Insert: {
          city?: string | null
          complement?: string | null
          created_at?: string
          customer_id: string
          delivery_zone_id?: string | null
          id?: string
          is_default?: boolean
          label?: string | null
          neighborhood?: string | null
          number?: string | null
          reference?: string | null
          street?: string | null
          zip?: string | null
        }
        Update: {
          city?: string | null
          complement?: string | null
          created_at?: string
          customer_id?: string
          delivery_zone_id?: string | null
          id?: string
          is_default?: boolean
          label?: string | null
          neighborhood?: string | null
          number?: string | null
          reference?: string | null
          street?: string | null
          zip?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_addresses_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          id: string
          last_order_at: string | null
          name: string | null
          phone: string
          total_orders: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          last_order_at?: string | null
          name?: string | null
          phone: string
          total_orders?: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          last_order_at?: string | null
          name?: string | null
          phone?: string
          total_orders?: number
          updated_at?: string
        }
        Relationships: []
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
      delivery_zones: {
        Row: {
          active: boolean
          created_at: string
          estimated_minutes: number
          fee: number
          id: string
          match_neighborhoods: string[]
          min_order: number
          name: string
          restaurant_id: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          estimated_minutes?: number
          fee?: number
          id?: string
          match_neighborhoods?: string[]
          min_order?: number
          name: string
          restaurant_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          estimated_minutes?: number
          fee?: number
          id?: string
          match_neighborhoods?: string[]
          min_order?: number
          name?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_zones_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      error_log: {
        Row: {
          code: string | null
          context: Json
          id: number
          message: string
          occurred_at: string
          resolved: boolean
          resolved_at: string | null
          severity: string
          source: string
        }
        Insert: {
          code?: string | null
          context?: Json
          id?: number
          message: string
          occurred_at?: string
          resolved?: boolean
          resolved_at?: string | null
          severity?: string
          source: string
        }
        Update: {
          code?: string | null
          context?: Json
          id?: number
          message?: string
          occurred_at?: string
          resolved?: boolean
          resolved_at?: string | null
          severity?: string
          source?: string
        }
        Relationships: []
      }
      error_log_daily_summary: {
        Row: {
          by_code: Json
          by_severity: Json
          by_source: Json
          generated_at: string
          summary_date: string
          top_messages: Json
          total_today: number
          total_unresolved: number
        }
        Insert: {
          by_code?: Json
          by_severity?: Json
          by_source?: Json
          generated_at?: string
          summary_date: string
          top_messages?: Json
          total_today?: number
          total_unresolved?: number
        }
        Update: {
          by_code?: Json
          by_severity?: Json
          by_source?: Json
          generated_at?: string
          summary_date?: string
          top_messages?: Json
          total_today?: number
          total_unresolved?: number
        }
        Relationships: []
      }
      loyalty_accounts: {
        Row: {
          balance: number
          created_at: string
          last_customer_name: string | null
          phone: string
          total_earned: number
          updated_at: string
        }
        Insert: {
          balance?: number
          created_at?: string
          last_customer_name?: string | null
          phone: string
          total_earned?: number
          updated_at?: string
        }
        Update: {
          balance?: number
          created_at?: string
          last_customer_name?: string | null
          phone?: string
          total_earned?: number
          updated_at?: string
        }
        Relationships: []
      }
      loyalty_rewards: {
        Row: {
          active: boolean
          created_at: string
          display_name: string
          id: string
          min_order_subtotal: number
          points_cost: number
          product_id: string | null
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_name: string
          id?: string
          min_order_subtotal?: number
          points_cost: number
          product_id?: string | null
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_name?: string
          id?: string
          min_order_subtotal?: number
          points_cost?: number
          product_id?: string | null
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_rewards_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_rewards_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      loyalty_transactions: {
        Row: {
          admin_note: string | null
          created_at: string
          id: string
          kind: string
          order_id: string | null
          phone: string
          points: number
          reward_id: string | null
        }
        Insert: {
          admin_note?: string | null
          created_at?: string
          id?: string
          kind: string
          order_id?: string | null
          phone: string
          points: number
          reward_id?: string | null
        }
        Update: {
          admin_note?: string | null
          created_at?: string
          id?: string
          kind?: string
          order_id?: string | null
          phone?: string
          points?: number
          reward_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_transactions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loyalty_transactions_phone_fkey"
            columns: ["phone"]
            isOneToOne: false
            referencedRelation: "loyalty_accounts"
            referencedColumns: ["phone"]
          },
          {
            foreignKeyName: "loyalty_transactions_reward_id_fkey"
            columns: ["reward_id"]
            isOneToOne: false
            referencedRelation: "loyalty_rewards"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          active: boolean
          created_at: string
          display_order: number
          id: string
          name: string
          restaurant_id: string
          slug: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          display_order?: number
          id?: string
          name: string
          restaurant_id: string
          slug: string
        }
        Update: {
          active?: boolean
          created_at?: string
          display_order?: number
          id?: string
          name?: string
          restaurant_id?: string
          slug?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
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
      order_status_history: {
        Row: {
          changed_at: string
          changed_by: string | null
          from_status: string | null
          id: number
          note: string | null
          order_id: string
          to_status: string
        }
        Insert: {
          changed_at?: string
          changed_by?: string | null
          from_status?: string | null
          id?: number
          note?: string | null
          order_id: string
          to_status: string
        }
        Update: {
          changed_at?: string
          changed_by?: string | null
          from_status?: string | null
          id?: number
          note?: string | null
          order_id?: string
          to_status?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          amount_paid: number | null
          approved_at: string | null
          approved_by: string | null
          change_for: number | null
          channel: string
          created_at: string
          customer_id: string | null
          customer_name_snapshot: string | null
          customer_phone_snapshot: string | null
          delivery_address: Json | null
          delivery_fee: number
          delta_items: Json | null
          estimated_ready_at: string | null
          id: string
          is_printed: boolean | null
          original_table_name: string | null
          payment_method: string | null
          print_claimed_at: string | null
          print_last_error: string | null
          print_status: string
          print_type: string | null
          printed_at: string | null
          public_token: string | null
          rejected_reason: string | null
          served_at: string | null
          service_type: string
          status: string
          table_name: string
          total: number | null
          updated_at: string
          version: number
          waiter_name: string | null
        }
        Insert: {
          amount_paid?: number | null
          approved_at?: string | null
          approved_by?: string | null
          change_for?: number | null
          channel?: string
          created_at?: string
          customer_id?: string | null
          customer_name_snapshot?: string | null
          customer_phone_snapshot?: string | null
          delivery_address?: Json | null
          delivery_fee?: number
          delta_items?: Json | null
          estimated_ready_at?: string | null
          id?: string
          is_printed?: boolean | null
          original_table_name?: string | null
          payment_method?: string | null
          print_claimed_at?: string | null
          print_last_error?: string | null
          print_status?: string
          print_type?: string | null
          printed_at?: string | null
          public_token?: string | null
          rejected_reason?: string | null
          served_at?: string | null
          service_type?: string
          status?: string
          table_name: string
          total?: number | null
          updated_at?: string
          version?: number
          waiter_name?: string | null
        }
        Update: {
          amount_paid?: number | null
          approved_at?: string | null
          approved_by?: string | null
          change_for?: number | null
          channel?: string
          created_at?: string
          customer_id?: string | null
          customer_name_snapshot?: string | null
          customer_phone_snapshot?: string | null
          delivery_address?: Json | null
          delivery_fee?: number
          delta_items?: Json | null
          estimated_ready_at?: string | null
          id?: string
          is_printed?: boolean | null
          original_table_name?: string | null
          payment_method?: string | null
          print_claimed_at?: string | null
          print_last_error?: string | null
          print_status?: string
          print_type?: string | null
          printed_at?: string | null
          public_token?: string | null
          rejected_reason?: string | null
          served_at?: string | null
          service_type?: string
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
      print_jobs: {
        Row: {
          attempts: number
          claimed_at: string | null
          created_at: string
          id: string
          job_type: string
          last_error: string | null
          order_id: string
          payload: Json | null
          printed_at: string | null
          status: string
          updated_at: string
        }
        Insert: {
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          id?: string
          job_type: string
          last_error?: string | null
          order_id: string
          payload?: Json | null
          printed_at?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          attempts?: number
          claimed_at?: string | null
          created_at?: string
          id?: string
          job_type?: string
          last_error?: string | null
          order_id?: string
          payload?: Json | null
          printed_at?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "print_jobs_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active: boolean
          aliases: string[]
          category: string
          created_at: string
          description: string | null
          display_order: number
          id: string
          image_url: string | null
          is_available_online: boolean
          is_featured: boolean
          is_sold_out: boolean
          is_sold_out_online: boolean
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
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_available_online?: boolean
          is_featured?: boolean
          is_sold_out?: boolean
          is_sold_out_online?: boolean
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
          description?: string | null
          display_order?: number
          id?: string
          image_url?: string | null
          is_available_online?: boolean
          is_featured?: boolean
          is_sold_out?: boolean
          is_sold_out_online?: boolean
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
      public_menu_settings: {
        Row: {
          accent_color: string
          background_color: string | null
          banner_url: string | null
          button_style: string
          card_style: string
          categories_section_title: string
          category_order: string[]
          category_overrides: Json
          created_at: string
          featured_style: string
          hero_alignment: string
          hero_subtitle: string | null
          hero_title: string | null
          hidden_category_slugs: string[]
          image_aspect: string
          layout_mode: string
          muted_text_color: string | null
          radius_scale: string
          restaurant_id: string
          section_order: string[]
          show_categories_section_title: boolean
          show_category_nav: boolean
          show_descriptions: boolean
          show_featured_section: boolean
          show_hero_banner_overlay: boolean
          show_logo: boolean
          show_open_status_badge: boolean
          show_product_images: boolean
          show_search_bar: boolean
          show_welcome_message_card: boolean
          show_whatsapp_fab: boolean
          surface_color: string | null
          text_color: string | null
          updated_at: string
          welcome_message: string | null
        }
        Insert: {
          accent_color?: string
          background_color?: string | null
          banner_url?: string | null
          button_style?: string
          card_style?: string
          categories_section_title?: string
          category_order?: string[]
          category_overrides?: Json
          created_at?: string
          featured_style?: string
          hero_alignment?: string
          hero_subtitle?: string | null
          hero_title?: string | null
          hidden_category_slugs?: string[]
          image_aspect?: string
          layout_mode?: string
          muted_text_color?: string | null
          radius_scale?: string
          restaurant_id: string
          section_order?: string[]
          show_categories_section_title?: boolean
          show_category_nav?: boolean
          show_descriptions?: boolean
          show_featured_section?: boolean
          show_hero_banner_overlay?: boolean
          show_logo?: boolean
          show_open_status_badge?: boolean
          show_product_images?: boolean
          show_search_bar?: boolean
          show_welcome_message_card?: boolean
          show_whatsapp_fab?: boolean
          surface_color?: string | null
          text_color?: string | null
          updated_at?: string
          welcome_message?: string | null
        }
        Update: {
          accent_color?: string
          background_color?: string | null
          banner_url?: string | null
          button_style?: string
          card_style?: string
          categories_section_title?: string
          category_order?: string[]
          category_overrides?: Json
          created_at?: string
          featured_style?: string
          hero_alignment?: string
          hero_subtitle?: string | null
          hero_title?: string | null
          hidden_category_slugs?: string[]
          image_aspect?: string
          layout_mode?: string
          muted_text_color?: string | null
          radius_scale?: string
          restaurant_id?: string
          section_order?: string[]
          show_categories_section_title?: boolean
          show_category_nav?: boolean
          show_descriptions?: boolean
          show_featured_section?: boolean
          show_hero_banner_overlay?: boolean
          show_logo?: boolean
          show_open_status_badge?: boolean
          show_product_images?: boolean
          show_search_bar?: boolean
          show_welcome_message_card?: boolean
          show_whatsapp_fab?: boolean
          surface_color?: string | null
          text_color?: string | null
          updated_at?: string
          welcome_message?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "public_menu_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          created_at: string
          default_prep_minutes: number
          delivery_prep_buffer: number
          description: string | null
          hero_url: string | null
          id: string
          is_open_override: string
          logo_url: string | null
          name: string
          pix_key: string | null
          slug: string
          updated_at: string
          whatsapp_phone: string | null
        }
        Insert: {
          created_at?: string
          default_prep_minutes?: number
          delivery_prep_buffer?: number
          description?: string | null
          hero_url?: string | null
          id?: string
          is_open_override?: string
          logo_url?: string | null
          name: string
          pix_key?: string | null
          slug: string
          updated_at?: string
          whatsapp_phone?: string | null
        }
        Update: {
          created_at?: string
          default_prep_minutes?: number
          delivery_prep_buffer?: number
          description?: string | null
          hero_url?: string | null
          id?: string
          is_open_override?: string
          logo_url?: string | null
          name?: string
          pix_key?: string | null
          slug?: string
          updated_at?: string
          whatsapp_phone?: string | null
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
      _loyalty_setting_bool: {
        Args: { p_default: boolean; p_key: string }
        Returns: boolean
      }
      _loyalty_setting_numeric: {
        Args: { p_default: number; p_key: string }
        Returns: number
      }
      _require_manager_pin: { Args: { p_pin: string }; Returns: undefined }
      admin_bulk_set_active: {
        Args: { p_active: boolean; p_ids: string[]; p_pin: string }
        Returns: number
      }
      admin_bulk_set_price: {
        Args: { p_pin: string; p_updates: Json }
        Returns: number
      }
      admin_delete_delivery_zone: { Args: { p_id: string }; Returns: undefined }
      admin_delete_product: {
        Args: { p_id: string; p_pin: string }
        Returns: undefined
      }
      admin_edit_online_order_item: {
        Args: { p_item_id: string; p_new_quantity: number; p_order_id: string }
        Returns: Json
      }
      admin_loyalty_adjust: {
        Args: { p_note: string; p_phone: string; p_points: number }
        Returns: Json
      }
      admin_loyalty_delete_reward: {
        Args: { p_id: string }
        Returns: undefined
      }
      admin_loyalty_list_rewards: {
        Args: { p_restaurant_id: string }
        Returns: Json
      }
      admin_loyalty_search_customer: {
        Args: { p_phone: string }
        Returns: Json
      }
      admin_loyalty_seed_default_rewards: { Args: never; Returns: Json }
      admin_loyalty_set_enabled: {
        Args: { p_enabled: boolean }
        Returns: undefined
      }
      admin_loyalty_top_customers: { Args: { p_limit?: number }; Returns: Json }
      admin_loyalty_upsert_reward: {
        Args: {
          p_active: boolean
          p_display_name: string
          p_id: string
          p_min_order_subtotal: number
          p_points_cost: number
          p_product_id?: string
          p_restaurant_id: string
          p_sort_order: number
        }
        Returns: string
      }
      admin_reorder_products: {
        Args: { p_ids: string[]; p_orders: number[] }
        Returns: undefined
      }
      admin_set_setting: {
        Args: { p_key: string; p_pin: string; p_value: string }
        Returns: undefined
      }
      admin_toggle_product_featured: {
        Args: { p_is_featured: boolean; p_product_id: string }
        Returns: undefined
      }
      admin_update_product_online:
        | {
            Args: {
              p_description?: string
              p_display_order?: number
              p_id: string
              p_image_url?: string
              p_is_available_online?: boolean
              p_is_featured?: boolean
              p_is_sold_out?: boolean
            }
            Returns: undefined
          }
        | {
            Args: {
              p_clear_description?: boolean
              p_clear_image_url?: boolean
              p_description?: string
              p_display_order?: number
              p_id: string
              p_image_url?: string
              p_is_available_online?: boolean
              p_is_featured?: boolean
              p_is_sold_out?: boolean
            }
            Returns: undefined
          }
        | {
            Args: {
              p_clear_description?: boolean
              p_clear_image_url?: boolean
              p_description?: string
              p_display_order?: number
              p_id: string
              p_image_url?: string
              p_is_available_online?: boolean
              p_is_featured?: boolean
              p_is_sold_out?: boolean
              p_is_sold_out_online?: boolean
            }
            Returns: undefined
          }
      admin_update_public_menu_settings:
        | {
            Args: {
              p_accent_color?: string
              p_banner_url?: string
              p_category_order?: string[]
              p_clear_banner_url?: boolean
              p_clear_welcome_message?: boolean
              p_featured_style?: string
              p_hidden_category_slugs?: string[]
              p_image_aspect?: string
              p_layout_mode?: string
              p_restaurant_id: string
              p_show_descriptions?: boolean
              p_show_product_images?: boolean
              p_welcome_message?: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_accent_color?: string
              p_background_color?: string
              p_banner_url?: string
              p_button_style?: string
              p_card_style?: string
              p_categories_section_title?: string
              p_category_order?: string[]
              p_clear_background_color?: boolean
              p_clear_banner_url?: boolean
              p_clear_hero_subtitle?: boolean
              p_clear_hero_title?: boolean
              p_clear_muted_text_color?: boolean
              p_clear_surface_color?: boolean
              p_clear_text_color?: boolean
              p_clear_welcome_message?: boolean
              p_featured_style?: string
              p_hero_alignment?: string
              p_hero_subtitle?: string
              p_hero_title?: string
              p_hidden_category_slugs?: string[]
              p_image_aspect?: string
              p_layout_mode?: string
              p_muted_text_color?: string
              p_radius_scale?: string
              p_restaurant_id: string
              p_section_order?: string[]
              p_show_categories_section_title?: boolean
              p_show_category_nav?: boolean
              p_show_descriptions?: boolean
              p_show_featured_section?: boolean
              p_show_hero_banner_overlay?: boolean
              p_show_logo?: boolean
              p_show_open_status_badge?: boolean
              p_show_product_images?: boolean
              p_show_search_bar?: boolean
              p_show_welcome_message_card?: boolean
              p_show_whatsapp_fab?: boolean
              p_surface_color?: string
              p_text_color?: string
              p_welcome_message?: string
            }
            Returns: undefined
          }
        | {
            Args: {
              p_accent_color?: string
              p_background_color?: string
              p_banner_url?: string
              p_button_style?: string
              p_card_style?: string
              p_categories_section_title?: string
              p_category_order?: string[]
              p_category_overrides?: Json
              p_clear_background_color?: boolean
              p_clear_banner_url?: boolean
              p_clear_hero_subtitle?: boolean
              p_clear_hero_title?: boolean
              p_clear_muted_text_color?: boolean
              p_clear_surface_color?: boolean
              p_clear_text_color?: boolean
              p_clear_welcome_message?: boolean
              p_featured_style?: string
              p_hero_alignment?: string
              p_hero_subtitle?: string
              p_hero_title?: string
              p_hidden_category_slugs?: string[]
              p_image_aspect?: string
              p_layout_mode?: string
              p_muted_text_color?: string
              p_radius_scale?: string
              p_restaurant_id: string
              p_section_order?: string[]
              p_show_categories_section_title?: boolean
              p_show_category_nav?: boolean
              p_show_descriptions?: boolean
              p_show_featured_section?: boolean
              p_show_hero_banner_overlay?: boolean
              p_show_logo?: boolean
              p_show_open_status_badge?: boolean
              p_show_product_images?: boolean
              p_show_search_bar?: boolean
              p_show_welcome_message_card?: boolean
              p_show_whatsapp_fab?: boolean
              p_surface_color?: string
              p_text_color?: string
              p_welcome_message?: string
            }
            Returns: undefined
          }
      admin_update_restaurant: {
        Args: {
          p_default_prep_minutes?: number
          p_delivery_prep_buffer?: number
          p_description?: string
          p_hero_url?: string
          p_id: string
          p_is_open_override?: string
          p_logo_url?: string
          p_name?: string
          p_pix_key?: string
          p_whatsapp_phone?: string
        }
        Returns: undefined
      }
      admin_update_restaurant_slug: {
        Args: { p_new_slug: string; p_restaurant_id: string }
        Returns: undefined
      }
      admin_upsert_business_hours: {
        Args: { p_hours: Json; p_restaurant_id: string }
        Returns: undefined
      }
      admin_upsert_delivery_zone: {
        Args: {
          p_active: boolean
          p_estimated_minutes: number
          p_fee: number
          p_id: string
          p_match_neighborhoods: string[]
          p_min_order: number
          p_name: string
          p_restaurant_id: string
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
      annotate_error_log_resolution: {
        Args: { p_code?: string; p_ids?: number[]; p_reason?: string }
        Returns: number
      }
      approve_online_order: {
        Args: { p_approver: string; p_order_id: string }
        Returns: undefined
      }
      archive_and_purge_old_data:
        | { Args: { p_days_keep?: number }; Returns: Json }
        | { Args: { p_days_keep?: number; p_source?: string }; Returns: Json }
      build_error_log_daily_summary: {
        Args: { p_date?: string }
        Returns: Json
      }
      calculate_delivery_fee: {
        Args: { p_neighborhood: string; p_restaurant_id: string }
        Returns: Json
      }
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
      claim_print_job: {
        Args: never
        Returns: {
          attempts: number
          created_at: string
          id: string
          job_type: string
          order_id: string
          payload: Json
        }[]
      }
      complete_order_print: { Args: { p_order_id: string }; Returns: undefined }
      complete_print_job: { Args: { p_id: string }; Returns: undefined }
      consume_undo_token: {
        Args: { p_chat_id: number; p_token: string }
        Returns: Json
      }
      count_public_order_funcs: {
        Args: never
        Returns: {
          n: number
        }[]
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
      create_public_order:
        | {
            Args: {
              p_address: Json
              p_change_for: number
              p_client_request_id: string
              p_customer_name: string
              p_customer_phone: string
              p_items: Json
              p_note: string
              p_payment_method: string
              p_restaurant_slug: string
              p_service_type: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_address: Json
              p_change_for: number
              p_client_request_id: string
              p_customer_name: string
              p_customer_phone: string
              p_items: Json
              p_loyalty_reward_id?: string
              p_note: string
              p_payment_method: string
              p_restaurant_slug: string
              p_service_type: string
            }
            Returns: Json
          }
      defer_order_print: { Args: { p_order_id: string }; Returns: undefined }
      enqueue_print_job: {
        Args: { p_job_type: string; p_order_id: string; p_payload?: Json }
        Returns: string
      }
      fail_order_print: {
        Args: { p_error?: string; p_order_id: string }
        Returns: undefined
      }
      fail_print_job: {
        Args: { p_error?: string; p_id: string; p_max_attempts?: number }
        Returns: undefined
      }
      fix_create_public_order_duplicate: { Args: never; Returns: string }
      force_clear_orphan_prints: { Args: never; Returns: Json }
      get_customer_orders: { Args: { p_phone: string }; Returns: Json }
      get_or_create_customer: {
        Args: { p_name: string; p_phone: string }
        Returns: string
      }
      get_public_loyalty_status:
        | {
            Args: {
              p_order_subtotal?: number
              p_phone: string
              p_restaurant_slug: string
            }
            Returns: Json
          }
        | {
            Args: {
              p_order_subtotal?: number
              p_phone: string
              p_restaurant_slug: string
              p_service_type?: string
            }
            Returns: Json
          }
      get_public_order_status: {
        Args: { p_order_id: string; p_token: string }
        Returns: Json
      }
      is_restaurant_open: {
        Args: { p_restaurant_id: string }
        Returns: boolean
      }
      merge_table_duplicates: { Args: { p_table_name: string }; Returns: Json }
      move_order_to_table: {
        Args: { p_order_id: string; p_target_table: string }
        Returns: undefined
      }
      normalize_phone: { Args: { p_phone: string }; Returns: string }
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
      reject_online_order: {
        Args: { p_approver: string; p_order_id: string; p_reason: string }
        Returns: undefined
      }
      rename_order_table: {
        Args: { p_new_name: string; p_order_id: string }
        Returns: undefined
      }
      requeue_stuck_print_jobs: { Args: { p_seconds?: number }; Returns: Json }
      requeue_stuck_print_jobs_v2: {
        Args: { p_seconds?: number }
        Returns: Json
      }
      reset_operational_data: { Args: never; Returns: Json }
      reset_operational_data_period: {
        Args: { p_days?: number }
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
      verify_rpc_consistency: { Args: never; Returns: Json }
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
