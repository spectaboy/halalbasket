// Route contract for all four surfaces. Screen builders code against these
// names/params; RootNavigator registers them.

import type { NavigatorScreenParams } from '@react-navigation/native';
import type { SellerType } from '../types/database';

// ---------- Auth ----------
export type AuthStackParamList = {
  Welcome: undefined;
  SignIn: undefined;
  SignUp: undefined;
  VerifyEmail: { email: string };
  CompleteProfile: undefined; // name + phone after Clerk signup
};

// ---------- Customer ----------
export type CustomerTabParamList = {
  Home: undefined;
  Search: { initialQuery?: string; savedOnly?: boolean } | undefined;
  Orders: undefined;
  Profile: undefined;
};

// ---------- Seller ----------
export type SellerTabParamList = {
  SellerDashboard: undefined;
  SellerListings: undefined;
  SellerOrders: undefined;
  SellerProfile: undefined;
};

// ---------- Driver ----------
export type DriverTabParamList = {
  DriverHome: undefined;
  DriverDeliveries: undefined;
  DriverEarnings: undefined;
  DriverProfile: undefined;
};

// ---------- Admin ----------
export type AdminTabParamList = {
  AdminDashboard: undefined;
  AdminSellers: undefined;
  AdminDrivers: undefined;
  AdminOrders: undefined;
};

// ---------- Main (everything post-auth) ----------
export type MainStackParamList = {
  CustomerTabs: NavigatorScreenParams<CustomerTabParamList>;
  SellerTabs: NavigatorScreenParams<SellerTabParamList>;
  DriverTabs: NavigatorScreenParams<DriverTabParamList>;
  AdminTabs: NavigatorScreenParams<AdminTabParamList>;

  // customer modal flow
  SellerDetail: { sellerId: string };
  ListingDetail: { listingId: string; sellerId: string };
  PreOrderWindowDetail: { windowId: string; sellerId: string };
  Cart: undefined;
  Checkout: undefined;
  OrderConfirmation: { orderId: string };
  OrderTracking: { orderId: string };
  LeaveReview: { orderId: string; sellerId: string; sellerName: string };
  CategoryBrowse: { sellerType: SellerType };

  // seller onboarding + management
  SellerOnboarding: undefined; // type selection -> docs -> submit
  SellerVerificationPending: undefined;
  EditListing: { listingId?: string }; // create when undefined
  CreatePreOrderWindow: { windowId?: string };
  SellerOrderDetail: { orderId: string };
  SellerEarnings: undefined;
  SellerCompliance: undefined; // home-cook progression tracker

  // driver onboarding + delivery
  DriverOnboarding: undefined;
  DriverVerificationPending: undefined;
  ActiveDelivery: { orderId: string };

  // admin detail
  AdminSellerReview: { sellerId: string };
  AdminDriverReview: { driverId: string };
  AdminOrderDetail: { orderId: string };

  // shared
  EditProfile: undefined;
  StripeConnect: undefined;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  Main: NavigatorScreenParams<MainStackParamList>;
};
