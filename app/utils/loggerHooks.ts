import { useEffect, useRef } from 'react';
import { logger } from './logger';

/**
 * Log screen mount/unmount with optional params.
 * Drop one line in any screen body: useScreenLogger('CheckoutScreen', { rideId });
 */
export function useScreenLogger(screenName: string, params?: Record<string, any>) {
  const mountedAt = useRef<number>(0);
  useEffect(() => {
    mountedAt.current = Date.now();
    logger.info('Navigation', `🟢 mount ${screenName}`, params);
    return () => {
      const dur = Date.now() - mountedAt.current;
      logger.info('Navigation', `🔴 unmount ${screenName}`, { ...params, durationMs: dur });
    };
    // params intentionally not in deps — only initial values matter for mount log
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}

/**
 * Wrap an onPress handler with a tagged log line. Returns a stable function.
 *
 * Example:
 *   const onAccept = useLoggedPress('DriverTripPrep:Accept', { rideId }, async () => {...});
 */
export function logPress<T extends (...args: any[]) => any>(
  label: string,
  data: Record<string, any> | undefined,
  fn: T
): T {
  return (async (...args: any[]) => {
    logger.info('UI', `👆 ${label}`, data);
    try {
      const out = await fn(...args);
      return out;
    } catch (e: any) {
      logger.error('UI', `👆 ${label} threw`, { error: e?.message || String(e) });
      throw e;
    }
  }) as unknown as T;
}
