# HalalBasket backend setup (Supabase + Stripe)

Concise runbook to stand up the backend from zero. All commands run from the
repo root (`halalbasket/`). Prereqs: `supabase` CLI, `stripe` CLI (optional,
for local webhook testing), a Stripe account with Connect enabled, a Clerk app.

## 1. Supabase project

```bash
supabase login
supabase link --project-ref <PROJECT_REF>
supabase db push          # applies supabase/migrations/* (schema + check_rate_limit RPC)
```

### Storage buckets

Dashboard → Storage (or CLI):

| bucket              | visibility |
|---------------------|------------|
| `avatars`           | public     |
| `listing-images`    | public     |
| `verification-docs` | private    |

```sql
insert into storage.buckets (id, name, public) values
  ('avatars', 'avatars', true),
  ('listing-images', 'listing-images', true),
  ('verification-docs', 'verification-docs', false)
on conflict (id) do nothing;
```

### Clerk third-party auth

1. Clerk Dashboard → your app → note the Frontend API / issuer domain
   (e.g. `https://winning-starling-39.clerk.accounts.dev`).
2. Supabase Dashboard → Authentication → Sign In / Providers → **Third-Party
   Auth** → add Clerk with that domain. RLS matches `auth.jwt()->>'sub'` to
   `users.clerk_id`.
3. Edge functions verify Clerk JWTs in-function against Clerk's JWKS
   (`_shared/edge.ts`). If your Clerk issuer differs from the default baked in
   there, set the `CLERK_ISSUER` function secret.

## 2. Edge function secrets

```bash
supabase secrets set \
  STRIPE_SECRET_KEY=sk_test_... \
  STRIPE_WEBHOOK_SECRET=whsec_... \
  CLERK_ISSUER=https://<your-clerk-domain>
# SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
```

## 3. Deploy edge functions

```bash
# Client-invoked (Clerk JWT verified in-function; gateway JWT check off):
supabase functions deploy create-order-payment    --no-verify-jwt
supabase functions deploy confirm-order-payment   --no-verify-jwt
supabase functions deploy update-delivery-location --no-verify-jwt
supabase functions deploy create-connect-account  --no-verify-jwt
supabase functions deploy connect-account-link    --no-verify-jwt
supabase functions deploy check-connect-status    --no-verify-jwt
supabase functions deploy clerk-webhook           --no-verify-jwt

# Server-to-server (guarded in-function by the service-role bearer / Stripe sig):
supabase functions deploy stripe-webhook          --no-verify-jwt
supabase functions deploy payout-order            --no-verify-jwt   # also accepts admin Clerk JWT
supabase functions deploy retry-payouts           --no-verify-jwt
supabase functions deploy notify-order-status     --no-verify-jwt
supabase functions deploy send-notification       --no-verify-jwt
```

`--no-verify-jwt` is required because callers present Clerk JWTs (not Supabase
JWTs), Stripe signs with its own header, and crons/webhooks send the
service-role key. Every function enforces its own auth internally.

## 4. Stripe

### Webhook endpoint

Stripe Dashboard → Developers → Webhooks → Add endpoint:

- URL: `https://<PROJECT_REF>.functions.supabase.co/stripe-webhook`
- Events: `payment_intent.succeeded`
- Copy the signing secret (`whsec_...`) into the `STRIPE_WEBHOOK_SECRET`
  function secret (step 2) and redeploy `stripe-webhook` if it changed.

Local test: `stripe listen --forward-to localhost:54321/functions/v1/stripe-webhook`.

### Connect (payouts to sellers + drivers)

1. Stripe Dashboard → Connect → enable **Express** accounts (country: CA).
2. Sellers and drivers onboard through the app via `create-connect-account` /
   `connect-account-link` (stores `users.stripe_account_id`);
   `check-connect-status` polls `payouts_enabled`.
3. Split model (spec §9): customer pays `subtotal + delivery_fee + service_fee
   + tax` in one PaymentIntent to the platform. After delivery, `payout-order`
   transfers `subtotal − commission` to the seller (commission 0 for home
   cooks) and `delivery_fee` to the driver; the platform keeps commission +
   service fee and handles tax. Transfers are idempotent per order
   (`payout_seller_<orderId>` / `payout_driver_<orderId>`).

## 5. Cron: retry-payouts

Runs every 15 min; re-attempts payout legs left `pending`/`failed` (e.g.
recipient finished Connect onboarding after delivery). Same idempotency keys
as `payout-order`, so double-pay is impossible.

```sql
-- SQL editor (requires pg_cron + pg_net, enabled by default on Supabase):
select cron.schedule(
  'retry-payouts',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://<PROJECT_REF>.functions.supabase.co/retry-payouts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body := '{}'::jsonb
  );
  $$
);
```

## 6. Optional: DB webhook → notify-order-status

Dashboard → Database → Webhooks → on `orders` UPDATE → HTTP POST to
`https://<PROJECT_REF>.functions.supabase.co/notify-order-status` with header
`Authorization: Bearer <SERVICE_ROLE_KEY>` and body `{ "orderId": "...",
"status": "..." }` (or invoke it from the app's status-transition service with
the service client). Handles customer pushes for
`accepted/preparing/ready/picked_up/en_route/delivered` and the driver push on
`driver_assigned`; inbox rows land in `notifications`.

## 7. End-to-end demo flow (test mode)

1. **Users**: sign up 3 accounts (customer, seller, driver). Approve the
   seller + driver (`update sellers/drivers set verification_status='approved'`),
   and onboard both through Connect (test data; card `4000 0056 5556 5556`
   bank not needed — Express test onboarding auto-completes).
2. **Listing**: seller creates a listing; confirm it appears via
   `visible_listings`.
3. **Order**: customer builds a cart and places an order → `orders` row with
   `status='pending_payment'` and money snapshot.
4. **Pay**: app calls `createOrderPaymentSession(orderId)` → PaymentSheet with
   test card `4242 4242 4242 4242` → `confirmOrderPayment(orderId)`.
   Verify: order `status='paid'`, `payment_status='captured'`, a `payments`
   row with the split, seller got the `new_order` notification.
   (Kill the app before confirm to verify the `stripe-webhook` backstop
   finalizes anyway.)
5. **Fulfil**: seller accepts → preparing → ready; assign the driver
   (`driver_assigned`), driver streams `update-delivery-location` (customer
   map moves via realtime), picked_up → en_route → delivered.
6. **Payout**: call `payout-order` with the service-role key
   (`curl -X POST .../payout-order -H "Authorization: Bearer <SERVICE_ROLE_KEY>"
   -d '{"orderId":"..."}'`). Verify `payments.seller_payout_status` and
   `driver_payout_status` are `completed` with transfer ids, and the transfers
   appear under Stripe → Connect → Transfers. For a home cook,
   `seller_amount = subtotal` (commission 0).
7. **Retry path**: deliver an order while the driver has no Connect account →
   leg stays `pending`; finish onboarding; wait for the cron (or POST
   `retry-payouts`) → leg completes.
8. **Refund path**: cancel an order right after the PaymentSheet succeeds but
   before confirm — the webhook auto-refunds (`wh_refund_<pi>` idempotent),
   `payment_status='refunded'`.
