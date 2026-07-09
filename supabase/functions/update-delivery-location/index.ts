// update-delivery-location
//
// Driver's client pings this while delivering; the row lands in
// delivery_locations (PK = order_id) which the customer app subscribes to via
// OrderService.subscribeToDeliveryLocation (supabase_realtime publication).
//
// Body: { orderId, driverId, latitude, longitude, heading?, speed? }
//   driverId = drivers.id (NOT the user id).
//
// Auth chain: Clerk JWT -> users row -> drivers row must match driverId AND
// the order's assigned driver. Writes go through the service client (RLS on
// delivery_locations also allows the owning driver, but the edge fn is the
// single choke point for validation).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, jsonResponse, requireAuth, serviceClient, resolveUserIdFromClerk } from "../_shared/edge.ts";

// Statuses during which a driver legitimately streams location.
const ACTIVE_DELIVERY_STATUSES = ["driver_assigned", "picked_up", "en_route"];

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    let callerClerkId: string;
    try {
      ({ callerClerkId } = await requireAuth(req));
    } catch (e) {
      if (e instanceof Response) return e;
      throw e;
    }

    const supabase = serviceClient();

    let body: {
      orderId?: string; driverId?: string;
      latitude?: number; longitude?: number;
      heading?: number; speed?: number;
    };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "invalid_json" }, 400);
    }

    const { orderId, driverId, latitude, longitude, heading, speed } = body;
    if (!orderId || !driverId || latitude == null || longitude == null) {
      return jsonResponse({ error: "missing_required_fields" }, 400);
    }
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) ||
        Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      return jsonResponse({ error: "invalid_coordinates" }, 400);
    }

    // Caller's users row -> drivers row must be the claimed driverId.
    const callerUserId = await resolveUserIdFromClerk(supabase, callerClerkId);
    if (!callerUserId) return jsonResponse({ error: "user_not_found" }, 404);

    const { data: driver } = await supabase
      .from("drivers")
      .select("id, user_id")
      .eq("user_id", callerUserId)
      .single();
    if (!driver || driver.id !== driverId) {
      return jsonResponse({ error: "not_authorized", details: "driverId mismatch" }, 403);
    }

    // Driver must be assigned to this order and the order still in flight.
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .select("id, driver_id, status")
      .eq("id", orderId)
      .single();
    if (orderErr || !order) return jsonResponse({ error: "order_not_found" }, 404);
    if (order.driver_id !== driverId) {
      return jsonResponse({ error: "not_authorized", details: "not assigned to this order" }, 403);
    }
    if (!ACTIVE_DELIVERY_STATUSES.includes(order.status)) {
      return jsonResponse({ error: "order_not_in_delivery", details: order.status }, 409);
    }

    // Upsert live position (one row per order).
    const { error: upsertError } = await supabase
      .from("delivery_locations")
      .upsert({
        order_id: orderId,
        driver_id: driverId,
        latitude,
        longitude,
        heading: heading ?? null,
        speed: speed ?? null,
        updated_at: new Date().toISOString(),
      }, { onConflict: "order_id" });
    if (upsertError) {
      console.error("update-delivery-location: upsert failed:", upsertError);
      return jsonResponse({ error: "upsert_failed", details: upsertError.message }, 500);
    }

    // Mirror onto the drivers row (best-effort) so seller/admin maps can show
    // the fleet without joining delivery_locations.
    const { error: mirrorErr } = await supabase
      .from("drivers")
      .update({
        current_lat: latitude,
        current_lng: longitude,
        heading: heading ?? null,
        location_updated_at: new Date().toISOString(),
      })
      .eq("id", driverId);
    if (mirrorErr) console.warn("update-delivery-location: driver mirror failed (non-fatal):", mirrorErr.message);

    return jsonResponse({ success: true });
  } catch (error) {
    console.error("update-delivery-location error:", error);
    return jsonResponse({ error: "internal_error" }, 500);
  }
});
