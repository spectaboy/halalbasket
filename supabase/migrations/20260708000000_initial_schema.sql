-- HalalBasket initial schema (Phase 1)
-- Three-sided halal marketplace: customers, sellers (restaurants / butchers / home cooks), drivers, admin.
-- Auth: Clerk third-party auth -> RLS matches auth.jwt()->>'sub' to users.clerk_id (same pattern as URide).

create extension if not exists postgis;

-- ---------------------------------------------------------------------------
-- users: base identity, Clerk-linked
-- ---------------------------------------------------------------------------
create table public.users (
  id uuid primary key default gen_random_uuid(),
  clerk_id text unique not null,
  email text,
  first_name text,
  last_name text,
  phone text,
  role text not null default 'customer' check (role in ('customer', 'seller', 'driver', 'admin')),
  is_admin boolean not null default false,
  avatar_url text,
  default_address text,
  default_location geography(Point, 4326),
  stripe_customer_id text,
  stripe_account_id text,
  expo_push_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- sellers: one per seller user. Verification + compliance gating lives here.
-- ---------------------------------------------------------------------------
create table public.sellers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references public.users(id) on delete cascade,
  seller_type text not null check (seller_type in ('restaurant', 'butcher', 'home_cook')),
  business_name text not null,
  description text,
  cuisine_tags text[] default '{}',
  verification_status text not null default 'pending' check (verification_status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  -- home-cook compliance ladder (null / not-applicable for licensed sellers)
  food_category_tier text check (food_category_tier in ('low_risk', 'high_risk')),
  permit_status text not null default 'none' check (permit_status in ('none', 'course_done', 'permit_applied', 'inspection_scheduled', 'approved')),
  compliance_label text,
  -- uploaded verification docs (storage paths in seller-docs bucket)
  licence_doc_path text,
  permit_doc_path text,
  id_doc_path text,
  food_handler_cert_path text,
  -- economics: commission fraction of food subtotal (0 for home cooks at launch)
  commission_rate numeric(5, 4) not null default 0.15,
  -- location + fulfillment
  address text,
  location geography(Point, 4326),
  open_hours jsonb default '{}',
  prep_time_mins integer default 20,
  accepts_realtime boolean not null default true,
  accepts_scheduled boolean not null default false,
  is_open boolean not null default false,
  -- derived rating aggregate
  avg_rating numeric(3, 2),
  rating_count integer not null default 0,
  logo_url text,
  banner_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- drivers: one per driver user
-- ---------------------------------------------------------------------------
create table public.drivers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references public.users(id) on delete cascade,
  verification_status text not null default 'pending' check (verification_status in ('pending', 'approved', 'rejected')),
  rejection_reason text,
  id_doc_path text,
  licence_doc_path text,
  vehicle_info jsonb default '{}',
  is_online boolean not null default false,
  current_lat double precision,
  current_lng double precision,
  heading double precision,
  location_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- listings: menu items / products
-- ---------------------------------------------------------------------------
create table public.listings (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  name text not null,
  description text,
  price numeric(10, 2) not null check (price >= 0),
  image_url text,
  category text,
  -- home-cook gating: high-risk listings stay hidden until seller permit approved
  is_low_risk boolean not null default true,
  is_available boolean not null default true,
  sold_out boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index listings_seller_idx on public.listings(seller_id);

-- ---------------------------------------------------------------------------
-- pre_order_windows: home-cook scheduled meal drops
-- ---------------------------------------------------------------------------
create table public.pre_order_windows (
  id uuid primary key default gen_random_uuid(),
  seller_id uuid not null references public.sellers(id) on delete cascade,
  title text,
  cook_date date not null,
  order_cutoff timestamptz not null,
  min_orders integer not null default 1,
  pickup_ready_at timestamptz not null,
  status text not null default 'open' check (status in ('open', 'confirmed', 'cancelled', 'completed')),
  created_at timestamptz not null default now()
);
create index pre_order_windows_seller_idx on public.pre_order_windows(seller_id);

create table public.pre_order_window_items (
  window_id uuid not null references public.pre_order_windows(id) on delete cascade,
  listing_id uuid not null references public.listings(id) on delete cascade,
  primary key (window_id, listing_id)
);

-- ---------------------------------------------------------------------------
-- orders + items + status history
-- ---------------------------------------------------------------------------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.users(id),
  seller_id uuid not null references public.sellers(id),
  driver_id uuid references public.drivers(id),
  pre_order_window_id uuid references public.pre_order_windows(id),
  status text not null default 'pending_payment' check (status in (
    'pending_payment', 'paid', 'accepted', 'preparing', 'ready',
    'driver_assigned', 'picked_up', 'en_route', 'delivered',
    'cancelled', 'refunded'
  )),
  delivery_address text not null,
  delivery_location geography(Point, 4326),
  delivery_instructions text,
  -- money snapshot (dollars)
  subtotal numeric(10, 2) not null,
  delivery_fee numeric(10, 2) not null default 0,
  service_fee numeric(10, 2) not null default 0,
  tax numeric(10, 2) not null default 0,
  total numeric(10, 2) not null,
  commission_rate numeric(5, 4) not null default 0,
  commission_amount numeric(10, 2) not null default 0,
  payment_intent_id text,
  payment_status text not null default 'pending' check (payment_status in ('pending', 'captured', 'refunded', 'failed')),
  placed_at timestamptz not null default now(),
  accepted_at timestamptz,
  ready_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_customer_idx on public.orders(customer_id);
create index orders_seller_idx on public.orders(seller_id);
create index orders_driver_idx on public.orders(driver_id);
create index orders_window_idx on public.orders(pre_order_window_id);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  listing_id uuid references public.listings(id),
  name text not null,          -- snapshot at purchase time
  unit_price numeric(10, 2) not null,
  quantity integer not null check (quantity > 0)
);
create index order_items_order_idx on public.order_items(order_id);

create table public.order_status_events (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  status text not null,
  actor_user_id uuid references public.users(id),
  note text,
  created_at timestamptz not null default now()
);
create index order_status_events_order_idx on public.order_status_events(order_id);

-- ---------------------------------------------------------------------------
-- payments: Stripe references + marketplace split snapshot
-- ---------------------------------------------------------------------------
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid unique not null references public.orders(id),
  stripe_payment_intent_id text not null,
  amount_total numeric(10, 2) not null,
  seller_amount numeric(10, 2) not null default 0,
  commission_amount numeric(10, 2) not null default 0,
  delivery_fee numeric(10, 2) not null default 0,
  service_fee numeric(10, 2) not null default 0,
  driver_amount numeric(10, 2) not null default 0,
  seller_payout_status text not null default 'pending' check (seller_payout_status in ('pending', 'completed', 'failed', 'not_applicable')),
  driver_payout_status text not null default 'pending' check (driver_payout_status in ('pending', 'completed', 'failed', 'not_applicable')),
  stripe_seller_transfer_id text,
  stripe_driver_transfer_id text,
  refund_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- reviews: one per delivered order
-- ---------------------------------------------------------------------------
create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  order_id uuid unique not null references public.orders(id),
  customer_id uuid not null references public.users(id),
  seller_id uuid not null references public.sellers(id),
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);
create index reviews_seller_idx on public.reviews(seller_id);

-- keep seller aggregate rating in sync
create or replace function public.refresh_seller_rating() returns trigger
language plpgsql security definer as $$
begin
  update public.sellers s
  set avg_rating = sub.avg_rating, rating_count = sub.cnt
  from (
    select seller_id, round(avg(rating)::numeric, 2) as avg_rating, count(*) as cnt
    from public.reviews where seller_id = coalesce(new.seller_id, old.seller_id)
    group by seller_id
  ) sub
  where s.id = sub.seller_id;
  return coalesce(new, old);
end $$;

create trigger reviews_refresh_rating
after insert or update or delete on public.reviews
for each row execute function public.refresh_seller_rating();

-- ---------------------------------------------------------------------------
-- delivery_locations: live driver position per order (realtime channel source)
-- ---------------------------------------------------------------------------
create table public.delivery_locations (
  order_id uuid primary key references public.orders(id) on delete cascade,
  driver_id uuid not null references public.drivers(id),
  latitude double precision not null,
  longitude double precision not null,
  heading double precision,
  speed double precision,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- notifications log
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  type text not null,
  title text,
  body text,
  data jsonb default '{}',
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications(user_id);

-- ---------------------------------------------------------------------------
-- platform_config: tunable economics (spec section 14 open decisions)
-- ---------------------------------------------------------------------------
create table public.platform_config (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

insert into public.platform_config (key, value) values
  ('commission_rate_restaurant', '0.15'),
  ('commission_rate_butcher',    '0.10'),
  ('commission_rate_home_cook',  '0'),
  ('delivery_fee_base',          '3.99'),
  ('service_fee',                '1.49'),
  ('tax_rate',                   '0.05');

-- ---------------------------------------------------------------------------
-- rate_limits (edge functions)
-- ---------------------------------------------------------------------------
create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count integer not null default 0
);

-- ---------------------------------------------------------------------------
-- Visibility rule (spec section 11): a listing is visible iff its seller is
-- approved AND (listing is low-risk OR the seller's permit is approved).
-- ---------------------------------------------------------------------------
create or replace view public.visible_listings as
select l.*, s.business_name, s.seller_type, s.is_open, s.avg_rating, s.rating_count
from public.listings l
join public.sellers s on s.id = l.seller_id
where s.verification_status = 'approved'
  and l.is_available = true
  and (l.is_low_risk = true or s.permit_status = 'approved');

-- Public seller directory (only approved sellers, no doc paths)
create or replace view public.public_sellers as
select id, seller_type, business_name, description, cuisine_tags, address, location,
       open_hours, prep_time_mins, accepts_realtime, accepts_scheduled, is_open,
       avg_rating, rating_count, logo_url, banner_url, food_category_tier, permit_status
from public.sellers
where verification_status = 'approved';

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

create trigger users_touch    before update on public.users    for each row execute function public.touch_updated_at();
create trigger sellers_touch  before update on public.sellers  for each row execute function public.touch_updated_at();
create trigger drivers_touch  before update on public.drivers  for each row execute function public.touch_updated_at();
create trigger listings_touch before update on public.listings for each row execute function public.touch_updated_at();
create trigger orders_touch   before update on public.orders   for each row execute function public.touch_updated_at();
create trigger payments_touch before update on public.payments for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------------
-- order status history: append event on every status change
-- ---------------------------------------------------------------------------
create or replace function public.log_order_status() returns trigger
language plpgsql security definer as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.order_status_events (order_id, status) values (new.id, new.status);
  end if;
  return new;
end $$;

create trigger orders_log_status
after insert or update on public.orders
for each row execute function public.log_order_status();

-- ---------------------------------------------------------------------------
-- helper: current app user id from Clerk JWT
-- ---------------------------------------------------------------------------
create or replace function public.current_user_id() returns uuid
language sql stable as $$
  select id from public.users where clerk_id = auth.jwt()->>'sub'
$$;

create or replace function public.is_admin() returns boolean
language sql stable as $$
  select coalesce((select is_admin from public.users where clerk_id = auth.jwt()->>'sub'), false)
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.users enable row level security;
alter table public.sellers enable row level security;
alter table public.drivers enable row level security;
alter table public.listings enable row level security;
alter table public.pre_order_windows enable row level security;
alter table public.pre_order_window_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_status_events enable row level security;
alter table public.payments enable row level security;
alter table public.reviews enable row level security;
alter table public.delivery_locations enable row level security;
alter table public.notifications enable row level security;
alter table public.platform_config enable row level security;
alter table public.rate_limits enable row level security;

-- users: own row + admin
create policy users_select on public.users for select using (clerk_id = auth.jwt()->>'sub' or public.is_admin());
create policy users_insert on public.users for insert with check (clerk_id = auth.jwt()->>'sub');
create policy users_update on public.users for update using (clerk_id = auth.jwt()->>'sub' or public.is_admin());

-- sellers: owner full access, everyone can read approved, admin everything
create policy sellers_select on public.sellers for select
  using (verification_status = 'approved' or user_id = public.current_user_id() or public.is_admin());
create policy sellers_insert on public.sellers for insert with check (user_id = public.current_user_id());
create policy sellers_update on public.sellers for update using (user_id = public.current_user_id() or public.is_admin());

-- drivers: owner + admin (customers see driver position via delivery_locations)
create policy drivers_select on public.drivers for select using (user_id = public.current_user_id() or public.is_admin());
create policy drivers_insert on public.drivers for insert with check (user_id = public.current_user_id());
create policy drivers_update on public.drivers for update using (user_id = public.current_user_id() or public.is_admin());

-- listings: sellers manage own; public read enforced through visibility rule
create policy listings_select on public.listings for select using (
  exists (select 1 from public.sellers s where s.id = seller_id
          and (s.verification_status = 'approved' or s.user_id = public.current_user_id()))
  or public.is_admin()
);
create policy listings_write on public.listings for all using (
  exists (select 1 from public.sellers s where s.id = seller_id and s.user_id = public.current_user_id())
  or public.is_admin()
);

-- pre-order windows: same ownership shape as listings
create policy windows_select on public.pre_order_windows for select using (
  exists (select 1 from public.sellers s where s.id = seller_id
          and (s.verification_status = 'approved' or s.user_id = public.current_user_id()))
  or public.is_admin()
);
create policy windows_write on public.pre_order_windows for all using (
  exists (select 1 from public.sellers s where s.id = seller_id and s.user_id = public.current_user_id())
  or public.is_admin()
);
create policy window_items_select on public.pre_order_window_items for select using (true);
create policy window_items_write on public.pre_order_window_items for all using (
  exists (select 1 from public.pre_order_windows w join public.sellers s on s.id = w.seller_id
          where w.id = window_id and s.user_id = public.current_user_id())
  or public.is_admin()
);

-- orders: visible to its customer, its seller, its driver, and admin
create or replace function public.can_see_order(o_customer uuid, o_seller uuid, o_driver uuid) returns boolean
language sql stable as $$
  select o_customer = public.current_user_id()
      or exists (select 1 from public.sellers s where s.id = o_seller and s.user_id = public.current_user_id())
      or exists (select 1 from public.drivers d where d.id = o_driver and d.user_id = public.current_user_id())
      or public.is_admin()
$$;

create policy orders_select on public.orders for select using (public.can_see_order(customer_id, seller_id, driver_id));
create policy orders_insert on public.orders for insert with check (customer_id = public.current_user_id());
create policy orders_update on public.orders for update using (public.can_see_order(customer_id, seller_id, driver_id));

create policy order_items_select on public.order_items for select using (
  exists (select 1 from public.orders o where o.id = order_id and public.can_see_order(o.customer_id, o.seller_id, o.driver_id))
);
create policy order_items_insert on public.order_items for insert with check (
  exists (select 1 from public.orders o where o.id = order_id and o.customer_id = public.current_user_id())
);

create policy status_events_select on public.order_status_events for select using (
  exists (select 1 from public.orders o where o.id = order_id and public.can_see_order(o.customer_id, o.seller_id, o.driver_id))
);

-- payments: parties to the order can read; writes are service-role only
create policy payments_select on public.payments for select using (
  exists (select 1 from public.orders o where o.id = order_id and public.can_see_order(o.customer_id, o.seller_id, o.driver_id))
);

-- reviews: public read, customer writes own after delivery
create policy reviews_select on public.reviews for select using (true);
create policy reviews_insert on public.reviews for insert with check (
  customer_id = public.current_user_id()
  and exists (select 1 from public.orders o where o.id = order_id
              and o.customer_id = public.current_user_id() and o.status = 'delivered')
);

-- delivery locations: parties to the order read; driver writes own
create policy delivery_loc_select on public.delivery_locations for select using (
  exists (select 1 from public.orders o where o.id = order_id and public.can_see_order(o.customer_id, o.seller_id, o.driver_id))
);
create policy delivery_loc_write on public.delivery_locations for all using (
  exists (select 1 from public.drivers d where d.id = driver_id and d.user_id = public.current_user_id())
);

-- notifications: own rows
create policy notifications_select on public.notifications for select using (user_id = public.current_user_id());
create policy notifications_update on public.notifications for update using (user_id = public.current_user_id());

-- platform config: readable by all authenticated users; writes service-role only
create policy platform_config_select on public.platform_config for select using (true);

-- ---------------------------------------------------------------------------
-- Realtime publication
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table public.orders;
alter publication supabase_realtime add table public.delivery_locations;
alter publication supabase_realtime add table public.order_status_events;

-- ---------------------------------------------------------------------------
-- Storage buckets (avatars public; seller/driver docs private) are created via
-- dashboard or storage API: 'avatars' (public), 'verification-docs' (private),
-- 'listing-images' (public).
