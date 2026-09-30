import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLERK_WEBHOOK_SECRET = Deno.env.get("CLERK_WEBHOOK_SECRET");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, svix-id, svix-timestamp, svix-signature",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status,
  });
}

/**
 * Verify Svix webhook signature (used by Clerk).
 * Returns true if the signature is valid.
 */
async function verifySvixSignature(
  secret: string,
  body: string,
  headers: { svixId: string; svixTimestamp: string; svixSignature: string }
): Promise<boolean> {
  // Remove "whsec_" prefix and base64-decode the secret
  const secretBytes = Uint8Array.from(
    atob(secret.replace(/^whsec_/, "")),
    (c) => c.charCodeAt(0)
  );

  // Verify timestamp is within 5 minutes tolerance
  const timestampSec = parseInt(headers.svixTimestamp, 10);
  const nowSec = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSec - timestampSec) > 300) {
    return false;
  }

  // Construct the signed content
  const signedContent = `${headers.svixId}.${headers.svixTimestamp}.${body}`;
  const encoder = new TextEncoder();

  // Compute HMAC-SHA256
  const key = await crypto.subtle.importKey(
    "raw",
    secretBytes,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, encoder.encode(signedContent));
  const computedSig = btoa(String.fromCharCode(...new Uint8Array(signature)));

  // Compare against provided signatures (comma-separated, each prefixed with "v1,")
  const providedSigs = headers.svixSignature.split(" ");
  for (const sig of providedSigs) {
    const [version, value] = sig.split(",");
    if (version === "v1" && value === computedSig) {
      return true;
    }
  }
  return false;
}

/**
 * Pick the user's primary email from a Clerk user payload.
 */
function primaryEmailOf(data: any): string | null {
  const list = data.email_addresses || [];
  const primary = list.find((e: any) => e.id === data.primary_email_address_id);
  return primary?.email_address || list[0]?.email_address || null;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // --- Webhook signature verification ---
    const svixId = req.headers.get("svix-id");
    const svixTimestamp = req.headers.get("svix-timestamp");
    const svixSignature = req.headers.get("svix-signature");

    if (!svixId || !svixTimestamp || !svixSignature) {
      return json({ error: "Missing Svix headers" }, 401);
    }

    if (!CLERK_WEBHOOK_SECRET) {
      console.error("CLERK_WEBHOOK_SECRET is not configured");
      return json({ error: "Server misconfigured" }, 500);
    }

    const rawBody = await req.text();
    const isValid = await verifySvixSignature(CLERK_WEBHOOK_SECRET, rawBody, {
      svixId,
      svixTimestamp,
      svixSignature,
    });

    if (!isValid) {
      console.error("Webhook signature verification failed");
      return json({ error: "Invalid signature" }, 401);
    }
    // --- End verification ---

    const payload = JSON.parse(rawBody);
    const eventType: string = payload.type;
    console.log(`Received verified Clerk webhook: ${eventType}`);

    // Service-role client (bypasses RLS) — used by every branch below.
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ─── user.created / user.updated: ensure a users row exists ──────────────
    // Row creation was previously done ONLY lazily by the app during onboarding,
    // so any Clerk account that didn't finish onboarding had no users row and
    // every edge function returned user_not_found (404). Creating the row here,
    // at signup, closes that gap. Only identity columns are written; role and
    // onboarding fields are left untouched on conflict so onboarding still runs
    // and app-side profile data is never clobbered.
    if (eventType === "user.created" || eventType === "user.updated") {
      const d = payload.data;
      const clerkUserId: string = d.id;

      const row: Record<string, unknown> = {
        clerk_id: clerkUserId,
        updated_at: new Date().toISOString(),
      };
      const email = primaryEmailOf(d);
      if (email) row.email = email;
      if (d.first_name) row.first_name = d.first_name;
      if (d.last_name) row.last_name = d.last_name;

      // ignoreDuplicates => INSERT ... ON CONFLICT DO NOTHING. This ONLY creates
      // a missing row (the original bug: no users row -> 404). It never touches
      // an existing user's email/name — those are managed in-app, and syncing
      // them from Clerk here would clobber the user's own edits.
      const { error: upsertErr } = await supabase
        .from("users")
        .upsert(row, { onConflict: "clerk_id", ignoreDuplicates: true });

      if (upsertErr) {
        console.error("Failed to upsert users row:", upsertErr);
        return json({ error: "upsert_failed", details: upsertErr.message }, 500);
      }

      console.log(`Synced users row for ${clerkUserId} (${eventType})`);
      return json({ success: true, synced: clerkUserId }, 200);
    }

    // ─── user.deleted: cascade cleanup of all user data ──────────────────────
    if (eventType === "user.deleted") {
      const clerkUserId = payload.data.id;
      console.log(`Processing user deletion for Clerk ID: ${clerkUserId}`);

      // 1. Get user's info to find their uploaded files
      const { data: user, error: userError } = await supabase
        .from("users")
        .select("*")
        .eq("clerk_id", clerkUserId)
        .single();

      if (userError && userError.code !== "PGRST116") {
        console.error("Error fetching user:", userError);
      }

      // 2. Delete user's uploaded files from storage
      if (user) {
        console.log(`Found user in database:`, user.id);
        const userFolder = `users/${clerkUserId}`;
        const { data: files, error: listError } = await supabase.storage
          .from("user-uploads")
          .list(userFolder);

        if (listError) {
          console.error("Error listing user files:", listError);
        } else if (files && files.length > 0) {
          const filePaths = files.map((file) => `${userFolder}/${file.name}`);
          console.log(`Deleting ${filePaths.length} files:`, filePaths);
          const { error: deleteFilesError } = await supabase.storage
            .from("user-uploads")
            .remove(filePaths);
          if (deleteFilesError) {
            console.error("Error deleting user files:", deleteFilesError);
          } else {
            console.log(`Successfully deleted ${filePaths.length} files`);
          }
        } else {
          console.log("No files found for user");
        }
      }

      // 3. Delete financial records that do NOT cascade. Every other table
      //    (bookings, rides, ride_requests, messages, reviews, notifications,
      //    driver_locations, emergency_reports, issue_reports, no_show_strikes)
      //    references users.id ON DELETE CASCADE, but payouts_driver_id_fkey has
      //    no cascade — so without this the users delete below fails and the
      //    account (all PII) is left behind while we return success.
      if (user?.id) {
        const { error: payoutsError } = await supabase
          .from("payouts")
          .delete()
          .eq("driver_id", user.id);
        if (payoutsError) console.error("Error deleting payouts:", payoutsError);
      }

      // 4. Delete the user row → cascades to all related tables.
      const { error: deleteUserError } = await supabase
        .from("users")
        .delete()
        .eq("clerk_id", clerkUserId);
      if (deleteUserError) {
        console.error("Error deleting user record:", deleteUserError);
        return json({ success: false, error: deleteUserError.message }, 500);
      }

      console.log(`Deleted user ${clerkUserId} and cascaded all related data`);
      return json({ success: true, message: `User data deleted for ${clerkUserId}` }, 200);
    }

    // Any other event type is acknowledged but ignored.
    console.log(`Ignoring event type: ${eventType}`);
    return json({ message: "Event ignored" }, 200);
  } catch (error) {
    console.error("Error processing webhook:", error);
    return json({ error: (error as Error).message }, 500);
  }
});
