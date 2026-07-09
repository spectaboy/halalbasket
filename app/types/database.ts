// HalalBasket database types — mirrors supabase/migrations/20260708000000_initial_schema.sql

export type UserRole = 'customer' | 'seller' | 'driver' | 'admin';
export type SellerType = 'restaurant' | 'butcher' | 'home_cook';
export type VerificationStatus = 'pending' | 'approved' | 'rejected';
export type FoodCategoryTier = 'low_risk' | 'high_risk';
export type PermitStatus = 'none' | 'course_done' | 'permit_applied' | 'inspection_scheduled' | 'approved';
export type WindowStatus = 'open' | 'confirmed' | 'cancelled' | 'completed';
export type PaymentStatus = 'pending' | 'captured' | 'refunded' | 'failed';
export type PayoutStatus = 'pending' | 'completed' | 'failed' | 'not_applicable';

export type OrderStatus =
  | 'pending_payment'
  | 'paid'
  | 'accepted'
  | 'preparing'
  | 'ready'
  | 'driver_assigned'
  | 'picked_up'
  | 'en_route'
  | 'delivered'
  | 'cancelled'
  | 'refunded';

export type UserRow = {
  id: string;
  clerk_id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
  role: UserRole;
  is_admin: boolean;
  avatar_url: string | null;
  default_address: string | null;
  default_location: unknown | null; // PostGIS point (WKB/WKT/GeoJSON) — parse via utils/geo
  stripe_customer_id: string | null;
  stripe_account_id: string | null;
  expo_push_token: string | null;
  created_at: string;
  updated_at: string;
}

export type SellerRow = {
  id: string;
  user_id: string;
  seller_type: SellerType;
  business_name: string;
  description: string | null;
  cuisine_tags: string[];
  verification_status: VerificationStatus;
  rejection_reason: string | null;
  food_category_tier: FoodCategoryTier | null;
  permit_status: PermitStatus;
  compliance_label: string | null;
  licence_doc_path: string | null;
  permit_doc_path: string | null;
  id_doc_path: string | null;
  food_handler_cert_path: string | null;
  commission_rate: number;
  address: string | null;
  location: unknown | null;
  open_hours: Record<string, { open: string; close: string } | null>;
  prep_time_mins: number;
  accepts_realtime: boolean;
  accepts_scheduled: boolean;
  is_open: boolean;
  avg_rating: number | null;
  rating_count: number;
  logo_url: string | null;
  banner_url: string | null;
  created_at: string;
  updated_at: string;
}

export type DriverRow = {
  id: string;
  user_id: string;
  verification_status: VerificationStatus;
  rejection_reason: string | null;
  id_doc_path: string | null;
  licence_doc_path: string | null;
  vehicle_info: { make?: string; model?: string; year?: string; color?: string; plate?: string };
  is_online: boolean;
  current_lat: number | null;
  current_lng: number | null;
  heading: number | null;
  location_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

export type ListingRow = {
  id: string;
  seller_id: string;
  name: string;
  description: string | null;
  price: number;
  image_url: string | null;
  category: string | null;
  is_low_risk: boolean;
  is_available: boolean;
  sold_out: boolean;
  created_at: string;
  updated_at: string;
}

/** Row shape of the visible_listings view (listing + seller summary). */
export type VisibleListingRow = ListingRow & {
  business_name: string;
  seller_type: SellerType;
  is_open: boolean;
  avg_rating: number | null;
  rating_count: number;
};

export type PreOrderWindowRow = {
  id: string;
  seller_id: string;
  title: string | null;
  cook_date: string;
  order_cutoff: string;
  min_orders: number;
  pickup_ready_at: string;
  status: WindowStatus;
  created_at: string;
}

export type OrderRow = {
  id: string;
  customer_id: string;
  seller_id: string;
  driver_id: string | null;
  pre_order_window_id: string | null;
  status: OrderStatus;
  delivery_address: string;
  delivery_location: unknown | null;
  delivery_instructions: string | null;
  subtotal: number;
  delivery_fee: number;
  service_fee: number;
  tax: number;
  total: number;
  commission_rate: number;
  commission_amount: number;
  payment_intent_id: string | null;
  payment_status: PaymentStatus;
  placed_at: string;
  accepted_at: string | null;
  ready_at: string | null;
  picked_up_at: string | null;
  delivered_at: string | null;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
}

export type OrderItemRow = {
  id: string;
  order_id: string;
  listing_id: string | null;
  name: string;
  unit_price: number;
  quantity: number;
}

export type OrderStatusEventRow = {
  id: string;
  order_id: string;
  status: OrderStatus;
  actor_user_id: string | null;
  note: string | null;
  created_at: string;
}

export type PaymentRow = {
  id: string;
  order_id: string;
  stripe_payment_intent_id: string;
  amount_total: number;
  seller_amount: number;
  commission_amount: number;
  delivery_fee: number;
  service_fee: number;
  driver_amount: number;
  seller_payout_status: PayoutStatus;
  driver_payout_status: PayoutStatus;
  stripe_seller_transfer_id: string | null;
  stripe_driver_transfer_id: string | null;
  refund_id: string | null;
  created_at: string;
  updated_at: string;
}

export type ReviewRow = {
  id: string;
  order_id: string;
  customer_id: string;
  seller_id: string;
  rating: number;
  comment: string | null;
  created_at: string;
}

export type DeliveryLocationRow = {
  order_id: string;
  driver_id: string;
  latitude: number;
  longitude: number;
  heading: number | null;
  speed: number | null;
  updated_at: string;
}

export type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title: string | null;
  body: string | null;
  data: Record<string, unknown>;
  read: boolean;
  created_at: string;
}

type TableShape<Row> = { Row: Row; Insert: Partial<Row>; Update: Partial<Row>; Relationships: [] };

export interface Database {
  public: {
    Tables: {
      users: TableShape<UserRow>;
      sellers: TableShape<SellerRow>;
      drivers: TableShape<DriverRow>;
      listings: TableShape<ListingRow>;
      pre_order_windows: TableShape<PreOrderWindowRow>;
      pre_order_window_items: TableShape<{ window_id: string; listing_id: string }>;
      orders: TableShape<OrderRow>;
      order_items: TableShape<OrderItemRow>;
      order_status_events: TableShape<OrderStatusEventRow>;
      payments: TableShape<PaymentRow>;
      reviews: TableShape<ReviewRow>;
      delivery_locations: TableShape<DeliveryLocationRow>;
      notifications: TableShape<NotificationRow>;
      platform_config: TableShape<{ key: string; value: unknown; updated_at: string }>;
    };
    Views: {
      visible_listings: { Row: VisibleListingRow; Relationships: [] };
      public_sellers: {
        Row: Partial<SellerRow> & { id: string; business_name: string; seller_type: SellerType };
        Relationships: [];
      };
    };
    Functions: Record<string, { Args: Record<string, unknown>; Returns: unknown }>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
