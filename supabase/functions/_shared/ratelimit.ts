// _shared/ratelimit.ts
//
// Postgres-backed rate limiter shared by edge functions.
//
// The DB side (owned by the DB migration) provides:
//   public.check_rate_limit(p_key text, p_max_requests int, p_window_seconds int)
//     RETURNS boolean
//   -- atomic fixed-window counter keyed by p_key. Returns TRUE when the call
//   -- is under the limit (allowed) and FALSE when it should be rejected (429).
//
// enforceRateLimit calls that RPC with the SERVICE-ROLE client. It returns
// true when the caller is allowed to proceed. On ANY RPC error it FAILS OPEN
// (returns true) and console.warns, so a limiter outage can never take down the
// money / PIN flows — the limiter is a guard, not a gate that can wedge shut.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * Consume one token from the fixed-window counter keyed by `key`.
 *
 * @returns true  -> under limit, ALLOW the request to proceed
 *          false -> over limit, caller should reject with 429
 *
 * Fails OPEN (returns true) on any RPC/transport error.
 */
export async function enforceRateLimit(
  supabase: SupabaseClient,
  key: string,
  maxRequests: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("check_rate_limit", {
      p_key: key,
      p_max_requests: maxRequests,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.warn(
        `enforceRateLimit: check_rate_limit RPC error for key="${key}" (failing open):`,
        error.message ?? error,
      );
      return true; // fail open
    }
    // RPC returns a boolean scalar; treat anything non-false as allowed so a
    // null/unexpected shape also fails open rather than blocking the flow.
    return data !== false;
  } catch (e) {
    console.warn(
      `enforceRateLimit: unexpected error for key="${key}" (failing open):`,
      e instanceof Error ? e.message : String(e),
    );
    return true; // fail open
  }
}
