# HalalBasket

The one-stop app for everything halal in your city — order prepared meals from halal restaurants,
buy from halal butchers and farms, and get home-cooked food from local cooks, with in-app payment
and live-tracked delivery.

Three-sided marketplace: **customers**, **sellers** (restaurants / butchers / home cooks), **drivers**,
plus an **admin** verification layer. Halal-only is the brand; every seller is verified and approved
before going live.

## Stack

- **App**: Expo (React Native 0.79), React Navigation, TypeScript
- **Auth**: Clerk (third-party auth bridged into Supabase RLS)
- **Backend**: Supabase (Postgres + PostGIS, Realtime, Storage, Edge Functions)
- **Payments**: Stripe + Stripe Connect (marketplace payouts to sellers and drivers)
- **Maps / live tracking**: Mapbox (`@rnmapbox/maps`) + expo-location

## Project layout

```
app/
  auth/         sign in / sign up / verify / complete profile
  customer/     browse, search, cart, checkout, live order tracking, reviews
  seller/       onboarding + verification, listings, pre-order windows, orders, earnings, compliance
  driver/       onboarding, go online, claim deliveries, live location broadcast, earnings
  admin/        seller & driver approval queues, order oversight, dispatch override
  profile/      shared profile, Stripe Connect payout setup
  components/   design system (map view, sheets, patterns, toasts)
  config/       clerk / supabase / mapbox clients
  context/      Session (role + records), Cart
  services/     orders (realtime), profile, delivery location
  navigation/   root navigator + route contract
supabase/
  migrations/   full schema: users, sellers, drivers, listings, pre_order_windows,
                orders, payments, reviews, delivery_locations + RLS
  functions/    create-order-payment, confirm-order-payment, stripe-webhook,
                payout-order, retry-payouts, update-delivery-location, notify-order-status,
                Stripe Connect account functions
docs/           build brief + backend setup runbook
```

## Getting started

```bash
npm install --legacy-peer-deps
cp .env.example .env   # fill in your keys
npx expo start
```

Backend provisioning (Supabase project, buckets, Clerk third-party auth, Stripe webhooks,
edge function deploys) is documented in `docs/BACKEND_SETUP.md`.

## Domain rules baked into the product

- **Seller verification**: sellers onboard with document upload and sit `pending` until an admin
  approves them. Only approved sellers' listings are visible (`visible_listings` view).
- **Home cooks** sell through **pre-order windows** (cook date, order cutoff, minimum orders,
  pickup-ready time) — never live ordering. Free to join: 0% commission at launch.
- **Category gating**: home-cook high-risk listings (meals, meat, refrigerated) stay locked until
  the cook's permit status is approved; the app walks cooks up the compliance ladder
  (course → permit → inspection → live).
- **Money split per order**: customer pays food + delivery fee + service fee + tax; seller receives
  food price minus commission (0 for home cooks); driver is paid from the delivery fee; platform
  keeps commission + service fee. All rates configurable in `platform_config`.
