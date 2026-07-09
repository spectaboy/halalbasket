import { ClerkProvider, useAuth, useUser } from '@clerk/clerk-expo';
import { tokenCache } from '@clerk/clerk-expo/token-cache';
import React from 'react';
import * as Notifications from 'expo-notifications';
import * as Updates from 'expo-updates';
import { registerForPushNotificationsAsync, upsertExpoPushToken } from '../lib/notifications';
import { setSupabaseTokenGetter } from './supabase';

// Clerk publishable key is safe to expose client-side. Read it from the Expo
// public env var so builds can point at different Clerk instances; fall back to
// the dev test key only when unset so local dev keeps working.
// set EXPO_PUBLIC_* to LIVE keys for production build
const FALLBACK_CLERK_PUBLISHABLE_KEY =
  'pk_test_d2lubmluZy1zdGFybGluZy0zOS5jbGVyay5hY2NvdW50cy5kZXYk';

const CLERK_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY || FALLBACK_CLERK_PUBLISHABLE_KEY;

if (!process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY) {
  console.warn(
    '[clerk] EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY is not set; falling back to the hardcoded dev test key. Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to a LIVE key for production builds.',
  );
}

// ── Production key guard (F15) ────────────────────────────────────────────
// A store build must authenticate against the Clerk LIVE instance. A pk_test_*
// key targets the DEV instance (winning-starling-39.clerk.accounts.dev) which
// has a hard user cap and is NOT the production auth surface. Fail loudly so a
// mis-swapped build is caught at startup instead of silently running on dev.
// Only the 'production' EAS channel hard-throws; preview legitimately uses test
// keys and merely warns.
if (CLERK_PUBLISHABLE_KEY.startsWith('pk_test_') && !__DEV__) {
  let channel: string | null = null;
  try {
    channel = Updates.channel;
  } catch {
    channel = null;
  }
  const msg =
    `[clerk] Non-dev build (channel=${channel ?? 'unknown'}) is using a Clerk TEST/DEV ` +
    'publishable key (pk_test_*). Set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY to a LIVE key ' +
    '(pk_live_*) in eas.json build.production.env before submitting.';
  if (channel === 'production') {
    throw new Error(msg);
  }
  console.error(msg);
}

export function ClerkProviderWrapper({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      tokenCache={tokenCache}
    >
      <AuthEffects>{children}</AuthEffects>
    </ClerkProvider>
  );
}

function AuthEffects({ children }: { children: React.ReactNode }) {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { user } = useUser();

  // Bridge Clerk session into Supabase via Third-Party Auth.
  // Registers a per-request token getter that the supabase client's fetch
  // interceptor calls; Clerk caches + rotates the session JWT. Supabase
  // verifies the RS256 signature against Clerk's JWKS (TPA provider must
  // be registered in the Supabase dashboard for this domain).
  React.useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      setSupabaseTokenGetter(() => getToken());
    } else {
      setSupabaseTokenGetter(null);
    }
  }, [isSignedIn, isLoaded, getToken]);

  React.useEffect(() => {
    if (!isSignedIn || !user) return;

    let listener: Notifications.Subscription | null = null;

    (async () => {
      try {
        console.log('🔔 Registering push notifications for', user.id);
        const token = await registerForPushNotificationsAsync();
        if (token) {
          await upsertExpoPushToken(user.id, token);
          console.log('🔔 Push token saved');
        } else {
          console.warn('🔔 No push token obtained for', user.id);
        }
      } catch (e) {
        console.error('🔔 Error registering push token:', e);
      }
    })();

    try {
      listener = Notifications.addPushTokenListener((tokenData) => {
        const newToken = tokenData?.data;
        if (!newToken) return;
        console.log('🔔 Push token rotated, persisting');
        upsertExpoPushToken(user.id, newToken).catch((e) =>
          console.warn('🔔 Token rotation persist failed:', e),
        );
      });
    } catch (e) {
      console.warn('🔔 addPushTokenListener unavailable:', e);
    }

    return () => {
      try { listener?.remove(); } catch {}
    };
  }, [isSignedIn, user?.id]);

  return <>{children}</>;
}
