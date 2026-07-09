# HalalBasket build brief (for screen builders)

HalalBasket is a halal-only three-sided marketplace (customers / sellers / drivers + admin) built on
Expo RN 0.79 + Clerk + Supabase + Stripe + Mapbox. It inherits URide's architecture and design system.
Reference spec: `../HalalHub_Phase1_Spec (1).md`. URide source (read-only reference): `../uride-repo`.

## Non-negotiable conventions

- **Design language**: light theme from `constants/theme.ts` (`lightColors`). Primary `#1A5C38`,
  inputs `#F2F9F5`, chips `#EAF5EE`, muted text `#6B8070`, error `#E74C3C`. Cards: radius 16,
  padding 16, 1px border `rgba(0,0,0,0.06)`. Buttons: radius 12, paddingVertical 16, fontWeight 700.
  Sheets: top radius 20. Use `StyleSheet.create`, NOT tailwind classes. Icons: `@expo/vector-icons` Ionicons.
- **Screen shell**: `SafeAreaView` from `react-native-safe-area-context`, optional
  `<BackgroundPattern />` (absolute, pointerEvents none), header row (back button + 20px/800 title),
  content, bottom action bar padded by safe inset.
- **Default exports**: every screen file default-exports a React component. Navigation prop typing via
  `NativeStackScreenProps<MainStackParamList, 'RouteName'>` from `app/navigation/types.ts`.
- **Data**: import `supabase` from `app/config/supabase`; types from `app/types/database.ts`.
  Toasts via `notify` from `app/lib/notify` (`notify.success/.error/.confirm`). Logging via
  `logger` from `app/utils/logger`.
- **Session**: `useSession()` from `app/context/SessionContext` → `{ user, seller, driver, mode, setMode, refresh }`.
  `user` is the Supabase users row (already ensured on sign-in).
- **Realtime**: use `OrderService` from `app/services/orders.ts` (subscribe helpers + status transitions +
  `ORDER_STATUS_LABELS`). Always `supabase.removeChannel(ch)` in effect cleanup.
- **Money**: `getPlatformFees()` / `quoteOrder()` / `formatMoney()` from `app/utils/pricing.ts`.
- **Docs upload**: `ProfileService.uploadVerificationDoc` / `uploadListingImage` from `app/services/profile.ts`
  (base64 from `expo-image-picker` with `base64: true`).
- **Maps**: `DeliveryMapView` from `app/components/DeliveryMapView.tsx` (markers + polyline + fitToRoute).
  Driver live position: `OrderService.subscribeToDeliveryLocation(orderId, cb)`.

## Domain rules (from the spec — enforce in UI)

- Seller types: `restaurant`, `butcher`, `home_cook`. Restaurants/butchers = real-time orders,
  hours + prep time. Home cooks = pre-order windows ONLY (cook date, cutoff, min orders, pickup-ready time).
- Listing visibility: seller `verification_status='approved'` AND (listing `is_low_risk` OR seller
  `permit_status='approved'`). Customers browse via the `visible_listings` view and `public_sellers` view.
- Home-cook compliance ladder (`permit_status`): none → course_done → permit_applied →
  inspection_scheduled → approved. Show progression UI + "unlock full meal listings" prompts.
- Commission: sellers carry `commission_rate` (home cooks 0). Customer always pays delivery + service fee.
- Order statuses: pending_payment → paid → accepted → preparing → ready → driver_assigned →
  picked_up → en_route → delivered (or cancelled/refunded).
- One-seller cart (`useCart()` from `app/context/CartContext`): adding from a second seller returns
  false → confirm "start a new basket?" then `replaceCart`.

## What already exists (do NOT recreate)

`App.tsx`, `RootNavigator`, contexts, services above, `pricing`, `database.ts` types,
`DeliveryMapView`, `BackgroundPattern`, `LocationPickerModal`, `DateTimePickerSheet`,
`DesignSystem.ts`, `Notify`, `FieldError`, config (clerk/supabase/mapbox), SQL schema in
`supabase/migrations/20260708000000_initial_schema.sql` (read it — it is the source of truth).
