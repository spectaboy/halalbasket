// notify-order-status
//
// Server-to-server fan-out for order lifecycle pushes. Invoked by other edge
// functions or a Supabase DB webhook on orders.status changes.
//
// Body: { orderId, status }
//
// Routing:
//   accepted / preparing / ready / picked_up / en_route / delivered
//     -> push to the CUSTOMER (type 'order_status')
//   driver_assigned
//     -> push to the DRIVER's user (type 'driver_assigned') + a courtesy
//        'order_status' push to the customer.
//
// notifyUser (_shared/notify.ts) writes the durable notifications inbox row
// AND best-effort pushes to Expo, so both requirements are covered in one call.
//
// Auth: service_role bearer only (deploy with --no-verify-jwt when targeted
// by a DB webhook; the webhook must send the service-role Authorization header).

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders, jsonResponse, serviceClient } from "../_shared/edge.ts";
import { notifyUser } from "../_shared/notify.ts";

const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
if (!SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY is not set");

const CUSTOMER_MESSAGES: Record<string, { title: string; body: string }> = {
  accepted:        { title: "Order accepted",  body: "The seller accepted your order and will start preparing it." },
  preparing:       { title: "Being prepared",  body: "Your order is being prepared." },
  ready:           { title: "Order ready",     body: "Your order is packed and ready for pickup by your driver." },
  driver_assigned: { title: "Driver assigned", body: "A driver has been assigned to your order." },
  picked_up:       { title: "Order picked up", body: "Your driver has picked up your order." },
  en_route:        { title: "On the way",      body: "Your order is on its way to you." },
  delivered:       { title: "Delivered",       body: "Your order has been delivered. Enjoy!" },
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("authorization") ?? "";
  if (authHeader !== `Bearer ${SERVICE_ROLE_KEY}`) {
    return jsonResponse({ error: "service_role_required" }, 403);
  }

  try {
    let body: { orderId?: string; status?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse({ error: "invalid_json" }, 400);
    }
    const { orderId, status } = body;
    if (!orderId || !status) return jsonResponse({ error: "missing_orderId_or_status" }, 400);
    if (!CUSTOMER_MESSAGES[status]) {
      return jsonResponse({ error: "unsupported_status", details: status }, 400);
    }

    const supabase = serviceClient();

    const { data: order, error: oErr } = await supabase
      .from("orders")
      .select("id, customer_id, driver_id, status")
      .eq("id", orderId)
      .single();
    if (oErr || !order) return jsonResponse({ error: "order_not_found" }, 404);

    const notified: string[] = [];

    // Customer push (inbox row + Expo, both via notifyUser).
    const msg = CUSTOMER_MESSAGES[status];
    if (order.customer_id) {
      await notifyUser(supabase, order.customer_id, {
        type: "order_status",
        title: msg.title,
        body: msg.body,
        data: { orderId, status },
      });
      notified.push("customer");
    }

    // Driver push on assignment.
    if (status === "driver_assigned" && order.driver_id) {
      const { data: driver } = await supabase
        .from("drivers")
        .select("user_id")
        .eq("id", order.driver_id)
        .single();
      if (driver?.user_id) {
        await notifyUser(supabase, driver.user_id, {
          type: "driver_assigned",
          title: "New delivery",
          body: "You've been assigned a delivery. Head to the pickup location.",
          data: { orderId, status },
        });
        notified.push("driver");
      }
    }

    return jsonResponse({ success: true, orderId, status, notified });
  } catch (err) {
    console.error("notify-order-status failed:", err);
    return jsonResponse(
      { error: err instanceof Error ? err.message : "unknown_error" },
      500,
    );
  }
});
