// HalalBasket — seller-mode profile: business identity, open hours,
// fulfillment settings, mode switch, payouts, sign out.

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Image,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as ImagePicker from 'expo-image-picker';
import { lightColors, spacing } from '../../constants/theme';
import { supabase } from '../config/supabase';
import { useSession } from '../context/SessionContext';
import { ProfileService } from '../services/profile';
import { notify } from '../lib/notify';
import type { MainStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<MainStackParamList>;

const DAYS: { key: string; label: string }[] = [
  { key: 'mon', label: 'Monday' },
  { key: 'tue', label: 'Tuesday' },
  { key: 'wed', label: 'Wednesday' },
  { key: 'thu', label: 'Thursday' },
  { key: 'fri', label: 'Friday' },
  { key: 'sat', label: 'Saturday' },
  { key: 'sun', label: 'Sunday' },
];

const SELLER_TYPE_LABELS: Record<string, string> = {
  restaurant: 'Restaurant',
  butcher: 'Butcher / Farm',
  home_cook: 'Home cook',
};

export default function SellerProfileScreen() {
  const navigation = useNavigation<Nav>();
  const { signOut } = useAuth();
  const { seller, setMode, refresh } = useSession();

  const [businessName, setBusinessName] = useState(seller?.business_name ?? '');
  const [description, setDescription] = useState(seller?.description ?? '');
  const [address, setAddress] = useState(seller?.address ?? '');
  const [prepTime, setPrepTime] = useState(seller?.prep_time_mins ?? 20);
  const [acceptsScheduled, setAcceptsScheduled] = useState(seller?.accepts_scheduled ?? false);
  const [hours, setHours] = useState<Record<string, { open: string; close: string } | null>>(
    (seller?.open_hours as any) ?? {}
  );
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  if (!seller) return null;

  const isHomeCook = seller.seller_type === 'home_cook';

  const setDayHours = (day: string, field: 'open' | 'close', value: string) => {
    setHours((prev) => ({
      ...prev,
      [day]: { open: '09:00', close: '17:00', ...(prev[day] ?? {}), [field]: value },
    }));
  };

  const toggleDay = (day: string, openNow: boolean) => {
    setHours((prev) => ({
      ...prev,
      [day]: openNow ? { open: '09:00', close: '17:00' } : null,
    }));
  };

  const pickLogo = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
      allowsEditing: true,
      aspect: [1, 1],
    });
    if (result.canceled || !result.assets[0]?.base64) return;
    setUploadingLogo(true);
    const url = await ProfileService.uploadListingImage(seller.id, result.assets[0].base64);
    if (url) {
      await supabase.from('sellers').update({ logo_url: url }).eq('id', seller.id);
      await refresh();
      notify.success('Logo updated');
    } else {
      notify.error('Upload failed');
    }
    setUploadingLogo(false);
  };

  const save = async () => {
    if (!businessName.trim()) {
      notify.error('Business name is required.');
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from('sellers')
      .update({
        business_name: businessName.trim(),
        description: description.trim() || null,
        address: address.trim() || null,
        prep_time_mins: prepTime,
        accepts_scheduled: acceptsScheduled,
        open_hours: hours,
      })
      .eq('id', seller.id);
    setSaving(false);
    if (error) {
      notify.error('Could not save your changes.');
      return;
    }
    notify.success('Profile saved');
    await refresh();
  };

  const handleSignOut = () => {
    void notify.confirm({
      title: 'Sign out',
      message: 'Sign out of HalalBasket?',
      confirmText: 'Sign out',
      destructive: true,
      onConfirm: () => void signOut(),
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView contentContainerStyle={styles.scroll}>
        {/* identity */}
        <View style={styles.identityCard}>
          <TouchableOpacity style={styles.logoWrap} onPress={() => void pickLogo()} activeOpacity={0.8}>
            {uploadingLogo ? (
              <ActivityIndicator color={lightColors.primary} />
            ) : seller.logo_url ? (
              <Image source={{ uri: seller.logo_url }} style={styles.logo} />
            ) : (
              <Ionicons name="storefront-outline" size={30} color={lightColors.textMuted} />
            )}
            <View style={styles.logoBadge}>
              <Ionicons name="camera" size={12} color="#fff" />
            </View>
          </TouchableOpacity>
          <View style={styles.identityBody}>
            <Text style={styles.businessName} numberOfLines={1}>{seller.business_name}</Text>
            <View style={styles.typeRow}>
              <View style={styles.typeChip}>
                <Text style={styles.typeChipText}>{SELLER_TYPE_LABELS[seller.seller_type]}</Text>
              </View>
              {seller.avg_rating != null && (
                <View style={styles.ratingChip}>
                  <Ionicons name="star" size={12} color="#F5A623" />
                  <Text style={styles.ratingText}>
                    {seller.avg_rating.toFixed(1)} ({seller.rating_count})
                  </Text>
                </View>
              )}
            </View>
          </View>
        </View>

        {/* business details */}
        <Text style={styles.sectionHeader}>Business details</Text>
        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Business name</Text>
          <TextInput style={styles.input} value={businessName} onChangeText={setBusinessName} />
          <Text style={styles.fieldLabel}>Description</Text>
          <TextInput
            style={[styles.input, styles.inputMultiline]}
            value={description}
            onChangeText={setDescription}
            multiline
            placeholder="Tell customers about your kitchen…"
            placeholderTextColor={lightColors.textMuted}
          />
          <Text style={styles.fieldLabel}>Address</Text>
          <TextInput style={styles.input} value={address} onChangeText={setAddress} />
        </View>

        {/* fulfillment */}
        {!isHomeCook && (
          <>
            <Text style={styles.sectionHeader}>Fulfillment</Text>
            <View style={styles.card}>
              <View style={styles.settingRow}>
                <View style={styles.settingBody}>
                  <Text style={styles.settingTitle}>Prep time</Text>
                  <Text style={styles.settingSub}>How long orders take to prepare</Text>
                </View>
                <View style={styles.stepper}>
                  <TouchableOpacity
                    style={styles.stepperBtn}
                    onPress={() => setPrepTime((p) => Math.max(5, p - 5))}
                  >
                    <Ionicons name="remove" size={18} color={lightColors.primary} />
                  </TouchableOpacity>
                  <Text style={styles.stepperValue}>{prepTime}m</Text>
                  <TouchableOpacity
                    style={styles.stepperBtn}
                    onPress={() => setPrepTime((p) => Math.min(120, p + 5))}
                  >
                    <Ionicons name="add" size={18} color={lightColors.primary} />
                  </TouchableOpacity>
                </View>
              </View>
              {seller.seller_type === 'butcher' && (
                <View style={styles.settingRow}>
                  <View style={styles.settingBody}>
                    <Text style={styles.settingTitle}>Scheduled orders</Text>
                    <Text style={styles.settingSub}>Let customers order ahead for pickup days</Text>
                  </View>
                  <Switch
                    value={acceptsScheduled}
                    onValueChange={setAcceptsScheduled}
                    trackColor={{ true: lightColors.primary, false: lightColors.divider }}
                    thumbColor="#fff"
                  />
                </View>
              )}
            </View>

            <Text style={styles.sectionHeader}>Open hours</Text>
            <View style={styles.card}>
              {DAYS.map((day) => {
                const dayHours = hours[day.key] ?? null;
                return (
                  <View key={day.key} style={styles.hoursRow}>
                    <Text style={styles.hoursDay}>{day.label}</Text>
                    {dayHours ? (
                      <View style={styles.hoursInputs}>
                        <TextInput
                          style={styles.hoursInput}
                          value={dayHours.open}
                          onChangeText={(v) => setDayHours(day.key, 'open', v)}
                          placeholder="09:00"
                          maxLength={5}
                        />
                        <Text style={styles.hoursDash}>–</Text>
                        <TextInput
                          style={styles.hoursInput}
                          value={dayHours.close}
                          onChangeText={(v) => setDayHours(day.key, 'close', v)}
                          placeholder="17:00"
                          maxLength={5}
                        />
                      </View>
                    ) : (
                      <Text style={styles.hoursClosed}>Closed</Text>
                    )}
                    <Switch
                      value={!!dayHours}
                      onValueChange={(v) => toggleDay(day.key, v)}
                      trackColor={{ true: lightColors.primary, false: lightColors.divider }}
                      thumbColor="#fff"
                    />
                  </View>
                );
              })}
            </View>
          </>
        )}

        <TouchableOpacity style={styles.saveBtn} activeOpacity={0.9} disabled={saving} onPress={() => void save()}>
          {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>Save changes</Text>}
        </TouchableOpacity>

        {/* account actions */}
        <Text style={styles.sectionHeader}>Account</Text>
        <View style={styles.card}>
          {isHomeCook && (
            <TouchableOpacity style={styles.actionRow} onPress={() => navigation.navigate('SellerCompliance')}>
              <Ionicons name="shield-checkmark-outline" size={20} color={lightColors.primary} />
              <Text style={styles.actionText}>Verification & compliance</Text>
              <Ionicons name="chevron-forward" size={17} color={lightColors.textMuted} />
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.actionRow} onPress={() => navigation.navigate('SellerEarnings')}>
            <Ionicons name="cash-outline" size={20} color={lightColors.primary} />
            <Text style={styles.actionText}>Earnings</Text>
            <Ionicons name="chevron-forward" size={17} color={lightColors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionRow} onPress={() => navigation.navigate('StripeConnect')}>
            <Ionicons name="card-outline" size={20} color={lightColors.primary} />
            <Text style={styles.actionText}>Payout setup</Text>
            <Ionicons name="chevron-forward" size={17} color={lightColors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.actionRow}
            onPress={() => {
              setMode('customer');
              navigation.navigate('CustomerTabs', { screen: 'Home' });
            }}
          >
            <Ionicons name="swap-horizontal-outline" size={20} color={lightColors.primary} />
            <Text style={styles.actionText}>Switch to customer view</Text>
            <Ionicons name="chevron-forward" size={17} color={lightColors.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.actionRow} onPress={handleSignOut}>
            <Ionicons name="log-out-outline" size={20} color={lightColors.error} />
            <Text style={[styles.actionText, { color: lightColors.error }]}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
  },
  scroll: {
    padding: spacing.md,
    paddingBottom: 40,
  },
  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: lightColors.divider,
  },
  logoWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: lightColors.inputBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: 32,
  },
  logoBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: lightColors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  identityBody: {
    flex: 1,
    gap: 6,
  },
  businessName: {
    fontSize: 18,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeChip: {
    backgroundColor: lightColors.chipBg,
    borderRadius: 9999,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  typeChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: lightColors.primary,
  },
  ratingChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  ratingText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: lightColors.textDark,
  },
  sectionHeader: {
    fontSize: 13,
    fontWeight: '800',
    color: lightColors.textMuted,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  card: {
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: spacing.lg,
    borderWidth: 1,
    borderColor: lightColors.divider,
    gap: 8,
  },
  fieldLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: lightColors.textMuted,
    marginTop: 4,
  },
  input: {
    backgroundColor: lightColors.inputBg,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: lightColors.divider,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14.5,
    color: lightColors.textDark,
  },
  inputMultiline: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    gap: 10,
  },
  settingBody: {
    flex: 1,
  },
  settingTitle: {
    fontSize: 14.5,
    fontWeight: '700',
    color: lightColors.textDark,
  },
  settingSub: {
    fontSize: 12.5,
    color: lightColors.textMuted,
    marginTop: 1,
  },
  stepper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  stepperBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    fontSize: 14.5,
    fontWeight: '800',
    color: lightColors.textDark,
    minWidth: 40,
    textAlign: 'center',
  },
  hoursRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
  },
  hoursDay: {
    width: 86,
    fontSize: 13.5,
    fontWeight: '700',
    color: lightColors.textDark,
  },
  hoursInputs: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  hoursInput: {
    flex: 1,
    backgroundColor: lightColors.inputBg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: lightColors.divider,
    paddingHorizontal: 8,
    paddingVertical: 7,
    fontSize: 13,
    color: lightColors.textDark,
    textAlign: 'center',
  },
  hoursDash: {
    color: lightColors.textMuted,
  },
  hoursClosed: {
    flex: 1,
    fontSize: 13,
    color: lightColors.textMuted,
  },
  saveBtn: {
    backgroundColor: lightColors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  saveBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
  },
  actionText: {
    flex: 1,
    fontSize: 14.5,
    fontWeight: '600',
    color: lightColors.textDark,
  },
});
