import { createClient } from '@supabase/supabase-js';
import * as Updates from 'expo-updates';
import { Database } from '../types/database';
import 'react-native-url-polyfill/auto';
import { logger } from '../utils/logger';

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// ── Production key guard (F15) ────────────────────────────────────────────
// supabase.ts is imported very early, so it doubles as the app's startup check
// for the Stripe publishable key (the StripeProvider in App.tsx reads the same
// env var). A pk_test_* key makes PaymentSheet run in Stripe TEST mode: real
// cards are never charged and Connect payouts never settle, so the money flow
// is silently inert in a store binary. Hard-throw on the production channel;
// preview legitimately uses test keys and only warns.
const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';
if (STRIPE_PUBLISHABLE_KEY.startsWith('pk_test_') && !__DEV__) {
  let channel: string | null = null;
  try {
    channel = Updates.channel;
  } catch {
    channel = null;
  }
  const msg =
    `[stripe] Non-dev build (channel=${channel ?? 'unknown'}) is using a Stripe TEST ` +
    'publishable key (pk_test_*). Set EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY to a LIVE key ' +
    '(pk_live_*) in eas.json build.production.env and set the edge STRIPE_SECRET_KEY to ' +
    'sk_live_* before submitting.';
  if (channel === 'production') {
    throw new Error(msg);
  }
  console.error(msg);
}

// Use Clerk session tokens for REST, Storage, Functions, and Realtime.
// AuthEffects registers the getter before descendant effects request profiles.
type TokenGetter = () => Promise<string | null>;
let clerkTokenGetter: TokenGetter | null = null;

export function setSupabaseTokenGetter(getter: TokenGetter | null) {
  clerkTokenGetter = getter;
}

export const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_ANON_KEY, {
  accessToken: async () => clerkTokenGetter ? clerkTokenGetter() : null,
});

// ─── Auto-instrumentation ────────────────────────────────────────────────
// Wrap functions.invoke so every edge fn call gets timing + status logs.
const _origInvoke = supabase.functions.invoke.bind(supabase.functions);
(supabase.functions as any).invoke = async (fnName: string, opts?: any) => {
  const reqId = logger.logRequest(`/functions/v1/${fnName}`, 'POST', opts?.body);
  try {
    const res: any = await _origInvoke(fnName, opts);
    if (res?.error) {
      // supabase-js FunctionsHttpError hides the real reason behind a generic
      // "Edge Function returned a non-2xx status code". The actual server body
      // ({ error, details }) lives on error.context (the raw Response). Read it
      // and promote it onto error.message so EVERY callsite surfaces the true
      // cause instead of the opaque string.
      let status: number | undefined = res.error?.status;
      let body: any;
      const ctx = res.error?.context;
      if (ctx) {
        if (typeof ctx.status === 'number') status = ctx.status;
        // RN Response may or may not implement clone(); try json() then text().
        const src = typeof ctx.clone === 'function' ? ctx.clone() : ctx;
        try {
          if (typeof src.json === 'function') {
            body = await src.json();
          } else if (typeof src.text === 'function') {
            const raw = await src.text();
            try { body = JSON.parse(raw); } catch { body = raw; }
          }
        } catch {}
      }
      const real =
        (body && typeof body === 'object' && (body.error || body.details)) ||
        (typeof body === 'string' && body.length ? body : null) ||
        res.error?.message ||
        String(res.error);
      res.error.message = status ? `${real} (HTTP ${status})` : String(real);
      (res.error as any).body = body;
      (res.error as any).status = status;
      logger.logResponse(reqId, fnName, 'error', { status, error: res.error.message, body });
    } else {
      logger.logResponse(reqId, fnName, 'success', {
        data: res?.data ? JSON.stringify(res.data).slice(0, 200) : undefined,
      });
    }
    return res;
  } catch (e: any) {
    logger.logResponse(reqId, fnName, 'error', { error: e?.message || String(e) });
    throw e;
  }
};

// Wrap rpc() so every Postgres function call gets logged.
const _origRpc: any = (supabase.rpc as any).bind(supabase);
(supabase as any).rpc = (fnName: string, args?: any, opts?: any) => {
  const start = Date.now();
  logger.info('Supabase', `🛢️ rpc ${fnName}`, {
    args: args ? JSON.stringify(args).slice(0, 200) : undefined,
  });
  const builder: any = _origRpc(fnName, args, opts);
  const _origThen = builder.then.bind(builder);
  builder.then = (onFulfilled: any, onRejected: any) =>
    _origThen((res: any) => {
      const dur = Date.now() - start;
      if (res?.error) {
        logger.error('Supabase', `🛢️ rpc ${fnName} failed`, {
          durationMs: dur,
          error: res.error?.message,
        });
      } else {
        logger.info('Supabase', `🛢️ rpc ${fnName} ok`, { durationMs: dur });
      }
      return onFulfilled ? onFulfilled(res) : res;
    }, onRejected);
  return builder;
};

// Legacy no-op kept for callsites that still reference it.
export const setSupabaseClerkId = async (_clerkId: string) => {};

export default supabase;
