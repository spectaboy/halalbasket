import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Stripe from "https://esm.sh/stripe@13.10.0?target=deno";
import { requireAuth } from "../_shared/edge.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "", {
  apiVersion: "2023-10-16",
});

/**
 * Checks if a driver's Stripe Connect account is fully set up.
 * Input: { clerkId }
 * Returns: { chargesEnabled, payoutsEnabled, detailsSubmitted, accountId }
 */
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    let callerClerkId: string;
    try {
      const auth = await requireAuth(req);
      callerClerkId = auth.callerClerkId;
    } catch (e) {
      if (e instanceof Response) return e;
      throw e;
    }

    const { clerkId } = await req.json();

    // Verify caller owns this clerkId
    if (callerClerkId !== clerkId) {
      return new Response(JSON.stringify({ error: "Forbidden - clerkId mismatch" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: user } = await supabase
      .from("users")
      .select("stripe_account_id")
      .eq("clerk_id", clerkId)
      .single();

    if (!user?.stripe_account_id) {
      return new Response(JSON.stringify({
        hasAccount: false,
        chargesEnabled: false,
        payoutsEnabled: false,
        detailsSubmitted: false,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const account = await stripe.accounts.retrieve(user.stripe_account_id);

    return new Response(JSON.stringify({
      hasAccount: true,
      accountId: account.id,
      chargesEnabled: account.charges_enabled,
      payoutsEnabled: account.payouts_enabled,
      detailsSubmitted: account.details_submitted,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Check connect status error:", error);
    return new Response(JSON.stringify({
      error: "Failed to check account status",
      details: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
