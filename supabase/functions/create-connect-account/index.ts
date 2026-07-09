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
 * Creates a Stripe Connect Express account for a driver.
 * Input: { clerkId, email, firstName, lastName }
 * Returns: { accountId, onboardingUrl }
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

    const { clerkId, email, firstName, lastName } = await req.json();

    if (!clerkId || !email) {
      return new Response(JSON.stringify({ error: "clerkId and email required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    // Check if user already has a Connect account
    const { data: user } = await supabase
      .from("users")
      .select("id, stripe_account_id")
      .eq("clerk_id", clerkId)
      .single();

    if (user?.stripe_account_id) {
      // Account exists — generate a new onboarding link instead
      const accountLink = await stripe.accountLinks.create({
        account: user.stripe_account_id,
        refresh_url: "https://uride.app/stripe-refresh",
        return_url: "https://uride.app/stripe-return",
        type: "account_onboarding",
      });

      return new Response(JSON.stringify({
        accountId: user.stripe_account_id,
        onboardingUrl: accountLink.url,
        existing: true,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create new Express account
    const account = await stripe.accounts.create({
      type: "express",
      country: "CA",
      email,
      capabilities: {
        card_payments: { requested: true },
        transfers: { requested: true },
      },
      business_type: "individual",
      individual: {
        first_name: firstName,
        last_name: lastName,
        email,
      },
      metadata: {
        clerk_id: clerkId,
        platform: "uride",
      },
    });

    // Save account ID to user
    await supabase
      .from("users")
      .update({
        stripe_account_id: account.id,
        updated_at: new Date().toISOString(),
      })
      .eq("clerk_id", clerkId);

    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: account.id,
      refresh_url: "https://uride.app/stripe-refresh",
      return_url: "https://uride.app/stripe-return",
      type: "account_onboarding",
    });

    console.log(`Created Stripe Connect account ${account.id} for ${clerkId}`);

    return new Response(JSON.stringify({
      accountId: account.id,
      onboardingUrl: accountLink.url,
      existing: false,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error) {
    console.error("Create connect account error:", error);
    return new Response(JSON.stringify({
      error: "Failed to create Connect account",
      details: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
