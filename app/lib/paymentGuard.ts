/**
 * Shared, module-level guard against firing the Stripe PaymentSheet twice for
 * the same booking.
 *
 * Both AwaitingDriverScreen and RequestMatchedPaymentScreen can attempt to open
 * a PaymentSheet for the same booking (push-tap + realtime race, or an unmount/
 * remount that resets per-instance refs). Because this Set lives at module scope
 * it survives remounts and is shared across screens, so only one PaymentSheet
 * flow can be in-flight per booking at a time.
 *
 * markInFlight() is the atomic claim: it checks-and-adds in a single synchronous
 * call, so callers must invoke it BEFORE any await. Always pair a successful
 * claim with clearInFlight() in a finally block.
 */

const inFlight = new Set<string>();

/**
 * Atomically claim the in-flight slot for a booking.
 * Returns true if the caller now owns the slot (proceed with payment).
 * Returns false if a payment flow is already in-flight for this booking (bail).
 *
 * Must be called synchronously (before any await) to preserve atomicity.
 */
export function markInFlight(bookingId: string): boolean {
  if (!bookingId) return false;
  if (inFlight.has(bookingId)) return false;
  inFlight.add(bookingId);
  return true;
}

/** Whether a payment flow is currently in-flight for this booking. */
export function isInFlight(bookingId: string): boolean {
  return inFlight.has(bookingId);
}

/** Release the in-flight slot for a booking (call in a finally block). */
export function clearInFlight(bookingId: string): void {
  inFlight.delete(bookingId);
}
