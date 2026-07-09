import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { jwtVerify, createRemoteJWKSet } from "https://esm.sh/jose@5.9.6";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// Clerk JWT verification via Clerk JWKS (Supabase Functions gateway TPA broken — verify in-fn)
const CLERK_ISSUER = Deno.env.get("CLERK_ISSUER") ?? "https://winning-starling-39.clerk.accounts.dev";
const CLERK_JWKS = createRemoteJWKSet(new URL(`${CLERK_ISSUER}/.well-known/jwks.json`));

export async function verifyClerkToken(token: string): Promise<string> {
  const { payload } = await jwtVerify(token, CLERK_JWKS, { issuer: CLERK_ISSUER });
  const sub = (payload.sub as string) || (payload.user_metadata as Record<string, string> | undefined)?.clerk_id;
  if (!sub) throw new Error("missing sub claim");
  return sub;
}

export async function requireAuth(req: Request): Promise<{ callerClerkId: string; token: string }> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw jsonResponse({ error: "Unauthorized" }, 401);
  }
  const token = authHeader.replace("Bearer ", "");
  try {
    const callerClerkId = await verifyClerkToken(token);
    return { callerClerkId, token };
  } catch (e) {
    throw jsonResponse({ error: "Invalid token", details: String(e) }, 401);
  }
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  );
}

export async function resolveUserIdFromClerk(
  supabase: SupabaseClient,
  clerkId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from("users")
    .select("id")
    .eq("clerk_id", clerkId)
    .single();
  if (error || !data) return null;
  return (data as { id: string }).id;
}

export function rpcErrorToResponse(err: unknown): Response {
  // PostgrestError is a plain object literal, not an Error subclass — read .message defensively.
  const msg = (err && typeof err === "object" && "message" in err && typeof (err as { message: unknown }).message === "string")
    ? (err as { message: string }).message
    : (err instanceof Error ? err.message : String(err));
  const map: Record<string, number> = {
    booking_not_found: 404,
    booking_not_acceptable: 409,
    booking_not_rejectable: 409,
    booking_not_eligible: 409,
    booking_already_terminal: 409,
    booking_in_capture_window: 409,
    booking_not_confirmed: 409,
    ride_not_found: 404,
    ride_unavailable: 409,
    ride_not_acceptable: 409,
    ride_already_terminal: 409,
    ride_locked: 409,
    ride_past: 409,
    request_already_matched_or_closed: 409,
    not_authorized: 403,
    not_ride_driver: 403,
    cannot_book_own_ride: 400,
    no_seats_available: 409,
    invalid_seats: 400,
    invalid_seats_total: 400,
    invalid_caller_role: 400,
    invalid_role: 400,
    compat_violation: 409,
    rider_suspended: 403,
    driver_suspended: 403,
    driver_not_arrived: 409,
    driver_not_at_pickup: 409,
    wait_period_not_satisfied: 409,
    acceptance_window_expired: 410,
    too_close_to_depart: 409,
    payment_window_expired: 410,
    booking_not_awaiting_payment: 409,
    invalid_ride_price: 409,
  };
  for (const [code, status] of Object.entries(map)) {
    if (msg.includes(code)) {
      return jsonResponse({ error: code, details: msg }, status);
    }
  }
  return jsonResponse({ error: "internal_error", details: msg }, 500);
}

export function idemKey(scope: string, ...parts: (string | number | null | undefined)[]): string {
  return [scope, ...parts.filter(Boolean)].join(":");
}
