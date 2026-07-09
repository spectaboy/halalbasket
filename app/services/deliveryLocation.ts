// Driver-side live location broadcast during a delivery.
// Same pattern as URide's DriverLocationService: expo-location watch at
// 5s / 10m granularity, pushed through the update-delivery-location edge
// function (service-role write to delivery_locations, realtime fan-out).

import * as Location from 'expo-location';
import { supabase } from '../config/supabase';
import { logger } from '../utils/logger';

export class DeliveryLocationService {
  private static watcher: Location.LocationSubscription | null = null;
  private static activeOrderId: string | null = null;

  static async startTracking(orderId: string, driverId: string): Promise<boolean> {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      logger.error('DeliveryLoc', 'location permission denied');
      return false;
    }
    this.stopTracking();
    this.activeOrderId = orderId;
    this.watcher = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 5000,
        distanceInterval: 10,
      },
      (pos) => {
        void this.pushLocation(orderId, driverId, pos);
      }
    );
    logger.info('DeliveryLoc', 'tracking started', { orderId });
    return true;
  }

  static stopTracking(): void {
    this.watcher?.remove();
    this.watcher = null;
    this.activeOrderId = null;
  }

  static getIsTracking(): boolean {
    return this.watcher !== null;
  }

  private static async pushLocation(orderId: string, driverId: string, pos: Location.LocationObject) {
    const { error } = await supabase.functions.invoke('update-delivery-location', {
      body: {
        orderId,
        driverId,
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        heading: pos.coords.heading,
        speed: pos.coords.speed,
      },
    });
    if (error) logger.error('DeliveryLoc', 'push failed', { error: error.message });
  }
}
