import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { supabase } from '../config/supabase';

export const RIDE_CONFIRMATION_CATEGORY_ID = 'ride_confirmation';

// --- 1. Setup and Permissions ---

// Configures the notification handler and categories when the app starts.
export async function setupNotificationHandlers() {
    // Defines the action buttons for the notification
    await Notifications.setNotificationCategoryAsync(RIDE_CONFIRMATION_CATEGORY_ID, [
        {
            identifier: 'confirm',
            buttonTitle: 'Confirm',
            options: {
                opensAppToForeground: true,
            },
        },
        {
            identifier: 'decline',
            buttonTitle: 'Not Coming',
            options: {
                opensAppToForeground: false,
                isDestructive: true,
            },
        },
    ]);

    Notifications.setNotificationHandler({
        handleNotification: async () => ({
            shouldShowBanner: true,
            shouldShowList: true,
            shouldPlaySound: true,
            shouldSetBadge: true,
        }),
    });
}


// Asks the user for permission to send push notifications.
export async function registerForPushNotificationsAsync(): Promise<string | undefined | null> {
  try {
    // On Android dev builds, FCM must be configured (google-services.json in project root
    // + googleServicesFile in app.json). Without it, getExpoPushTokenAsync will throw.
    if (Platform.OS === 'android') {
      const hasGoogleServices =
        !!(Constants as any)?.expoConfig?.android?.googleServicesFile;
      if (!hasGoogleServices) {
        console.warn(
          '🔔 Push notifications disabled: no google-services.json configured.',
          'Add googleServicesFile to app.json android config and rebuild.'
        );
        return null;
      }

      await Notifications.setNotificationChannelAsync('default', {
        name: 'default',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#FF231F7C',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      console.warn('🔔 Push permission not granted, status:', finalStatus);
      return null;
    }

    const projectId =
      (Constants as any)?.expoConfig?.extra?.eas?.projectId ||
      (Constants as any)?.easConfig?.projectId;
    console.log('🔔 Requesting Expo push token with projectId:', projectId);
    const token = (
      await Notifications.getExpoPushTokenAsync(
        projectId ? { projectId } : (undefined as any)
      )
    ).data;
    console.log('🔔 Expo Push Token obtained:', token);
    return token;
  } catch (err) {
    console.error('🔔 Push registration failed:', err);
    return null;
  }
}


// --- 2. Scheduling ---

// Schedules the interactive "Confirm your ride" notification.
export async function scheduleRideConfirmationNotification(rideId: string, driverName: string, rideTimestamp: Date) {
    const triggerDate = new Date(rideTimestamp.getTime() - 30 * 60 * 1000); // 30 minutes before the ride

    if (triggerDate < new Date()) {
        console.log("Cannot schedule notification in the past.");
        return;
    }

    // Calculate the seconds from now
    const seconds = (triggerDate.getTime() - Date.now()) / 1000;

    await Notifications.scheduleNotificationAsync({
        content: {
            title: "Upcoming Ride Reminder",
            body: `Are you ready for your ride with ${driverName}?`,
            data: { rideId: rideId, action: 'confirm_ride' },
            categoryIdentifier: RIDE_CONFIRMATION_CATEGORY_ID,
        },
        trigger: {
          type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
          seconds: Math.max(1, Math.round(seconds)),
          repeats: false,
        },
    });
    console.log(`Notification scheduled for ride ${rideId} in ${Math.round(seconds)} seconds`);
}


// --- 3. Handling Responses ---

// Adds a listener to handle taps on notification action buttons.
export function addNotificationResponseListener() {
    const responseListener = Notifications.addNotificationResponseReceivedListener(async (response) => {
        const { actionIdentifier } = response;
        const { rideId } = response.notification.request.content.data;

        if (!rideId) return;

        if (actionIdentifier === 'confirm') {
            console.log(`User CONFIRMED ride: ${rideId}`);
            // Update booking status in Supabase
            // Note: This would need the user's ID and proper authentication
        } else if (actionIdentifier === 'decline') {
            console.log(`User DECLINED ride: ${rideId}`);
            // Update booking status in Supabase
        }
    });

    return responseListener;
} 

// --- 4. Persist user push token ---

export async function upsertExpoPushToken(clerkId: string, token: string) {
  try {
    const { data, error } = await supabase
      .from('users')
      .update({
        expo_push_token: token,
        updated_at: new Date().toISOString()
      })
      .eq('clerk_id', clerkId)
      .select('id, expo_push_token')
      .single();

    if (error) {
      console.error('🔔 Error updating push token:', error);
    } else {
      console.log('🔔 Push token persisted for user', data?.id, '→', data?.expo_push_token?.slice(0, 30) + '...');
    }
  } catch (e) {
    console.error('🔔 Error in upsertExpoPushToken:', e);
  }
}
