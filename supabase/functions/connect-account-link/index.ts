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
 * Generates a fresh Stripe Connect onboarding link for an existing account.
 * Input: { clerkId }
 * Returns: { url }
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
      return new Response(JSON.stringify({ error: "No Connect account found. Create one first." }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const accountLink = await stripe.accountLinks.create({
      account: user.stripe_account_id,
      refresh_url: "https://uride.app/stripe-refresh",
      return_url: "https://uride.app/stripe-return",
      type: "account_onboarding",
    });

    return new Response(JSON.stringify({ url: accountLink.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Account link error:", error);
    return new Response(JSON.stringify({
      error: "Failed to create account link",
      details: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
