// Tipos de domínio espelhando o schema SQL.
// Em produção, gere tipos completos com:
//   npx supabase gen types typescript --project-id <id> > lib/database.types.ts

export type MemberRole = "owner" | "manager" | "staff" | "kitchen";
export type OrderStatus = "pending" | "accepted" | "preparing" | "ready" | "out_for_delivery" | "delivered" | "cancelled";
export type OrderType = "delivery" | "pickup" | "dine_in";
export type PaymentMethod = "online" | "cash" | "card_on_delivery" | "pix";
export type PaymentStatus = "pending" | "paid" | "failed" | "refunded";
export type PlanId = "starter" | "pro" | "premium";

export interface RestaurantTheme {
  primary: string;
  secondary: string;
  accent: string;
  background: string;
  foreground: string;
}

export interface Restaurant {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  cover_url: string | null;
  phone: string | null;
  whatsapp: string | null;
  address: Record<string, string>;
  theme: RestaurantTheme;
  currency: string;
  locale: string;
  is_active: boolean;
  is_open: boolean;
  accepts_delivery: boolean;
  accepts_pickup: boolean;
  accepts_dine_in: boolean;
  delivery_fee_cents: number;
  min_order_cents: number;
}

export interface PlanFeatures {
  ar: boolean;
  online_payments: boolean;
  advanced_reports: boolean;
  max_products: number; // -1 = ilimitado
  max_tables: number;
  max_models: number;
  max_staff: number;
}

export interface Plan {
  id: PlanId;
  name: string;
  description: string | null;
  price_cents: number;
  features: PlanFeatures;
  sort_order: number;
  stripe_price_id?: string | null;
  mp_plan_id?: string | null;
}

export interface Subscription {
  id: string;
  restaurant_id: string;
  plan_id: PlanId;
  status: "trialing" | "active" | "past_due" | "canceled";
  trial_ends_at: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  plan?: Plan;
}

export interface Category {
  id: string;
  restaurant_id: string;
  name: string;
  description: string | null;
  position: number;
  is_active: boolean;
}

export interface AddonOption {
  id: string;
  name: string;
  price_cents: number;
}
export interface AddonGroup {
  id: string;
  name: string;
  min: number;
  max: number;
  options: AddonOption[];
}

export interface Model3D {
  id: string;
  restaurant_id: string;
  name: string;
  glb_path: string;
  usdz_path: string | null;
  poster_path: string | null;
  file_size_bytes: number | null;
  real_size_m: number;
  dimensions: { x: number; y: number; z: number } | null;
}

export interface Product {
  id: string;
  restaurant_id: string;
  category_id: string | null;
  name: string;
  description: string | null;
  price_cents: number;
  compare_at_price_cents: number | null;
  allergens: string[];
  tags: string[];
  addon_groups: AddonGroup[];
  model_3d_id: string | null;
  image_url: string | null;
  is_available: boolean;
  is_featured: boolean;
  position: number;
  prep_time_minutes: number | null;
  calories: number | null;
  model_3d?: Model3D | null;
}

export interface Table {
  id: string;
  restaurant_id: string;
  label: string;
  seats: number;
  is_active: boolean;
}

export interface OrderItem {
  id: string;
  order_id: string;
  product_name: string;
  unit_price_cents: number;
  quantity: number;
  addons: { group: string; name: string; price_cents: number }[];
  notes: string | null;
  total_cents: number;
}

export interface Order {
  id: string;
  restaurant_id: string;
  number: number;
  type: OrderType;
  status: OrderStatus;
  payment_method: PaymentMethod;
  payment_status: PaymentStatus;
  subtotal_cents: number;
  discount_cents: number;
  delivery_fee_cents: number;
  total_cents: number;
  customer_name: string;
  customer_phone: string | null;
  delivery_address: Record<string, string> | null;
  notes: string | null;
  table_id: string | null;
  created_at: string;
  accepted_at: string | null;
  order_items?: OrderItem[];
  table?: { label: string } | null;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  total_orders: number;
  total_spent_cents: number;
  last_order_at: string | null;
}

export interface Coupon {
  id: string;
  code: string;
  discount_type: "percent" | "fixed";
  discount_value: number;
  min_order_cents: number;
  max_uses: number | null;
  used_count: number;
  expires_at: string | null;
  is_active: boolean;
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending: "Novo",
  accepted: "Aceito",
  preparing: "Preparando",
  ready: "Pronto",
  out_for_delivery: "Saiu p/ entrega",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  delivery: "Delivery",
  pickup: "Retirada",
  dine_in: "Mesa",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  online: "Pagamento online",
  pix: "Pix na entrega/balcão",
  card_on_delivery: "Cartão na entrega/balcão",
  cash: "Dinheiro",
};

export const ALLERGENS = ["glúten", "lactose", "ovo", "amendoim", "castanhas", "soja", "peixe", "crustáceos", "gergelim", "mostarda"] as const;
