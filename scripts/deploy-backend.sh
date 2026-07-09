#!/usr/bin/env bash
# HalalBasket backend deploy — run AFTER `supabase login` and with a project ref.
# Usage:
#   PROJECT_REF=xxxx DB_PASSWORD='...' \
#   STRIPE_SECRET_KEY='sk_...' STRIPE_WEBHOOK_SECRET='whsec_...' \
#   bash scripts/deploy-backend.sh
set -euo pipefail

: "${PROJECT_REF:?set PROJECT_REF to your Supabase project ref}"
SB="npx --yes supabase"

echo "▶ Linking project $PROJECT_REF"
if [ -n "${DB_PASSWORD:-}" ]; then
  $SB link --project-ref "$PROJECT_REF" --password "$DB_PASSWORD"
else
  $SB link --project-ref "$PROJECT_REF"
fi

echo "▶ Pushing migrations"
$SB db push

echo "▶ Setting edge-function secrets"
if [ -n "${STRIPE_SECRET_KEY:-}" ]; then
  $SB secrets set STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY"
fi
if [ -n "${STRIPE_WEBHOOK_SECRET:-}" ]; then
  $SB secrets set STRIPE_WEBHOOK_SECRET="$STRIPE_WEBHOOK_SECRET"
fi

echo "▶ Deploying edge functions"
$SB functions deploy

echo "✅ Backend deployed. Next: create storage buckets (see docs/BACKEND_SETUP.md),"
echo "   register the Stripe webhook endpoint, and set the EXPO_PUBLIC_* keys in .env."
