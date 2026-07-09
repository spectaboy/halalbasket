import { useCallback, useState, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import * as Location from 'expo-location';

interface LocationCoords {
  latitude: number;
  longitude: number;
}

const POLL_INTERVAL = 10000; // 10s between polls

/**
 * Hook that returns the device's REAL current location and auto-updates via polling.
 * Uses getCurrentPositionAsync on a timer instead of watchPositionAsync to avoid
 * the Android native event-emitter crash (expo-location module registry teardown race).
 * Returns null if location cannot be determined — NEVER returns fake/hardcoded coordinates.
 *
 * Polling only runs while the calling screen is FOCUSED. RN stack screens stay
 * mounted in the background, so tying the poll to focus (via useFocusEffect)
 * stops off-screen screens from continuously hitting the GPS (battery drain).
 */
export function useCurrentLocation() {
  const [location, setLocation] = useState<LocationCoords | null>(null);
  const [loading, setLoading] = useState(true);
  const mounted = useRef(true);

  useFocusEffect(
    useCallback(() => {
      mounted.current = true;
      let timer: ReturnType<typeof setInterval> | null = null;

      (async () => {
        try {
          const { status } = await Location.requestForegroundPermissionsAsync();
          if (status !== 'granted') {
            if (mounted.current) setLoading(false);
            return;
          }

          // Get initial position quickly from cache
          try {
            const lastKnown = await Location.getLastKnownPositionAsync({});
            if (lastKnown && mounted.current) {
              setLocation({ latitude: lastKnown.coords.latitude, longitude: lastKnown.coords.longitude });
              setLoading(false);
            }
          } catch {
            // No cached position, will get it from poll
          }

          // Fetch current position once immediately
          const fetchPos = async () => {
            try {
              const pos = await Location.getCurrentPositionAsync({
                accuracy: Location.Accuracy.Balanced,
              });
              if (mounted.current) {
                setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
                setLoading(false);
              }
            } catch {
              // GPS may be temporarily unavailable; keep last known
            }
          };

          await fetchPos();

          // Only start polling if the screen is still focused (mounted flag is
          // flipped to false by the cleanup below when the screen blurs/unmounts).
          if (mounted.current) {
            timer = setInterval(fetchPos, POLL_INTERVAL);
          }
        } catch {
          if (mounted.current) setLoading(false);
        }
      })();

      // Runs on blur (screen loses focus) and on unmount: stop polling.
      return () => {
        mounted.current = false;
        if (timer) clearInterval(timer);
      };
    }, [])
  );

  return { location, loading };
}
