import React from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import { lightColors } from '../../constants/theme';
import { useSession } from '../context/SessionContext';
import type {
  AdminTabParamList,
  AuthStackParamList,
  CustomerTabParamList,
  DriverTabParamList,
  MainStackParamList,
  RootStackParamList,
  SellerTabParamList,
} from './types';

// auth
import WelcomeScreen from '../auth/WelcomeScreen';
import SignInScreen from '../auth/SignInScreen';
import SignUpScreen from '../auth/SignUpScreen';
import VerifyEmailScreen from '../auth/VerifyEmailScreen';
import CompleteProfileScreen from '../auth/CompleteProfileScreen';

// customer
import HomeScreen from '../customer/HomeScreen';
import SearchScreen from '../customer/SearchScreen';
import OrdersScreen from '../customer/OrdersScreen';
import CategoryBrowseScreen from '../customer/CategoryBrowseScreen';
import SellerDetailScreen from '../customer/SellerDetailScreen';
import ListingDetailScreen from '../customer/ListingDetailScreen';
import PreOrderWindowDetailScreen from '../customer/PreOrderWindowDetailScreen';
import CartScreen from '../customer/CartScreen';
import CheckoutScreen from '../customer/CheckoutScreen';
import OrderConfirmationScreen from '../customer/OrderConfirmationScreen';
import OrderTrackingScreen from '../customer/OrderTrackingScreen';
import LeaveReviewScreen from '../customer/LeaveReviewScreen';

// seller
import SellerDashboardScreen from '../seller/SellerDashboardScreen';
import SellerListingsScreen from '../seller/SellerListingsScreen';
import SellerOrdersScreen from '../seller/SellerOrdersScreen';
import SellerProfileScreen from '../seller/SellerProfileScreen';
import SellerOnboardingScreen from '../seller/SellerOnboardingScreen';
import SellerVerificationPendingScreen from '../seller/SellerVerificationPendingScreen';
import EditListingScreen from '../seller/EditListingScreen';
import CreatePreOrderWindowScreen from '../seller/CreatePreOrderWindowScreen';
import SellerOrderDetailScreen from '../seller/SellerOrderDetailScreen';
import SellerEarningsScreen from '../seller/SellerEarningsScreen';
import SellerComplianceScreen from '../seller/SellerComplianceScreen';

// driver
import DriverHomeScreen from '../driver/DriverHomeScreen';
import DriverDeliveriesScreen from '../driver/DriverDeliveriesScreen';
import DriverEarningsScreen from '../driver/DriverEarningsScreen';
import DriverProfileScreen from '../driver/DriverProfileScreen';
import DriverOnboardingScreen from '../driver/DriverOnboardingScreen';
import DriverVerificationPendingScreen from '../driver/DriverVerificationPendingScreen';
import ActiveDeliveryScreen from '../driver/ActiveDeliveryScreen';

// admin
import AdminDashboardScreen from '../admin/AdminDashboardScreen';
import AdminSellersScreen from '../admin/AdminSellersScreen';
import AdminDriversScreen from '../admin/AdminDriversScreen';
import AdminOrdersScreen from '../admin/AdminOrdersScreen';
import AdminSellerReviewScreen from '../admin/AdminSellerReviewScreen';
import AdminDriverReviewScreen from '../admin/AdminDriverReviewScreen';
import AdminOrderDetailScreen from '../admin/AdminOrderDetailScreen';

// shared profile
import ProfileScreen from '../profile/ProfileScreen';
import EditProfileScreen from '../profile/EditProfileScreen';
import StripeConnectScreen from '../profile/StripeConnectScreen';

const RootStack = createNativeStackNavigator<RootStackParamList>();
const AuthStack = createNativeStackNavigator<AuthStackParamList>();
const MainStack = createNativeStackNavigator<MainStackParamList>();
const CustomerTab = createBottomTabNavigator<CustomerTabParamList>();
const SellerTab = createBottomTabNavigator<SellerTabParamList>();
const DriverTab = createBottomTabNavigator<DriverTabParamList>();
const AdminTab = createBottomTabNavigator<AdminTabParamList>();

const tabScreenOptions = {
  headerShown: false,
  tabBarActiveTintColor: lightColors.primary,
  tabBarInactiveTintColor: lightColors.textMuted,
  tabBarStyle: { backgroundColor: lightColors.surface },
} as const;

function tabIcon(name: keyof typeof Ionicons.glyphMap) {
  return ({ color, size }: { color: string; size: number }) => (
    <Ionicons name={name} size={size} color={color} />
  );
}

function CustomerTabs() {
  return (
    <CustomerTab.Navigator screenOptions={tabScreenOptions}>
      <CustomerTab.Screen name="Home" component={HomeScreen} options={{ tabBarIcon: tabIcon('home') }} />
      <CustomerTab.Screen name="Search" component={SearchScreen} options={{ tabBarIcon: tabIcon('search') }} />
      <CustomerTab.Screen name="Orders" component={OrdersScreen} options={{ tabBarIcon: tabIcon('receipt-outline') }} />
      <CustomerTab.Screen name="Profile" component={ProfileScreen} options={{ tabBarIcon: tabIcon('person-outline') }} />
    </CustomerTab.Navigator>
  );
}

function SellerTabs() {
  return (
    <SellerTab.Navigator screenOptions={tabScreenOptions}>
      <SellerTab.Screen name="SellerDashboard" component={SellerDashboardScreen} options={{ title: 'Dashboard', tabBarIcon: tabIcon('grid-outline') }} />
      <SellerTab.Screen name="SellerListings" component={SellerListingsScreen} options={{ title: 'Listings', tabBarIcon: tabIcon('list-outline') }} />
      <SellerTab.Screen name="SellerOrders" component={SellerOrdersScreen} options={{ title: 'Orders', tabBarIcon: tabIcon('receipt-outline') }} />
      <SellerTab.Screen name="SellerProfile" component={SellerProfileScreen} options={{ title: 'Profile', tabBarIcon: tabIcon('person-outline') }} />
    </SellerTab.Navigator>
  );
}

function DriverTabs() {
  return (
    <DriverTab.Navigator screenOptions={tabScreenOptions}>
      <DriverTab.Screen name="DriverHome" component={DriverHomeScreen} options={{ title: 'Deliver', tabBarIcon: tabIcon('navigate-outline') }} />
      <DriverTab.Screen name="DriverDeliveries" component={DriverDeliveriesScreen} options={{ title: 'Deliveries', tabBarIcon: tabIcon('cube-outline') }} />
      <DriverTab.Screen name="DriverEarnings" component={DriverEarningsScreen} options={{ title: 'Earnings', tabBarIcon: tabIcon('cash-outline') }} />
      <DriverTab.Screen name="DriverProfile" component={DriverProfileScreen} options={{ title: 'Profile', tabBarIcon: tabIcon('person-outline') }} />
    </DriverTab.Navigator>
  );
}

function AdminTabs() {
  return (
    <AdminTab.Navigator screenOptions={tabScreenOptions}>
      <AdminTab.Screen name="AdminDashboard" component={AdminDashboardScreen} options={{ title: 'Overview', tabBarIcon: tabIcon('grid-outline') }} />
      <AdminTab.Screen name="AdminSellers" component={AdminSellersScreen} options={{ title: 'Sellers', tabBarIcon: tabIcon('storefront-outline') }} />
      <AdminTab.Screen name="AdminDrivers" component={AdminDriversScreen} options={{ title: 'Drivers', tabBarIcon: tabIcon('car-outline') }} />
      <AdminTab.Screen name="AdminOrders" component={AdminOrdersScreen} options={{ title: 'Orders', tabBarIcon: tabIcon('receipt-outline') }} />
    </AdminTab.Navigator>
  );
}

function AuthNavigator() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }} initialRouteName="Welcome">
      <AuthStack.Screen name="Welcome" component={WelcomeScreen} />
      <AuthStack.Screen name="SignIn" component={SignInScreen} />
      <AuthStack.Screen name="SignUp" component={SignUpScreen} />
      <AuthStack.Screen name="VerifyEmail" component={VerifyEmailScreen} />
      <AuthStack.Screen name="CompleteProfile" component={CompleteProfileScreen} />
    </AuthStack.Navigator>
  );
}

function MainNavigator() {
  const { mode } = useSession();
  const initialTabs =
    mode === 'admin' ? 'AdminTabs' : mode === 'seller' ? 'SellerTabs' : mode === 'driver' ? 'DriverTabs' : 'CustomerTabs';

  return (
    <MainStack.Navigator screenOptions={{ headerShown: false }} initialRouteName={initialTabs} key={initialTabs}>
      <MainStack.Screen name="CustomerTabs" component={CustomerTabs} />
      <MainStack.Screen name="SellerTabs" component={SellerTabs} />
      <MainStack.Screen name="DriverTabs" component={DriverTabs} />
      <MainStack.Screen name="AdminTabs" component={AdminTabs} />

      <MainStack.Screen name="CategoryBrowse" component={CategoryBrowseScreen} />
      <MainStack.Screen name="SellerDetail" component={SellerDetailScreen} />
      <MainStack.Screen name="ListingDetail" component={ListingDetailScreen} options={{ presentation: 'modal' }} />
      <MainStack.Screen name="PreOrderWindowDetail" component={PreOrderWindowDetailScreen} />
      <MainStack.Screen name="Cart" component={CartScreen} options={{ presentation: 'modal' }} />
      <MainStack.Screen name="Checkout" component={CheckoutScreen} />
      <MainStack.Screen name="OrderConfirmation" component={OrderConfirmationScreen} />
      <MainStack.Screen name="OrderTracking" component={OrderTrackingScreen} />
      <MainStack.Screen name="LeaveReview" component={LeaveReviewScreen} options={{ presentation: 'modal' }} />

      <MainStack.Screen name="SellerOnboarding" component={SellerOnboardingScreen} />
      <MainStack.Screen name="SellerVerificationPending" component={SellerVerificationPendingScreen} />
      <MainStack.Screen name="EditListing" component={EditListingScreen} options={{ presentation: 'modal' }} />
      <MainStack.Screen name="CreatePreOrderWindow" component={CreatePreOrderWindowScreen} options={{ presentation: 'modal' }} />
      <MainStack.Screen name="SellerOrderDetail" component={SellerOrderDetailScreen} />
      <MainStack.Screen name="SellerEarnings" component={SellerEarningsScreen} />
      <MainStack.Screen name="SellerCompliance" component={SellerComplianceScreen} />

      <MainStack.Screen name="DriverOnboarding" component={DriverOnboardingScreen} />
      <MainStack.Screen name="DriverVerificationPending" component={DriverVerificationPendingScreen} />
      <MainStack.Screen name="ActiveDelivery" component={ActiveDeliveryScreen} />

      <MainStack.Screen name="AdminSellerReview" component={AdminSellerReviewScreen} />
      <MainStack.Screen name="AdminDriverReview" component={AdminDriverReviewScreen} />
      <MainStack.Screen name="AdminOrderDetail" component={AdminOrderDetailScreen} />

      <MainStack.Screen name="EditProfile" component={EditProfileScreen} />
      <MainStack.Screen name="StripeConnect" component={StripeConnectScreen} />
    </MainStack.Navigator>
  );
}

// Signed-in users without a completed profile (fresh signups) land here before Main.
function CompleteProfileGate() {
  return (
    <AuthStack.Navigator screenOptions={{ headerShown: false }}>
      <AuthStack.Screen name="CompleteProfile" component={CompleteProfileScreen} />
    </AuthStack.Navigator>
  );
}

export default function RootNavigator() {
  const { isLoaded, isSignedIn } = useAuth();
  const { loading, user } = useSession();

  if (!isLoaded || (isSignedIn && loading)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: lightColors.background }}>
        <ActivityIndicator size="large" color={lightColors.primary} />
      </View>
    );
  }

  const needsProfile = isSignedIn && user && !user.first_name;

  return (
    <RootStack.Navigator screenOptions={{ headerShown: false }}>
      {!isSignedIn ? (
        <RootStack.Screen name="Auth" component={AuthNavigator} />
      ) : needsProfile ? (
        <RootStack.Screen name="Auth" component={CompleteProfileGate} />
      ) : (
        <RootStack.Screen name="Main" component={MainNavigator} />
      )}
    </RootStack.Navigator>
  );
}
