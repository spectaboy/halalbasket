import 'react-native-url-polyfill/auto';
import React, { useEffect } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { StripeProvider } from '@stripe/stripe-react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useFonts } from 'expo-font';
import { fontAssets } from './constants/typography';
import BrandLoadingScreen from './app/components/ui/BrandLoadingScreen';

import { ClerkProviderWrapper } from './app/config/clerk';
import { NotificationProvider } from './app/components/ui/Notify';
import { SessionProvider } from './app/context/SessionContext';
import { CartProvider } from './app/context/CartContext';
import { DemoProvider, useDemo } from './app/demo/DemoContext';
import RootNavigator from './app/navigation/RootNavigator';
import { navigationRef, navigateToScreen } from './app/navigation/navigationRef';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Route a tapped push notification to the right screen. */
function routeNotificationTap(data: Record<string, any> | undefined) {
  if (!data?.type) return;
  const orderId = data.orderId as string | undefined;
  switch (data.type) {
    case 'order_status':
    case 'order_delivered':
      if (orderId) navigateToScreen('OrderTracking', { orderId });
      break;
    case 'new_order':
      if (orderId) navigateToScreen('SellerOrderDetail', { orderId });
      break;
    case 'delivery_assigned':
      if (orderId) navigateToScreen('ActiveDelivery', { orderId });
      break;
    case 'seller_approved':
    case 'seller_rejected':
      navigateToScreen('SellerTabs');
      break;
    case 'driver_approved':
    case 'driver_rejected':
      navigateToScreen('DriverTabs');
      break;
    default:
      break;
  }
}

export default function App() {
  const [fontsLoaded, fontError] = useFonts(fontAssets);
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      routeNotificationTap(response.notification.request.content.data as any);
    });
    return () => sub.remove();
  }, []);

  if (!fontsLoaded && !fontError) {
    return (
      <SafeAreaProvider>
        <StatusBar style="dark" />
        <BrandLoadingScreen fontsReady={false} />
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <ClerkProviderWrapper>
        <StripeProvider
          publishableKey={process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || ''}
          merchantIdentifier="merchant.halalbasket.app"
          urlScheme={(Constants as any)?.expoConfig?.scheme || 'halalbasket'}
        >
          <SessionProvider>
            <DemoProvider>
              <MarketplaceApp />
            </DemoProvider>
          </SessionProvider>
        </StripeProvider>
      </ClerkProviderWrapper>
    </SafeAreaProvider>
  );
}

function MarketplaceApp() {
  const demo = useDemo();
  if (!demo.ready) return <BrandLoadingScreen />;
  // A mode switch discards navigation and basket state, keeping the two marketplaces isolated.
  return (
    <CartProvider key={demo.enabled ? 'demo' : 'live'}>
      <NotificationProvider>
        <NavigationContainer ref={navigationRef}>
          <StatusBar style="dark" />
          <RootNavigator />
        </NavigationContainer>
      </NotificationProvider>
    </CartProvider>
  );
}
