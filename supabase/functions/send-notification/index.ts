// send-notification
//
// Single fan-out edge fn invoked by other edge fns to deliver a typed
// notification. Inbox row is durable (always written); Expo push is
// best-effort. See _shared/notify.ts.
//
// Backward-compatible request shape with the old version. Some callers
// pass { type, ride_id, rider_name }, others pass { type, user_id, title,
// body }, others { type, target_user_id }. All resolve to a list of
// recipient user_ids + a (title, body, data) tuple.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/edge.ts";
import { notifyUsers, NotificationType, NotifyPayload } from "../_shared/notify.ts";

interface RideLookup {
  driver_id: string;
  from_address: string | null;
  to_address: string | null;
  depart_time: string;
}

async function fetchRide(
  supabase: SupabaseClient,
  rideId: string,
): Promise<RideLookup | null> {
  const { data } = await supabase
    .from("rides")
    .select("driver_id, from_address, to_address, depart_time")
    .eq("id", rideId)
    .single();
  return (data as RideLookup) ?? null;
}

async function activeRiderIds(
  supabase: SupabaseClient,
  rideId: string,
): Promise<string[]> {
  const { data } = await supabase
    .from("bookings")
    .select("rider_id")
    .eq("ride_id", rideId)
    .in("status", ["confirmed", "picked_up"]);
  return ((data ?? []) as { rider_id: string }[]).map((r) => r.rider_id);
}

interface ResolvedNotification {
  recipients: string[];
  payload: NotifyPayload;
}

async function resolve(
  supabase: SupabaseClient,
  body: Record<string, unknown>,
): Promise<ResolvedNotification | null> {
  const type = body.type as NotificationType | undefined;
  if (!type) return null;
  const ride_id = (body.ride_id as string | undefined) ?? undefined;
  const booking_id = (body.booking_id as string | undefined) ?? undefined;
  const user_id = (body.user_id as string | undefined) ?? undefined;
  const target_user_id = (body.target_user_id as string | undefined) ?? undefined;
  const rider_name = (body.rider_name as string | undefined) ?? "A rider";
  const overrideTitle = body.title as string | undefined;
  const overrideBody = body.body as string | undefined;
  const extraData = (body.data as Record<string, unknown> | undefined) ?? {};

  const baseData = { rideId: ride_id, bookingId: booking_id, ...extraData };

  switch (type) {
    case "booking_request": {
      if (!ride_id) return null;
      const ride = await fetchRide(supabase, ride_id);
      if (!ride) return null;
      return {
        recipients: [ride.driver_id],
        payload: {
          type,
          title: overrideTitle ?? "New booking request!",
          body: overrideBody ?? `${rider_name} wants to join your ride to ${ride.to_address ?? "your destination"}.`,
          data: baseData,
        },
      };
    }
    case "booking_accepted":
      if (!user_id) return null;
      return {
        recipients: [user_id],
        payload: {
          type,
          title: overrideTitle ?? "Booking confirmed!",
          body: overrideBody ?? "Your driver accepted your booking. Payment was processed.",
          data: baseData,
        },
      };
    case "booking_rejected":
      if (!user_id) return null;
      return {
        recipients: [user_id],
        payload: {
          type,
          title: overrideTitle ?? "Booking declined",
          body: overrideBody ?? "The driver declined your booking. Your payment hold was released.",
          data: baseData,
        },
      };
    case "booking_expired":
      if (!user_id) return null;
      return {
        recipients: [user_id],
        payload: {
          type,
          title: overrideTitle ?? "No response from driver",
          body: overrideBody ?? "The driver did not respond in time. Your payment hold was released.",
          data: baseData,
        },
      };
    case "booking_awaiting_payment":
      if (!user_id) return null;
      return {
        recipients: [user_id],
        payload: {
          type,
          title: overrideTitle ?? "Driver accepted — pay now",
          body: overrideBody ?? "Your driver accepted. Confirm payment to lock in your seat before the window closes.",
          data: baseData,
        },
      };
    case "payment_window_expired":
      if (!user_id) return null;
      return {
        recipients: [user_id],
        payload: {
          type,
          title: overrideTitle ?? "Payment window expired",
          body: overrideBody ?? "Your booking was released because payment wasn't completed in time.",
          data: baseData,
        },
      };
    case "booking_cancelled": {
      // Caller may pass either target_user_id (driver) or user_id (whoever
      // is the "other party"). Support both for back-compat.
      const recipient = target_user_id ?? user_id;
      if (!recipient) return null;
      return {
        recipients: [recipient],
        payload: {
          type,
          title: overrideTitle ?? "Booking cancelled",
          body: overrideBody ?? "The booking was cancelled.",
          data: baseData,
        },
      };
    }
    case "driver_cancelled": {
      if (!ride_id) return null;
      const riderIds = await activeRiderIds(supabase, ride_id);
      return {
        recipients: riderIds,
        payload: {
          type,
          title: overrideTitle ?? "Ride cancelled",
          body: overrideBody ?? "Your driver cancelled the ride. A refund is on the way.",
          data: baseData,
        },
      };
    }
    case "ride_started": {
      if (!ride_id) return null;
      const riderIds = await activeRiderIds(supabase, ride_id);
      return {
        recipients: riderIds,
        payload: {
          type,
          title: overrideTitle ?? "Ride started!",
          body: overrideBody ?? "Your driver has started the ride. Get ready!",
          data: baseData,
        },
      };
    }
    case "ride_completed": {
      if (!ride_id) return null;
      const riderIds = await activeRiderIds(supabase, ride_id);
      return {
        recipients: riderIds,
        payload: {
          type,
          title: overrideTitle ?? "Ride complete",
          body: overrideBody ?? "Thanks for riding! Tap to rate your driver.",
          data: baseData,
        },
      };
    }
    case "driver_arrived":
      if (!user_id) return null;
      return {
        recipients: [user_id],
        payload: {
          type,
          title: overrideTitle ?? "Driver arrived",
          body: overrideBody ?? "Your driver is at the pickup spot.",
          data: baseData,
        },
      };
    case "rider_no_show":
      if (!user_id) return null;
      return {
        recipients: [user_id],
        payload: {
          type,
          title: overrideTitle ?? "Marked as no-show",
          body: overrideBody ?? "You were marked as a no-show for your ride.",
          data: baseData,
        },
      };
    case "refund_processed":
      if (!user_id) return null;
      return {
        recipients: [user_id],
        payload: {
          type,
          title: overrideTitle ?? "Refund processed",
          body: overrideBody ?? "Your refund has been issued.",
          data: baseData,
        },
      };
    case "ride_request_nearby":
      if (!user_id) return null;
      return {
        recipients: [user_id],
        payload: {
          type,
          title: overrideTitle ?? "New ride request nearby",
          body: overrideBody ?? "A rider near you is looking for a ride.",
          data: baseData,
        },
      };
    case "ride_match":
      if (!user_id) return null;
      return {
        recipients: [user_id],
        payload: {
          type,
          title: overrideTitle ?? "Ride match found",
          body: overrideBody ?? "We found a ride that matches your request.",
          data: baseData,
        },
      };
    case "ride_request_matched":
      if (!user_id) return null;
      return {
        recipients: [user_id],
        payload: {
          type,
          title: overrideTitle ?? "Ride matched!",
          body: overrideBody ?? "A driver accepted your request.",
          data: baseData,
        },
      };
    case "ride_reminder_1h":
      if (!user_id) return null;
      return {
        recipients: [user_id],
        payload: {
          type,
          title: overrideTitle ?? "Ride in 1 hour",
          body: overrideBody ?? "Your ride departs in about an hour.",
          data: baseData,
        },
      };
    case "ride_reminder_15m":
      if (!user_id) return null;
      return {
        recipients: [user_id],
        payload: {
          type,
          title: overrideTitle ?? "Ride in 15 minutes",
          body: overrideBody ?? "Your ride departs in 15 minutes.",
          data: baseData,
        },
      };
    case "ride_starting_soon":
      if (!user_id) return null;
      return {
        recipients: [user_id],
        payload: {
          type,
          title: overrideTitle ?? "Ride starting now",
          body: overrideBody ?? "Your ride is starting now.",
          data: baseData,
        },
      };
    case "driver_near_pickup":
      if (!user_id) return null;
      return {
        recipients: [user_id],
        payload: {
          type,
          title: overrideTitle ?? "Driver is nearby",
          body: overrideBody ?? "Your driver is less than 2km away.",
          data: baseData,
        },
      };
    case "driver_no_show":
      if (!user_id) return null;
      return {
        recipients: [user_id],
        payload: {
          type,
          title: overrideTitle ?? "Driver did not arrive",
          body: overrideBody ?? "Your driver was a no-show. Refund issued.",
          data: baseData,
        },
      };
    case "rider_picked_up":
      if (!user_id) return null;
      return {
        recipients: [user_id],
        payload: {
          type,
          title: overrideTitle ?? "Picked up",
          body: overrideBody ?? "PIN verified. Trip in progress.",
          data: baseData,
        },
      };
    case "payout_received":
      if (!user_id) return null;
      return {
        recipients: [user_id],
        payload: {
          type,
          title: overrideTitle ?? "Payout sent",
          body: overrideBody ?? "Your earnings have been transferred to your bank.",
          data: baseData,
        },
      };
    case "booking": {
      if (!ride_id) return null;
      const ride = await fetchRide(supabase, ride_id);
      if (!ride) return null;
      return {
        recipients: [ride.driver_id],
        payload: {
          type,
          title: overrideTitle ?? "New booking!",
          body: overrideBody ?? `${rider_name} booked your ride to ${ride.to_address ?? "your destination"}.`,
          data: baseData,
        },
      };
    }
    case "custom":
      if (!user_id || !overrideTitle) return null;
      return {
        recipients: [user_id],
        payload: {
          type,
          title: overrideTitle,
          body: overrideBody ?? "",
          data: baseData,
        },
      };
    default:
      return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    // Auth: this endpoint is server-to-server only (other edge functions invoke
    // it with the service client). Without this, any anon-key holder could push
    // arbitrary notifications to any user.
    const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const authHeader = req.headers.get("Authorization") || "";
    if (!SERVICE_ROLE_KEY || authHeader !== `Bearer ${SERVICE_ROLE_KEY}`) {
      return new Response(
        JSON.stringify({ error: "service_role_required" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      SERVICE_ROLE_KEY,
    );

    const body = await req.json();
    const resolved = await resolve(supabase, body);
    if (!resolved) {
      return new Response(
        JSON.stringify({ error: "unsupported_or_missing_fields", body }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const tickets = await notifyUsers(supabase, resolved.recipients, resolved.payload);

    return new Response(
      JSON.stringify({
        success: true,
        recipients: resolved.recipients.length,
        tickets,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("send-notification failed:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "unknown_error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
