// Driver-mode profile: identity + verification chip, inline vehicle-info editor
// (drivers.vehicle_info), payout settings, mode switch back to the customer
// surface, and sign out.

import React, { useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '@clerk/clerk-expo';

import { lightColors, spacing } from '../../constants/theme';
import { supabase } from '../config/supabase';
import { useSession } from '../context/SessionContext';
import { notify } from '../lib/notify';
import { logger } from '../utils/logger';
import BackgroundPattern from '../components/BackgroundPattern';
import type { VerificationStatus } from '../types/database';
import type { MainStackParamList } from '../navigation/types';

const STATUS_CHIPS: Record<VerificationStatus, { label: string; color: string; bg: string }> = {
  approved: { label: 'Verified driver', color: lightColors.primary, bg: lightColors.chipBg },
  pending: { label: 'Verification pending', color: '#B9770E', bg: 'rgba(255,152,0,0.12)' },
  rejected: { label: 'Verification rejected', color: lightColors.error, bg: 'rgba(231,76,60,0.10)' },
};

export default function DriverProfileScreen() {
  const navigation = useNavigation<NativeStackNavigationProp<MainStackParamList>>();
  const { user, driver, setMode, refresh } = useSession();
  const { signOut } = useAuth();

  const [editingVehicle, setEditingVehicle] = useState(false);
  const [savingVehicle, setSavingVehicle] = useState(false);
  const [make, setMake] = useState(driver?.vehicle_info?.make ?? '');
  const [model, setModel] = useState(driver?.vehicle_info?.model ?? '');
  const [year, setYear] = useState(driver?.vehicle_info?.year ?? '');
  const [color, setColor] = useState(driver?.vehicle_info?.color ?? '');
  const [plate, setPlate] = useState(driver?.vehicle_info?.plate ?? '');

  const startEditVehicle = () => {
    setMake(driver?.vehicle_info?.make ?? '');
    setModel(driver?.vehicle_info?.model ?? '');
    setYear(driver?.vehicle_info?.year ?? '');
    setColor(driver?.vehicle_info?.color ?? '');
    setPlate(driver?.vehicle_info?.plate ?? '');
    setEditingVehicle(true);
  };

  const saveVehicle = async () => {
    if (!driver || savingVehicle) return;
    if (!make.trim() || !model.trim() || !plate.trim()) {
      notify.error('Make, model and plate are required');
      return;
    }
    setSavingVehicle(true);
    try {
      const { error } = await supabase
        .from('drivers')
        .update({
          vehicle_info: {
            make: make.trim(),
            model: model.trim(),
            year: year.trim(),
            color: color.trim(),
            plate: plate.trim().toUpperCase(),
          },
        })
        .eq('id', driver.id);
      if (error) throw error;
      await refresh();
      setEditingVehicle(false);
      notify.success('Vehicle info updated');
    } catch (err: any) {
      logger.error('Supabase', 'vehicle info save failed', { error: err?.message });
      notify.error('Could not save your vehicle info');
    } finally {
      setSavingVehicle(false);
    }
  };

  const switchToCustomer = () => {
    setMode('customer');
    navigation.navigate('CustomerTabs', { screen: 'Home' });
  };

  const handleSignOut = async () => {
    const ok = await notify.confirm({
      title: 'Sign out?',
      message: 'You can sign back in any time.',
      confirmText: 'Sign out',
      destructive: true,
    });
    if (!ok) return;
    try {
      await signOut();
    } catch (err: any) {
      logger.error('Auth', 'sign out failed', { error: err?.message });
      notify.error('Could not sign out');
    }
  };

  const displayName =
    [user?.first_name, user?.last_name].filter(Boolean).join(' ') || user?.email || 'Driver';
  const initials =
    [user?.first_name?.[0], user?.last_name?.[0]].filter(Boolean).join('').toUpperCase() ||
    (user?.email?.[0] ?? 'D').toUpperCase();
  const statusChip = driver ? STATUS_CHIPS[driver.verification_status] : null;
  const vehicle = driver?.vehicle_info ?? {};

  const renderVehicleField = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    options?: { keyboardType?: 'number-pad'; maxLength?: number; autoCapitalize?: 'characters' | 'words' }
  ) => (
    <View style={styles.fieldWrap}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        placeholderTextColor={lightColors.textMuted}
        keyboardType={options?.keyboardType}
        maxLength={options?.maxLength}
        autoCapitalize={options?.autoCapitalize ?? 'words'}
      />
    </View>
  );

  const renderMenuRow = (
    icon: keyof typeof Ionicons.glyphMap,
    label: string,
    onPress: () => void,
    destructive = false
  ) => (
    <TouchableOpacity style={styles.menuRow} onPress={onPress} activeOpacity={0.8}>
      <View style={[styles.menuIcon, destructive && styles.menuIconDestructive]}>
        <Ionicons name={icon} size={18} color={destructive ? lightColors.error : lightColors.primary} />
      </View>
      <Text style={[styles.menuLabel, destructive && styles.menuLabelDestructive]}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={lightColors.textMuted} />
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <BackgroundPattern />
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Profile</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
        {/* Identity card */}
        <View style={styles.identityCard}>
          {user?.avatar_url ? (
            <Image source={{ uri: user.avatar_url }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarFallback}>
              <Text style={styles.avatarInitials}>{initials}</Text>
            </View>
          )}
          <View style={styles.identityTextWrap}>
            <Text style={styles.identityName} numberOfLines={1}>
              {displayName}
            </Text>
            {user?.email ? (
              <Text style={styles.identityEmail} numberOfLines={1}>
                {user.email}
              </Text>
            ) : null}
            {statusChip ? (
              <View style={[styles.statusChip, { backgroundColor: statusChip.bg }]}>
                <Ionicons
                  name={driver?.verification_status === 'approved' ? 'shield-checkmark' : 'time-outline'}
                  size={12}
                  color={statusChip.color}
                />
                <Text style={[styles.statusChipText, { color: statusChip.color }]}>
                  {statusChip.label}
                </Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* Vehicle card */}
        {driver ? (
          <View style={styles.vehicleCard}>
            <View style={styles.vehicleHeaderRow}>
              <Text style={styles.sectionTitle}>Vehicle</Text>
              {!editingVehicle ? (
                <TouchableOpacity onPress={startEditVehicle} activeOpacity={0.8}>
                  <Text style={styles.editLink}>Edit</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {editingVehicle ? (
              <View>
                {renderVehicleField('Make', make, setMake)}
                {renderVehicleField('Model', model, setModel)}
                <View style={styles.fieldRow}>
                  <View style={styles.fieldHalf}>
                    {renderVehicleField('Year', year, setYear, { keyboardType: 'number-pad', maxLength: 4 })}
                  </View>
                  <View style={styles.fieldHalf}>{renderVehicleField('Color', color, setColor)}</View>
                </View>
                {renderVehicleField('Licence plate', plate, setPlate, { autoCapitalize: 'characters' })}
                <View style={styles.editActionsRow}>
                  <TouchableOpacity
                    style={styles.cancelBtn}
                    onPress={() => setEditingVehicle(false)}
                    disabled={savingVehicle}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.cancelBtnText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.saveBtn, savingVehicle && styles.saveBtnDisabled]}
                    onPress={() => void saveVehicle()}
                    disabled={savingVehicle}
                    activeOpacity={0.85}
                  >
                    {savingVehicle ? (
                      <ActivityIndicator size="small" color="#fff" />
                    ) : (
                      <Text style={styles.saveBtnText}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.vehicleSummaryRow}>
                <View style={styles.vehicleIcon}>
                  <Ionicons name="car-outline" size={22} color={lightColors.primary} />
                </View>
                <View style={styles.vehicleTextWrap}>
                  <Text style={styles.vehicleTitle}>
                    {[vehicle.color, vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(' ') ||
                      'No vehicle on file'}
                  </Text>
                  <Text style={styles.vehiclePlate}>{vehicle.plate ?? '—'}</Text>
                </View>
              </View>
            )}
          </View>
        ) : null}

        {/* Menu */}
        <View style={styles.menuCard}>
          {renderMenuRow('card-outline', 'Payouts', () => navigation.navigate('StripeConnect'))}
          <View style={styles.menuDivider} />
          {renderMenuRow('person-outline', 'Edit profile', () => navigation.navigate('EditProfile'))}
          <View style={styles.menuDivider} />
          {renderMenuRow('storefront-outline', 'Switch to customer view', switchToCustomer)}
          <View style={styles.menuDivider} />
          {renderMenuRow('log-out-outline', 'Sign out', () => void handleSignOut(), true)}
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  scroll: {
    padding: spacing.md,
    paddingTop: spacing.xs,
  },

  identityCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    marginBottom: spacing.md,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginRight: spacing.md,
  },
  avatarFallback: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  avatarInitials: {
    fontSize: 22,
    fontWeight: '800',
    color: lightColors.primary,
  },
  identityTextWrap: { flex: 1 },
  identityName: {
    fontSize: 18,
    fontWeight: '800',
    color: lightColors.textDark,
    marginBottom: 2,
  },
  identityEmail: {
    fontSize: 13,
    color: lightColors.textMuted,
    marginBottom: 6,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 4,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusChipText: {
    fontSize: 12,
    fontWeight: '700',
  },

  vehicleCard: {
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    marginBottom: spacing.md,
  },
  vehicleHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  editLink: {
    fontSize: 14,
    fontWeight: '700',
    color: lightColors.primary,
  },
  vehicleSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  vehicleIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  vehicleTextWrap: { flex: 1 },
  vehicleTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: lightColors.textDark,
    marginBottom: 2,
  },
  vehiclePlate: {
    fontSize: 13,
    color: lightColors.textMuted,
    letterSpacing: 1,
  },

  fieldWrap: { marginBottom: spacing.sm },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: lightColors.textDark,
    marginBottom: 6,
  },
  input: {
    backgroundColor: lightColors.inputBg,
    borderRadius: 12,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: lightColors.textDark,
  },
  fieldRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  fieldHalf: { flex: 1 },
  editActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  cancelBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: lightColors.inputBg,
  },
  cancelBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: lightColors.textDark,
  },
  saveBtn: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    backgroundColor: lightColors.primary,
  },
  saveBtnDisabled: { opacity: 0.6 },
  saveBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#fff',
  },

  menuCard: {
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    overflow: 'hidden',
  },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  menuIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: spacing.md,
  },
  menuIconDestructive: {
    backgroundColor: 'rgba(231,76,60,0.10)',
  },
  menuLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: lightColors.textDark,
  },
  menuLabelDestructive: {
    color: lightColors.error,
  },
  menuDivider: {
    height: 1,
    backgroundColor: lightColors.divider,
    marginLeft: 68,
  },
  bottomSpacer: {
    height: 40,
  },
});
