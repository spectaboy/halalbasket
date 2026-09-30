import React, { useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '@clerk/clerk-expo';
import type { MainStackParamList } from '../navigation/types';
import { lightColors as c } from '../../constants/theme';
import { fonts } from '../../constants/typography';
import { useSession } from '../context/SessionContext';
import { notify } from '../lib/notify';
import { useDemo } from '../demo/DemoContext';
import { useCart } from '../context/CartContext';
import DemoAddress from '../demo/DemoAddress';
import { BrandWordmark, discoveryImages } from '../components/ui/Discovery';
import ProfileAvatar, { profileInitials } from './ProfileAvatar';

type Nav = NativeStackNavigationProp<MainStackParamList>;
type Icon = keyof typeof Ionicons.glyphMap;

function Row({
  icon,
  label,
  detail,
  onPress,
  last = false,
}: {
  icon: Icon;
  label: string;
  detail: string;
  onPress: () => void;
  last?: boolean;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={detail}
      style={[s.row, !last && s.rowBorder]}
      onPress={onPress}
      activeOpacity={0.75}
    >
      <View style={s.rowIcon}>
        <Ionicons name={icon} size={22} color={c.primary} />
      </View>
      <View style={s.rowBody}>
        <Text style={s.rowTitle}>{label}</Text>
        <Text style={s.detail}>{detail}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={c.textMuted} />
    </TouchableOpacity>
  );
}

function Shortcut({
  icon,
  title,
  detail,
  onPress,
  warm = false,
}: {
  icon: Icon;
  title: string;
  detail: string;
  onPress: () => void;
  warm?: boolean;
}) {
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityHint={detail}
      style={[s.shortcut, warm && s.shortcutWarm]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={s.shortcutTop}>
        <Ionicons name={icon} size={25} color={warm ? '#995A26' : c.primary} />
        <Ionicons name="arrow-forward" size={18} color={warm ? '#995A26' : c.primary} />
      </View>
      <Text style={s.shortcutTitle}>{title}</Text>
      <Text style={s.detail}>{detail}</Text>
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const demo = useDemo();
  const cart = useCart();
  const navigation = useNavigation<Nav>();
  const { signOut } = useAuth();
  const { user, seller, driver, setMode } = useSession();
  const [addressOpen, setAddressOpen] = useState(false);
  const [exploreOpen, setExploreOpen] = useState(false);
  const fullName =
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'HalalBasket member';
  const address = demo.enabled ? demo.address : user?.default_address;
  const editProfile = () => navigation.navigate('EditProfile');
  const openOrders = () => navigation.navigate('CustomerTabs', { screen: 'Orders' });
  const handleSell = () => {
    if (seller) {
      setMode('seller');
      navigation.navigate('SellerTabs', { screen: 'SellerDashboard' });
    } else navigation.navigate('SellerOnboarding');
  };
  const handleDeliver = () => {
    if (driver) {
      setMode('driver');
      navigation.navigate('DriverTabs', { screen: 'DriverHome' });
    } else navigation.navigate('DriverOnboarding');
  };
  const handleAdmin = () => {
    setMode('admin');
    navigation.navigate('AdminTabs', { screen: 'AdminDashboard' });
  };
  const handleReset = () => {
    void notify.confirm({
      title: 'Start fresh?',
      message: 'Your saved orders, favourites and basket will be reset.',
      confirmText: 'Start fresh',
      cancelText: 'Keep exploring',
      onConfirm: () => {
        cart.clearCart();
        demo.reset();
        notify.success('Everything is ready to explore again.');
      },
    });
  };
  const handleSignOut = () => {
    void notify.confirm({
      title: 'Sign out',
      message: 'Are you sure you want to sign out of HalalBasket?',
      confirmText: 'Sign out',
      destructive: true,
      onConfirm: () => {
        void signOut();
      },
    });
  };

  return (
    <SafeAreaView style={s.screen} edges={['top']}>
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <View style={s.heading}>
          <Text style={s.eyebrow}>YOUR HALALBASKET</Text>
          <Text style={s.title}>Your profile</Text>
          <Text style={s.subtitle}>Good food starts with you.</Text>
        </View>

        <View style={s.identity}>
          <Image source={discoveryImages.restaurant} style={s.cover} accessible={false} />
          <View style={s.identityBody}>
            <View style={s.identityActions}>
              <ProfileAvatar
                uri={user?.avatar_url}
                initials={profileInitials(user?.first_name, user?.last_name, user?.email)}
              />
              <TouchableOpacity
                accessibilityRole="button"
                accessibilityLabel="Edit profile"
                style={s.editButton}
                onPress={editProfile}
                activeOpacity={0.75}
              >
                <Ionicons name="create-outline" size={17} color={c.primary} />
                <Text style={s.editText}>Edit profile</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.name}>{fullName}</Text>
            {!!user?.email && <Text style={s.email}>{user.email}</Text>}
          </View>
        </View>

        <View style={s.shortcuts}>
          <Shortcut
            icon="receipt-outline"
            title="My orders"
            detail="Track & order again"
            onPress={openOrders}
          />
          <Shortcut
            icon={demo.enabled ? 'heart-outline' : 'restaurant-outline'}
            warm
            title={demo.enabled ? 'Saved places' : 'Find good food'}
            detail={
              demo.enabled
                ? `${demo.favourites.length} ${demo.favourites.length === 1 ? 'favourite' : 'favourites'} to come back to`
                : 'Discover local favourites'
            }
            onPress={() =>
              navigation.navigate('CustomerTabs', {
                screen: 'Search',
                params: { savedOnly: demo.enabled },
              })
            }
          />
        </View>

        <View style={s.section}>
          <Text style={s.sectionTitle}>Made for you</Text>
          <View style={s.card}>
            <Row
              icon="location-outline"
              label="Delivery address"
              detail={address || 'Add an address for your next order'}
              onPress={() => (demo.enabled ? setAddressOpen(true) : editProfile())}
            />
            <Row
              icon="person-outline"
              label="Personal details"
              detail="Your name, phone & profile photo"
              onPress={editProfile}
              last={!(seller || driver)}
            />
            {(seller || driver) && (
              <Row
                icon="wallet-outline"
                label="Payouts"
                detail="Your bank account & payout status"
                onPress={() => navigation.navigate('StripeConnect')}
                last
              />
            )}
          </View>
        </View>

        <View style={s.section}>
          <View style={s.sectionHeading}>
            <Text style={s.sectionTitle}>Grow with HalalBasket</Text>
            <Ionicons name="leaf-outline" size={22} color={c.primary} />
          </View>
          <Text style={s.sectionDescription}>Bring something good to your neighbourhood.</Text>
          <View style={s.card}>
            <Row
              icon="storefront-outline"
              label={seller ? 'Your seller space' : 'Share your kitchen'}
              detail={
                seller
                  ? 'Manage your menu & incoming orders'
                  : 'Sell from your restaurant, shop or home kitchen'
              }
              onPress={handleSell}
            />
            <Row
              icon="bicycle-outline"
              label={driver ? 'Your delivery space' : 'Deliver good food'}
              detail={
                driver
                  ? 'Go online & manage your deliveries'
                  : 'Earn by delivering around your neighbourhood'
              }
              onPress={handleDeliver}
              last={!user?.is_admin}
            />
            {user?.is_admin && (
              <Row
                icon="shield-checkmark-outline"
                label="Admin console"
                detail="Review sellers, drivers & orders"
                onPress={handleAdmin}
                last
              />
            )}
          </View>
        </View>

        {__DEV__ && (
          <View style={s.options}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel="Explore options"
              accessibilityState={{ expanded: exploreOpen }}
              onPress={() => setExploreOpen(!exploreOpen)}
              style={s.optionsButton}
              activeOpacity={0.75}
            >
              <Ionicons name="options-outline" size={20} color={c.textMuted} />
              <Text style={s.optionsLabel}>Explore options</Text>
              <Ionicons
                name={exploreOpen ? 'chevron-up' : 'chevron-down'}
                size={18}
                color={c.textMuted}
              />
            </TouchableOpacity>
            {exploreOpen && (
              <View style={s.card}>
                <Row
                  icon="swap-horizontal-outline"
                  label={demo.enabled ? 'Switch to live marketplace' : 'Explore the marketplace'}
                  detail={
                    demo.enabled
                      ? 'Return to live sellers and orders'
                      : 'Browse sample menus and try the order journey'
                  }
                  onPress={() => demo.setEnabled(!demo.enabled)}
                  last={!demo.enabled}
                />
                {demo.enabled && (
                  <Row
                    icon="refresh-outline"
                    label="Start fresh"
                    detail="Reset saved orders, favourites & basket"
                    onPress={handleReset}
                    last
                  />
                )}
              </View>
            )}
          </View>
        )}

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel="Sign out"
          onPress={handleSignOut}
          style={s.signOut}
          activeOpacity={0.75}
        >
          <Ionicons name="log-out-outline" size={21} color={c.textMuted} />
          <Text style={s.signOutText}>Sign out</Text>
        </TouchableOpacity>
        <View style={s.footer}>
          <BrandWordmark />
          <Text style={s.footerText}>Everything halal, delivered.</Text>
        </View>
      </ScrollView>
      <DemoAddress visible={addressOpen} onClose={() => setAddressOpen(false)} />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: c.background },
  content: {
    padding: 20,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 20,
    width: '100%',
    maxWidth: 620,
    alignSelf: 'center',
  },
  heading: { gap: 6 },
  eyebrow: { fontFamily: fonts.bold, fontSize: 11, letterSpacing: 1.8, color: c.primary },
  title: {
    fontFamily: fonts.extraBold,
    fontSize: 34,
    lineHeight: 41,
    letterSpacing: -1.3,
    color: c.textDark,
  },
  subtitle: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: c.textMuted },
  identity: {
    backgroundColor: c.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: c.divider,
    overflow: 'hidden',
  },
  cover: { width: '100%', height: 104, resizeMode: 'cover' },
  identityBody: { paddingHorizontal: 18, paddingBottom: 20, gap: 4 },
  identityActions: {
    marginTop: -32,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 8,
  },
  editButton: {
    minHeight: 44,
    paddingHorizontal: 13,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: c.divider,
    backgroundColor: c.surface,
  },
  editText: { fontFamily: fonts.bold, fontSize: 12, color: c.primary },
  name: {
    fontFamily: fonts.extraBold,
    fontSize: 24,
    lineHeight: 31,
    letterSpacing: -0.7,
    color: c.textDark,
  },
  email: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 20, color: c.textMuted },
  shortcuts: { flexDirection: 'row', gap: 12 },
  shortcut: { flex: 1, padding: 16, borderRadius: 20, backgroundColor: '#EAF0E4', gap: 7 },
  shortcutWarm: { backgroundColor: '#F7ECDD' },
  shortcutTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 7,
  },
  shortcutTitle: {
    fontFamily: fonts.extraBold,
    fontSize: 17,
    color: c.textDark,
    letterSpacing: -0.4,
  },
  detail: { fontFamily: fonts.regular, fontSize: 12, lineHeight: 18, color: c.textMuted },
  section: { gap: 12, paddingTop: 4 },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  sectionTitle: {
    flex: 1,
    fontFamily: fonts.extraBold,
    fontSize: 20,
    lineHeight: 27,
    letterSpacing: -0.6,
    color: c.textDark,
  },
  sectionDescription: {
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 20,
    color: c.textMuted,
    marginTop: -7,
  },
  card: {
    backgroundColor: c.surface,
    borderWidth: 1,
    borderColor: c.divider,
    borderRadius: 20,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', padding: 16, gap: 12, minHeight: 84 },
  rowBorder: { borderBottomWidth: 1, borderBottomColor: c.divider },
  rowIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: c.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: 4 },
  rowTitle: { fontFamily: fonts.bold, fontSize: 15, lineHeight: 21, color: c.textDark },
  options: { gap: 10 },
  optionsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minHeight: 48,
    paddingHorizontal: 4,
  },
  optionsLabel: { flex: 1, fontFamily: fonts.medium, fontSize: 13, color: c.textMuted },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    gap: 8,
    borderWidth: 1,
    borderColor: c.divider,
    borderRadius: 16,
  },
  signOutText: { fontFamily: fonts.semibold, fontSize: 14, color: c.textMuted },
  footer: { alignItems: 'center', gap: 5, paddingTop: 4 },
  footerText: { fontFamily: fonts.regular, fontSize: 11, color: c.textMuted },
});
