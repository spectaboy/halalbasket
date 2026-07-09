// _shared/notify.ts
//
// Single notification helper: writes the in-app inbox row AND best-effort
// pushes to Expo. Inbox insert is durable; push is fire-and-forget.
// On Expo "DeviceNotRegistered" the offending users.expo_push_token is
// nulled to stop accumulating dead tokens.
//
// Mirror of app/lib/notificationTypes.ts NotificationType — keep in sync.

import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type NotificationType =
  | "booking_request"
  | "booking_accepted"
  | "booking_rejected"
  | "booking_expired"
  | "booking_cancelled"
  | "driver_cancelled"
  | "ride_started"
  | "ride_reminder_1h"
  | "ride_reminder_15m"
  | "ride_starting_soon"
  | "ride_completed"
  | "ride_request_nearby"
  | "ride_match"
  | "ride_request_matched"
  | "refund_processed"
  | "driver_arrived"
  | "driver_near_pickup"
  | "driver_no_show"
  | "rider_no_show"
  | "rider_picked_up"
  | "payout_received"
  | "booking_awaiting_payment"
  | "payment_window_expired"
  | "booking"
  // HalalBasket order lifecycle
  | "new_order"
  | "order_status"
  | "driver_assigned"
  | "custom";

export interface NotifyPayload {
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const EXPO_BATCH_LIMIT = 100;

interface ExpoTicket {
  status: "ok" | "error";
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface UserRow {
  id: string;
  expo_push_token: string | null;
}

async function fetchTokens(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<UserRow[]> {
  if (userIds.length === 0) return [];
  const { data, error } = await supabase
    .from("users")
    .select("id, expo_push_token")
    .in("id", userIds);
  if (error) {
    console.error("notify.fetchTokens failed:", error.message);
    return [];
  }
  return (data ?? []) as UserRow[];
}

async function insertInboxRows(
  supabase: SupabaseClient,
  userIds: string[],
  payload: NotifyPayload,
): Promise<void> {
  if (userIds.length === 0) return;
  const rows = userIds.map((uid) => ({
    user_id: uid,
    type: payload.type,
    title: payload.title,
    body: payload.body,
    data: payload.data ?? {},
  }));
  const { error } = await supabase.from("notifications").insert(rows);
  if (error) {
    console.warn("notify.insertInbox failed (non-fatal):", error.message);
  }
}

async function sendExpoBatch(
  supabase: SupabaseClient,
  rows: UserRow[],
  payload: NotifyPayload,
): Promise<string[]> {
  const ticketIds: string[] = [];
  const withTokens = rows.filter((r) => !!r.expo_push_token);
  if (withTokens.length === 0) return ticketIds;

  // Expo accepts an array of messages in one POST (up to ~100).
  for (let i = 0; i < withTokens.length; i += EXPO_BATCH_LIMIT) {
    const slice = withTokens.slice(i, i + EXPO_BATCH_LIMIT);
    const messages = slice.map((u) => ({
      to: u.expo_push_token,
      sound: "default",
      title: payload.title,
      body: payload.body,
      data: { type: payload.type, ...(payload.data ?? {}) },
    }));

    try {
      const resp = await fetch(EXPO_PUSH_URL, {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Accept-encoding": "gzip, deflate",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(messages),
      });
      const json = await resp.json().catch(() => ({}));
      const tickets: ExpoTicket[] = Array.isArray(json?.data)
        ? json.data
        : json?.data
        ? [json.data]
        : [];

      // Cleanup dead tokens reported by Expo + collect ok ticket ids.
      const deadUserIds: string[] = [];
      tickets.forEach((t, idx) => {
        if (t?.status === "ok" && t.id) ticketIds.push(t.id);
        if (
          t?.status === "error" &&
          (t?.details?.error === "DeviceNotRegistered" ||
            t?.message?.includes("not a registered push notification recipient"))
        ) {
          const u = slice[idx];
          if (u) deadUserIds.push(u.id);
        }
      });
      if (deadUserIds.length > 0) {
        const { error: clearErr } = await supabase
          .from("users")
          .update({ expo_push_token: null })
          .in("id", deadUserIds);
        if (clearErr) {
          console.warn("notify.clearDeadTokens failed:", clearErr.message);
        } else {
          console.log(`notify: cleared ${deadUserIds.length} dead push tokens`);
        }
      }
    } catch (err) {
      console.warn(
        "notify.sendExpo failed (non-fatal):",
        err instanceof Error ? err.message : String(err),
      );
    }
  }
  return ticketIds;
}

/**
 * Send a notification to one user. Returns Expo ticket IDs (for debug).
 * Inbox row is always written. Push is best-effort.
 */
export async function notifyUser(
  supabase: SupabaseClient,
  userId: string,
  payload: NotifyPayload,
): Promise<string[]> {
  return await notifyUsers(supabase, [userId], payload);
}

/**
 * Send a notification to many users. One inbox row per user, batched Expo
 * push (up to 100 per HTTP call). Returns Expo ticket IDs.
 */
export async function notifyUsers(
  supabase: SupabaseClient,
  userIds: string[],
  payload: NotifyPayload,
): Promise<string[]> {
  // Notification delivery is always best-effort and must NEVER throw back to the
  // caller: some callers (e.g. the emergency-report path) run inside a
  // transaction where a thrown notify error would roll back a must-have write.
  try {
    const unique = Array.from(new Set(userIds.filter(Boolean)));
    if (unique.length === 0) return [];
    await insertInboxRows(supabase, unique, payload);
    const rows = await fetchTokens(supabase, unique);
    return await sendExpoBatch(supabase, rows, payload);
  } catch (err) {
    console.warn(
      "notify.notifyUsers failed (non-fatal):",
      err instanceof Error ? err.message : String(err),
    );
    return [];
  }
}
