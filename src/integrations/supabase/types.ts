export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      menu_items: {
        Row: {
          category: Database["public"]["Enums"]["menu_category"];
          created_at: string;
          description: string | null;
          id: string;
          is_available: boolean;
          name: string;
          photo_url: string | null;
          prep_minutes: number;
          price: number;
          restaurant_id: string;
          search_text: string | null;
          sort_order: number;
          updated_at: string;
        };
        Insert: {
          category?: Database["public"]["Enums"]["menu_category"];
          created_at?: string;
          description?: string | null;
          id?: string;
          is_available?: boolean;
          name: string;
          photo_url?: string | null;
          prep_minutes?: number;
          price: number;
          restaurant_id: string;
          sort_order?: number;
          updated_at?: string;
        };
        Update: {
          category?: Database["public"]["Enums"]["menu_category"];
          created_at?: string;
          description?: string | null;
          id?: string;
          is_available?: boolean;
          name?: string;
          photo_url?: string | null;
          prep_minutes?: number;
          price?: number;
          restaurant_id?: string;
          sort_order?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "menu_items_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "restaurants";
            referencedColumns: ["id"];
          },
        ];
      };
      order_events: {
        Row: {
          actor_id: string | null;
          created_at: string;
          id: string;
          note: string | null;
          order_id: string;
          status: Database["public"]["Enums"]["order_status"];
        };
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          order_id: string;
          status: Database["public"]["Enums"]["order_status"];
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          note?: string | null;
          order_id?: string;
          status?: Database["public"]["Enums"]["order_status"];
        };
        Relationships: [
          {
            foreignKeyName: "order_events_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      order_items: {
        Row: {
          id: string;
          line_total: number;
          menu_item_id: string | null;
          name: string;
          order_id: string;
          prep_minutes: number;
          qty: number;
          unit_price: number;
        };
        Insert: {
          id?: string;
          menu_item_id?: string | null;
          name: string;
          order_id: string;
          prep_minutes?: number;
          qty: number;
          unit_price: number;
        };
        Update: {
          id?: string;
          menu_item_id?: string | null;
          name?: string;
          order_id?: string;
          prep_minutes?: number;
          qty?: number;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "order_items_menu_item_id_fkey";
            columns: ["menu_item_id"];
            isOneToOne: false;
            referencedRelation: "menu_items";
            referencedColumns: ["id"];
          },
        ];
      };
      order_pings: {
        Row: {
          created_at: string;
          distance_km: number | null;
          eta_minutes: number | null;
          id: string;
          lat: number;
          lng: number;
          order_id: string;
        };
        Insert: {
          created_at?: string;
          distance_km?: number | null;
          eta_minutes?: number | null;
          id?: string;
          lat: number;
          lng: number;
          order_id: string;
        };
        Update: {
          created_at?: string;
          distance_km?: number | null;
          eta_minutes?: number | null;
          id?: string;
          lat?: number;
          lng?: number;
          order_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "order_pings_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      orders: {
        Row: {
          accepted_at: string | null;
          arrival_minutes: number;
          arrival_mode: string;
          cancel_reason: string | null;
          cancelled_at: string | null;
          code: string;
          completed_at: string | null;
          created_at: string;
          customer_id: string;
          customer_lat: number | null;
          customer_lng: number | null;
          customer_phone: string | null;
          expected_arrival_at: string;
          id: string;
          note: string | null;
          prep_minutes: number;
          preparing_at: string | null;
          ready_at: string | null;
          restaurant_id: string;
          status: Database["public"]["Enums"]["order_status"];
          subtotal: number;
          total: number;
          updated_at: string;
        };
        Insert: {
          arrival_minutes?: number;
          arrival_mode?: string;
          code?: string;
          customer_id: string;
          customer_lat?: number | null;
          customer_lng?: number | null;
          customer_phone?: string | null;
          expected_arrival_at?: string;
          id?: string;
          note?: string | null;
          restaurant_id: string;
          status?: Database["public"]["Enums"]["order_status"];
        };
        Update: {
          arrival_minutes?: number;
          arrival_mode?: string;
          cancel_reason?: string | null;
          customer_lat?: number | null;
          customer_lng?: number | null;
          customer_phone?: string | null;
          expected_arrival_at?: string;
          note?: string | null;
          status?: Database["public"]["Enums"]["order_status"];
        };
        Relationships: [
          {
            foreignKeyName: "orders_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "restaurants";
            referencedColumns: ["id"];
          },
        ];
      };
      platform_settings: {
        Row: {
          currency: string;
          id: boolean;
          payment_instructions: string | null;
          registration_fee_tzs: number;
          till_number: string | null;
          updated_at: string;
        };
        Insert: {
          currency?: string;
          id?: boolean;
          payment_instructions?: string | null;
          registration_fee_tzs?: number;
          till_number?: string | null;
          updated_at?: string;
        };
        Update: {
          currency?: string;
          payment_instructions?: string | null;
          registration_fee_tzs?: number;
          till_number?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          full_name: string;
          id: string;
          is_suspended: boolean;
          phone: string | null;
          role: Database["public"]["Enums"]["app_role"];
          town: string | null;
          updated_at: string;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          full_name: string;
          id: string;
          is_suspended?: boolean;
          phone?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          town?: string | null;
          updated_at?: string;
        };
        Update: {
          avatar_url?: string | null;
          full_name?: string;
          is_suspended?: boolean;
          phone?: string | null;
          role?: Database["public"]["Enums"]["app_role"];
          town?: string | null;
          updated_at?: string;
        };
        Relationships: [];
      };
      registration_payments: {
        Row: {
          amount: number;
          confirmed_at: string | null;
          confirmed_by: string | null;
          created_at: string;
          currency: string;
          id: string;
          method: Database["public"]["Enums"]["payment_method"];
          msisdn: string | null;
          note: string | null;
          provider_payload: Json | null;
          reference: string | null;
          restaurant_id: string;
          status: Database["public"]["Enums"]["payment_status"];
          submitted_at: string | null;
          updated_at: string;
        };
        Insert: {
          amount?: number;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          currency?: string;
          id?: string;
          method?: Database["public"]["Enums"]["payment_method"];
          msisdn?: string | null;
          note?: string | null;
          provider_payload?: Json | null;
          reference?: string | null;
          restaurant_id: string;
          status?: Database["public"]["Enums"]["payment_status"];
          submitted_at?: string | null;
        };
        Update: {
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          method?: Database["public"]["Enums"]["payment_method"];
          msisdn?: string | null;
          note?: string | null;
          provider_payload?: Json | null;
          reference?: string | null;
          status?: Database["public"]["Enums"]["payment_status"];
          submitted_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "registration_payments_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "restaurants";
            referencedColumns: ["id"];
          },
        ];
      };
      restaurant_hours: {
        Row: {
          closes_at: string;
          day_of_week: number;
          id: string;
          is_closed: boolean;
          opens_at: string;
          restaurant_id: string;
        };
        Insert: {
          closes_at?: string;
          day_of_week: number;
          id?: string;
          is_closed?: boolean;
          opens_at?: string;
          restaurant_id: string;
        };
        Update: {
          closes_at?: string;
          day_of_week?: number;
          is_closed?: boolean;
          opens_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "restaurant_hours_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "restaurants";
            referencedColumns: ["id"];
          },
        ];
      };
      restaurants: {
        Row: {
          address: string;
          avg_prep_minutes: number;
          cover_url: string | null;
          created_at: string;
          description: string | null;
          id: string;
          is_accepting_orders: boolean;
          kitchen_capacity: number;
          lat: number;
          lng: number;
          logo_url: string | null;
          name: string;
          owner_id: string;
          phone: string | null;
          rating: number;
          rating_count: number;
          slug: string;
          status: Database["public"]["Enums"]["restaurant_status"];
          suspended_reason: string | null;
          town: string;
          updated_at: string;
        };
        Insert: {
          address: string;
          avg_prep_minutes?: number;
          cover_url?: string | null;
          description?: string | null;
          id?: string;
          is_accepting_orders?: boolean;
          kitchen_capacity?: number;
          lat: number;
          lng: number;
          logo_url?: string | null;
          name: string;
          owner_id: string;
          phone?: string | null;
          slug: string;
          status?: Database["public"]["Enums"]["restaurant_status"];
          town: string;
        };
        Update: {
          address?: string;
          avg_prep_minutes?: number;
          cover_url?: string | null;
          description?: string | null;
          is_accepting_orders?: boolean;
          kitchen_capacity?: number;
          lat?: number;
          lng?: number;
          logo_url?: string | null;
          name?: string;
          phone?: string | null;
          status?: Database["public"]["Enums"]["restaurant_status"];
          suspended_reason?: string | null;
          town?: string;
        };
        Relationships: [];
      };
      reviews: {
        Row: {
          comment: string | null;
          created_at: string;
          customer_id: string;
          id: string;
          order_id: string;
          restaurant_id: string;
          stars: number;
          was_ready_on_time: boolean | null;
        };
        Insert: {
          comment?: string | null;
          created_at?: string;
          customer_id: string;
          id?: string;
          order_id: string;
          restaurant_id: string;
          stars: number;
          was_ready_on_time?: boolean | null;
        };
        Update: {
          comment?: string | null;
          stars?: number;
          was_ready_on_time?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: true;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_restaurant_id_fkey";
            columns: ["restaurant_id"];
            isOneToOne: false;
            referencedRelation: "restaurants";
            referencedColumns: ["id"];
          },
        ];
      };
      user_roles: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role: Database["public"]["Enums"]["app_role"];
          user_id: string;
        };
        Update: {
          role?: Database["public"]["Enums"]["app_role"];
          user_id?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      active_towns: {
        Args: Record<PropertyKey, never>;
        Returns: {
          town: string;
          restaurant_count: number;
        }[];
      };
      gen_order_code: {
        Args: Record<PropertyKey, never>;
        Returns: string;
      };
      has_role: {
        Args: { _user_id: string; _role: Database["public"]["Enums"]["app_role"] };
        Returns: boolean;
      };
      haversine_km: {
        Args: { lat1: number; lng1: number; lat2: number; lng2: number };
        Returns: number;
      };
      bootstrap_available: {
        Args: Record<PropertyKey, never>;
        Returns: boolean;
      };
      bootstrap_admin: {
        Args: Record<PropertyKey, never>;
        /** The claimed email, or an error: BOOTSTRAP_CLOSED / _NOT_ELIGIBLE. */
        Returns: string;
      };
      check_kitchen_slot: {
        Args: { _restaurant: string; _prep_minutes: number; _arrival_minutes: number };
        Returns: {
          available: boolean;
          capacity: number;
          busy: number;
          /** Minutes from now, not a timestamp — the unit the customer picked. */
          suggested_minutes: number | null;
        }[];
      };
      is_restaurant_open: {
        Args: { _restaurant_id: string; _at?: string };
        Returns: boolean;
      };
      registration_fee_tzs: {
        Args: Record<PropertyKey, never>;
        Returns: number;
      };
      restaurant_reviews: {
        Args: { _restaurant_id: string; _limit?: number };
        Returns: {
          id: string;
          stars: number;
          comment: string | null;
          was_ready_on_time: boolean | null;
          created_at: string;
          reviewer_first_name: string | null;
        }[];
      };
      restaurants_nearby: {
        Args: {
          _lat?: number | null;
          _lng?: number | null;
          _town?: string | null;
          _max_km?: number | null;
          _open_only?: boolean;
          _limit?: number;
        };
        Returns: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          town: string;
          address: string;
          lat: number;
          lng: number;
          logo_url: string | null;
          cover_url: string | null;
          rating: number;
          rating_count: number;
          avg_prep_minutes: number;
          is_accepting_orders: boolean;
          is_open: boolean;
          distance_km: number | null;
          dish_count: number;
          min_price: number | null;
        }[];
      };
      search_dishes: {
        Args: {
          _q?: string | null;
          _lat?: number | null;
          _lng?: number | null;
          _town?: string | null;
          _category?: Database["public"]["Enums"]["menu_category"] | null;
          _max_km?: number | null;
          _max_price?: number | null;
          _open_only?: boolean;
          _available_only?: boolean;
          _sort?: string;
          _limit?: number;
        };
        Returns: {
          item_id: string;
          item_name: string;
          description: string | null;
          price: number;
          category: Database["public"]["Enums"]["menu_category"];
          photo_url: string | null;
          prep_minutes: number;
          is_available: boolean;
          restaurant_id: string;
          restaurant_name: string;
          slug: string;
          town: string;
          address: string;
          lat: number;
          lng: number;
          logo_url: string | null;
          rating: number;
          rating_count: number;
          is_accepting_orders: boolean;
          is_open: boolean;
          distance_km: number | null;
          is_fuzzy_match: boolean;
        }[];
      };
      admin_summary: {
        Args: Record<PropertyKey, never>;
        Returns: {
          total_users: number;
          total_restaurants: number;
          active_restaurants: number;
          awaiting_payment: number;
          payments_to_verify: number;
          total_orders: number;
          live_orders: number;
          completed_orders: number;
          fee_revenue: number;
          order_volume: number;
        }[];
      };
      vendor_summary: {
        Args: { _restaurant_id: string; _days?: number };
        Returns: {
          orders_total: number;
          orders_completed: number;
          orders_cancelled: number;
          takings: number;
          average_order: number;
          ready_on_time_pct: number | null;
          median_prep_minutes: number | null;
          rating: number;
          rating_count: number;
        }[];
      };
      vendor_daily: {
        Args: { _restaurant_id: string; _days?: number };
        Returns: { day: string; orders: number; takings: number }[];
      };
      vendor_top_dishes: {
        Args: { _restaurant_id: string; _days?: number; _limit?: number };
        Returns: { name: string; qty: number; takings: number }[];
      };
      vendor_busiest_hours: {
        Args: { _restaurant_id: string; _days?: number };
        Returns: { hour: number; orders: number }[];
      };
      suggest_dish: {
        Args: { _q: string };
        Returns: string | null;
      };
    };
    Enums: {
      app_role: "customer" | "restaurant" | "admin";
      menu_category:
        "local" | "grills" | "fast_food" | "breakfast" | "snacks" | "drinks" | "desserts";
      order_status: "pending" | "accepted" | "preparing" | "ready" | "completed" | "cancelled";
      payment_method: "mpesa" | "tigopesa" | "airtel" | "halopesa" | "bank" | "cash" | "manual";
      payment_status: "pending" | "submitted" | "confirmed" | "failed";
      restaurant_status: "pending_payment" | "active" | "suspended" | "rejected";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      app_role: ["customer", "restaurant", "admin"],
      menu_category: ["local", "grills", "fast_food", "breakfast", "snacks", "drinks", "desserts"],
      order_status: ["pending", "accepted", "preparing", "ready", "completed", "cancelled"],
      payment_method: ["mpesa", "tigopesa", "airtel", "halopesa", "bank", "cash", "manual"],
      payment_status: ["pending", "submitted", "confirmed", "failed"],
      restaurant_status: ["pending_payment", "active", "suspended", "rejected"],
    },
  },
} as const;
