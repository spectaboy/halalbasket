// app/profile/ProfileScreen.tsx — the customer Profile tab. Identity header +
// account rows, plus entry points into the seller / driver / admin surfaces.

import React from 'react';
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useAuth } from '@clerk/clerk-expo';
import type { MainStackParamList } from '../navigation/types';
import { lightColors } from '../../constants/theme';
import { useSession } from '../context/SessionContext';
import { notify } from '../lib/notify';

type Nav = NativeStackNavigationProp<MainStackParamList>;

interface RowProps {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  sublabel?: string;
  onPress: () => void;
  tint?: string;
  last?: boolean;
}

function Row({ icon, label, sublabel, onPress, tint, last }: RowProps) {
  return (
    <TouchableOpacity
      style={[styles.row, !last && styles.rowBorder]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <View style={[styles.rowIcon, tint ? { backgroundColor: `${tint}14` } : null]}>
        <Ionicons name={icon} size={20} color={tint ?? lightColors.primary} />
      </View>
      <View style={styles.rowBody}>
        <Text style={[styles.rowLabel, tint ? { color: tint } : null]}>{label}</Text>
        {sublabel ? <Text style={styles.rowSublabel}>{sublabel}</Text> : null}
      </View>
      <Ionicons name="chevron-forward" size={18} color={lightColors.textMuted} />
    </TouchableOpacity>
  );
}

const ProfileScreen = () => {
  const navigation = useNavigation<Nav>();
  const { signOut } = useAuth();
  const { user, seller, driver, setMode } = useSession();

  const fullName =
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'HalalBasket member';
  const initials =
    `${user?.first_name?.[0] ?? ''}${user?.last_name?.[0] ?? ''}`.toUpperCase() ||
    (user?.email?.[0] ?? '?').toUpperCase();

  const handleSell = () => {
    if (seller) {
      setMode('seller');
      navigation.navigate('SellerTabs', { screen: 'SellerDashboard' });
    } else {
      navigation.navigate('SellerOnboarding');
    }
  };

  const handleDeliver = () => {
    if (driver) {
      setMode('driver');
      navigation.navigate('DriverTabs', { screen: 'DriverHome' });
    } else {
      navigation.navigate('DriverOnboarding');
    }
  };

  const handleAdmin = () => {
    setMode('admin');
    navigation.navigate('AdminTabs', { screen: 'AdminDashboard' });
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
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.screenTitle}>Profile</Text>

        {/* Identity card */}
        <View style={styles.identityCard}>
          {user?.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
          <View style={styles.identityBody}>
            <Text style={styles.name} numberOfLines={1}>
              {fullName}
            </Text>
            <Text style={styles.email} numberOfLines={1}>
              {user?.email ?? ''}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.editBadge}
            onPress={() => navigation.navigate('EditProfile')}
            activeOpacity={0.8}
          >
            <Ionicons name="pencil" size={16} color={lightColors.primary} />
          </TouchableOpacity>
        </View>

        {/* Account */}
        <Text style={styles.sectionTitle}>Account</Text>
        <View style={styles.card}>
          <Row
            icon="person-outline"
            label="Edit profile"
            sublabel="Name, phone, address and photo"
            onPress={() => navigation.navigate('EditProfile')}
          />
          <Row
            icon="receipt-outline"
            label="My orders"
            sublabel="Track active and past orders"
            onPress={() => navigation.navigate('CustomerTabs', { screen: 'Orders' })}
            last={!(seller || driver)}
          />
          {(seller || driver) && (
            <Row
              icon="wallet-outline"
              label="Payouts"
              sublabel="Bank account and payout status"
              onPress={() => navigation.navigate('StripeConnect')}
              last
            />
          )}
        </View>

        {/* Earn with HalalBasket */}
        <Text style={styles.sectionTitle}>Earn with HalalBasket</Text>
        <View style={styles.card}>
          <Row
            icon="storefront-outline"
            label={seller ? 'Switch to seller view' : 'Sell on HalalBasket'}
            sublabel={
              seller
                ? 'Manage your listings and incoming orders'
                : 'Open your restaurant, butcher shop, farm or home kitchen'
            }
            onPress={handleSell}
          />
          <Row
            icon="bicycle-outline"
            label={driver ? 'Switch to driver view' : 'Deliver with HalalBasket'}
            sublabel={
              driver
                ? 'Go online and start delivering'
                : 'Earn money delivering halal food in your city'
            }
            onPress={handleDeliver}
            last={!user?.is_admin}
          />
          {user?.is_admin && (
            <Row
              icon="shield-checkmark-outline"
              label="Admin console"
              sublabel="Review sellers, drivers and orders"
              onPress={handleAdmin}
              last
            />
          )}
        </View>

        {/* Sign out */}
        <View style={styles.card}>
          <Row
            icon="log-out-outline"
            label="Sign out"
            onPress={handleSignOut}
            tint={lightColors.error}
            last
          />
        </View>

        <Text style={styles.footerText}>HalalBasket — everything halal, delivered.</Text>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
  },
  scroll: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: lightColors.textDark,
    letterSpacing: -0.5,
    marginBottom: 16,
  },

  /* Identity */
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightColors.chipBg,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    marginBottom: 24,
  },
  avatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: lightColors.inputBg,
  },
  avatarFallback: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: lightColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitials: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  identityBody: {
    flex: 1,
  },
  name: {
    fontSize: 18,
    fontWeight: '800',
    color: lightColors.textDark,
    marginBottom: 2,
  },
  email: {
    fontSize: 14,
    color: lightColors.textMuted,
  },
  editBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: lightColors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: lightColors.divider,
  },

  /* Sections */
  sectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: lightColors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
    marginLeft: 4,
  },
  card: {
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    marginBottom: 24,
    overflow: 'hidden',
  },

  /* Rows */
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 12,
  },
  rowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: lightColors.divider,
  },
  rowIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: {
    flex: 1,
  },
  rowLabel: {
    fontSize: 15.5,
    fontWeight: '600',
    color: lightColors.textDark,
  },
  rowSublabel: {
    fontSize: 13,
    color: lightColors.textMuted,
    marginTop: 2,
  },

  footerText: {
    textAlign: 'center',
    fontSize: 12.5,
    color: lightColors.textMuted,
    marginTop: 4,
  },
});

export default ProfileScreen;
