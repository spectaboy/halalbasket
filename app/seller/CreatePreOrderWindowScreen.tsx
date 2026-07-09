// CreatePreOrderWindowScreen — home-cook meal-drop creator (modal).
// Cook date, order cutoff, minimum orders, pickup-ready time, and the
// listings attached to the drop (pre_order_window_items).

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { lightColors, spacing } from '../../constants/theme';
import { notify } from '../lib/notify';
import { logger } from '../utils/logger';
import { useScreenLogger } from '../utils/loggerHooks';
import { supabase } from '../config/supabase';
import { useSession } from '../context/SessionContext';
import { formatMoney } from '../utils/pricing';
import type { MainStackParamList } from '../navigation/types';
import type { ListingRow, PreOrderWindowRow } from '../types/database';

type Props = NativeStackScreenProps<MainStackParamList, 'CreatePreOrderWindow'>;

const toDateOnly = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

const fmtDate = (d: Date) =>
  d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
const fmtDateTime = (d: Date) =>
  `${fmtDate(d)} · ${d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`;

/** Pressable field row that opens the native picker (date or date+time). */
function DateField({
  label,
  icon,
  value,
  mode,
  minimumDate,
  onChange,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: Date;
  mode: 'date' | 'datetime';
  minimumDate?: Date;
  onChange: (d: Date) => void;
}) {
  const [iosExpanded, setIosExpanded] = useState(false);

  const openAndroid = () => {
    DateTimePickerAndroid.open({
      value,
      mode: 'date',
      minimumDate,
      onChange: (event, selectedDate) => {
        if (event.type !== 'set' || !selectedDate) return;
        const next = new Date(value);
        next.setFullYear(selectedDate.getFullYear(), selectedDate.getMonth(), selectedDate.getDate());
        if (mode === 'date') {
          onChange(next);
          return;
        }
        DateTimePickerAndroid.open({
          value: next,
          mode: 'time',
          is24Hour: false,
          minuteInterval: 5,
          onChange: (timeEvent, selectedTime) => {
            if (timeEvent.type !== 'set' || !selectedTime) return;
            next.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
            onChange(new Date(next));
          },
        });
      },
    });
  };

  return (
    <View>
      <TouchableOpacity
        style={styles.dateFieldRow}
        activeOpacity={0.8}
        onPress={() => (Platform.OS === 'android' ? openAndroid() : setIosExpanded((v) => !v))}
      >
        <View style={styles.dateFieldIcon}>
          <Ionicons name={icon} size={17} color={lightColors.primary} />
        </View>
        <Text style={styles.dateFieldLabel}>{label}</Text>
        <Text style={styles.dateFieldValue}>{mode === 'date' ? fmtDate(value) : fmtDateTime(value)}</Text>
      </TouchableOpacity>
      {Platform.OS === 'ios' && iosExpanded && (
        <View style={styles.iosPickerWrap}>
          <DateTimePicker
            value={value}
            mode={mode === 'date' ? 'date' : 'datetime'}
            display={mode === 'date' ? 'inline' : 'spinner'}
            minimumDate={minimumDate}
            minuteInterval={5}
            themeVariant="light"
            onChange={(_, d) => {
              if (d) onChange(d);
            }}
          />
        </View>
      )}
    </View>
  );
}

export default function CreatePreOrderWindowScreen({ navigation, route }: Props) {
  const windowId = route.params?.windowId;
  useScreenLogger('CreatePreOrderWindowScreen', { windowId });
  const insets = useSafeAreaInsets();
  const { seller } = useSession();

  const tomorrowAt = (hours: number) => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(hours, 0, 0, 0);
    return d;
  };

  const [loading, setLoading] = useState(!!windowId);
  const [saving, setSaving] = useState(false);
  const [existing, setExisting] = useState<PreOrderWindowRow | null>(null);
  const [title, setTitle] = useState('');
  const [cookDate, setCookDate] = useState<Date>(tomorrowAt(12));
  const [cutoff, setCutoff] = useState<Date>(tomorrowAt(9));
  const [pickupReadyAt, setPickupReadyAt] = useState<Date>(tomorrowAt(17));
  const [minOrders, setMinOrders] = useState(1);
  const [listings, setListings] = useState<ListingRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const sellerId = seller?.id;
  const permitApproved = seller?.permit_status === 'approved';

  const load = useCallback(async () => {
    if (!sellerId) {
      setLoading(false);
      return;
    }
    try {
      const { data: listingRows, error: listingErr } = await supabase
        .from('listings')
        .select('*')
        .eq('seller_id', sellerId)
        .order('created_at', { ascending: false });
      if (listingErr) throw listingErr;
      setListings((listingRows as ListingRow[]) ?? []);

      if (windowId) {
        const [{ data: win, error: winErr }, { data: items, error: itemsErr }] = await Promise.all([
          supabase.from('pre_order_windows').select('*').eq('id', windowId).maybeSingle(),
          supabase.from('pre_order_window_items').select('listing_id').eq('window_id', windowId),
        ]);
        if (winErr || itemsErr || !win) throw winErr ?? itemsErr ?? new Error('window not found');
        const row = win as PreOrderWindowRow;
        setExisting(row);
        setTitle(row.title ?? '');
        setCookDate(new Date(`${row.cook_date}T12:00:00`));
        setCutoff(new Date(row.order_cutoff));
        setPickupReadyAt(new Date(row.pickup_ready_at));
        setMinOrders(row.min_orders);
        setSelectedIds(new Set(((items ?? []) as Array<{ listing_id: string }>).map((i) => i.listing_id)));
      }
    } catch (e: unknown) {
      logger.error('Supabase', 'meal drop load failed', { error: e instanceof Error ? e.message : String(e) });
      notify.error("Couldn't load meal drop details.");
      navigation.goBack();
      return;
    }
    setLoading(false);
  }, [sellerId, windowId, navigation]);

  useEffect(() => {
    void load();
  }, [load]);

  const toggleListing = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const save = async () => {
    if (!sellerId || saving) return;
    // Validation — cutoff must come before the food is ready, and give at least one order.
    if (cutoff.getTime() >= pickupReadyAt.getTime()) {
      notify.error('The order cutoff has to be before the pickup-ready time.');
      return;
    }
    if (!existing && cutoff.getTime() <= Date.now()) {
      notify.error('The order cutoff needs to be in the future.');
      return;
    }
    if (minOrders < 1) {
      notify.error('Minimum orders must be at least 1.');
      return;
    }
    if (selectedIds.size === 0) {
      notify.error('Attach at least one listing so customers know what to order.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        seller_id: sellerId,
        title: title.trim() || null,
        cook_date: toDateOnly(cookDate),
        order_cutoff: cutoff.toISOString(),
        min_orders: minOrders,
        pickup_ready_at: pickupReadyAt.toISOString(),
      };
      let id = windowId;
      if (windowId) {
        const { error } = await supabase.from('pre_order_windows').update(payload).eq('id', windowId);
        if (error) throw error;
        const { error: delErr } = await supabase
          .from('pre_order_window_items')
          .delete()
          .eq('window_id', windowId);
        if (delErr) throw delErr;
      } else {
        const { data, error } = await supabase
          .from('pre_order_windows')
          .insert({ ...payload, status: 'open' })
          .select('id')
          .single();
        if (error || !data) throw error ?? new Error('insert returned no row');
        id = (data as { id: string }).id;
      }
      const itemRows = Array.from(selectedIds).map((listingId) => ({ window_id: id as string, listing_id: listingId }));
      const { error: itemsErr } = await supabase.from('pre_order_window_items').insert(itemRows);
      if (itemsErr) throw itemsErr;
      notify.success(windowId ? 'Meal drop updated.' : 'Meal drop scheduled — time to cook!');
      navigation.goBack();
    } catch (e: unknown) {
      logger.error('Supabase', 'meal drop save failed', { error: e instanceof Error ? e.message : String(e) });
      notify.error("Couldn't save the meal drop. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  const cancelDrop = async () => {
    if (!windowId) return;
    const ok = await notify.confirm({
      title: 'Cancel this drop?',
      message: 'Customers will no longer be able to order from it. This can\'t be undone.',
      confirmText: 'Cancel drop',
      cancelText: 'Keep it',
      destructive: true,
    });
    if (!ok) return;
    const { error } = await supabase
      .from('pre_order_windows')
      .update({ status: 'cancelled' })
      .eq('id', windowId);
    if (error) {
      notify.error("Couldn't cancel the drop. Try again.");
      return;
    }
    notify.success('Drop cancelled.');
    navigation.goBack();
  };

  if (loading) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <View style={styles.centerFill}>
          <ActivityIndicator size="large" color={lightColors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  const editableListings = listings.filter((l) => permitApproved || l.is_low_risk);
  const lockedCount = listings.length - editableListings.length;

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={() => navigation.goBack()}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Ionicons name="close" size={24} color={lightColors.textDark} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{windowId ? 'Edit meal drop' : 'New meal drop'}</Text>
        <View style={styles.backBtn} />
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.introText}>
          Pick a cook day, set a cutoff so you know what to shop for, and tell customers when food
          will be ready.
        </Text>

        <Text style={styles.fieldLabel}>Title (optional)</Text>
        <TextInput
          style={styles.input}
          placeholder="e.g. Friday biryani drop"
          placeholderTextColor={lightColors.textMuted}
          value={title}
          onChangeText={setTitle}
        />

        <Text style={styles.fieldLabel}>Schedule</Text>
        <View style={styles.dateCard}>
          <DateField
            label="Cook date"
            icon="flame-outline"
            value={cookDate}
            mode="date"
            minimumDate={new Date()}
            onChange={setCookDate}
          />
          <View style={styles.dateDivider} />
          <DateField
            label="Order cutoff"
            icon="hourglass-outline"
            value={cutoff}
            mode="datetime"
            minimumDate={new Date()}
            onChange={setCutoff}
          />
          <View style={styles.dateDivider} />
          <DateField
            label="Ready for pickup"
            icon="bag-check-outline"
            value={pickupReadyAt}
            mode="datetime"
            minimumDate={new Date()}
            onChange={setPickupReadyAt}
          />
        </View>
        {cutoff.getTime() >= pickupReadyAt.getTime() && (
          <View style={styles.warnRow}>
            <Ionicons name="alert-circle" size={14} color={lightColors.error} />
            <Text style={styles.warnRowText}>Cutoff must be before the pickup-ready time.</Text>
          </View>
        )}

        <Text style={styles.fieldLabel}>Minimum orders</Text>
        <View style={styles.stepperCard}>
          <View style={{ flex: 1 }}>
            <Text style={styles.stepperTitle}>Only cook if you get at least</Text>
            <Text style={styles.stepperSubtitle}>
              If the minimum isn't reached by cutoff, the drop won't be confirmed.
            </Text>
          </View>
          <View style={styles.stepper}>
            <TouchableOpacity
              style={[styles.stepBtn, minOrders <= 1 && { opacity: 0.4 }]}
              onPress={() => setMinOrders((n) => Math.max(1, n - 1))}
              disabled={minOrders <= 1}
            >
              <Ionicons name="remove" size={18} color={lightColors.primary} />
            </TouchableOpacity>
            <Text style={styles.stepValue}>{minOrders}</Text>
            <TouchableOpacity style={styles.stepBtn} onPress={() => setMinOrders((n) => Math.min(99, n + 1))}>
              <Ionicons name="add" size={18} color={lightColors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.fieldLabel}>What's on the menu?</Text>
        {editableListings.length === 0 ? (
          <View style={styles.menuEmpty}>
            <Ionicons name="fast-food-outline" size={20} color={lightColors.textMuted} />
            <Text style={styles.menuEmptyText}>
              You don't have any sellable listings yet. Add a listing first, then attach it to a drop.
            </Text>
          </View>
        ) : (
          editableListings.map((l) => {
            const selected = selectedIds.has(l.id);
            return (
              <TouchableOpacity
                key={l.id}
                style={[styles.menuRow, selected && styles.menuRowSelected]}
                onPress={() => toggleListing(l.id)}
                activeOpacity={0.8}
              >
                {l.image_url ? (
                  <Image source={{ uri: l.image_url }} style={styles.menuThumb} />
                ) : (
                  <View style={[styles.menuThumb, styles.menuThumbPlaceholder]}>
                    <Ionicons name="fast-food-outline" size={16} color={lightColors.textMuted} />
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.menuName} numberOfLines={1}>
                    {l.name}
                  </Text>
                  <Text style={styles.menuPrice}>{formatMoney(Number(l.price))}</Text>
                </View>
                <Ionicons
                  name={selected ? 'checkbox' : 'square-outline'}
                  size={23}
                  color={selected ? lightColors.primary : lightColors.textMuted}
                />
              </TouchableOpacity>
            );
          })
        )}
        {lockedCount > 0 && (
          <View style={styles.lockNote}>
            <Ionicons name="lock-closed-outline" size={13} color="#8A6D1D" />
            <Text style={styles.lockNoteText}>
              {lockedCount} high-risk listing{lockedCount === 1 ? '' : 's'} hidden until your permit is approved.
            </Text>
          </View>
        )}

        {windowId && existing?.status === 'open' && (
          <TouchableOpacity style={styles.cancelDropBtn} onPress={cancelDrop} activeOpacity={0.8}>
            <Ionicons name="trash-outline" size={16} color={lightColors.error} />
            <Text style={styles.cancelDropText}>Cancel this drop</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 12) + 4 }]}>
        <TouchableOpacity
          style={[styles.primaryBtn, saving && { opacity: 0.6 }]}
          onPress={save}
          disabled={saving}
          activeOpacity={0.85}
        >
          {saving ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.primaryBtnText}>{windowId ? 'Save changes' : 'Schedule drop'}</Text>
          )}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: lightColors.background },
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  backBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  scrollContent: { padding: spacing.md, paddingBottom: 32 },
  introText: { fontSize: 13.5, color: lightColors.textMuted, lineHeight: 19, marginBottom: 4 },

  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: lightColors.textDark,
    marginBottom: 6,
    marginTop: spacing.md,
  },
  input: {
    backgroundColor: lightColors.inputBg,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 15,
    color: lightColors.textDark,
  },

  dateCard: {
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
    paddingHorizontal: 12,
  },
  dateDivider: { height: 1, backgroundColor: lightColors.divider },
  dateFieldRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 14, paddingHorizontal: 4 },
  dateFieldIcon: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateFieldLabel: { flex: 1, fontSize: 14, fontWeight: '600', color: lightColors.textDark },
  dateFieldValue: { fontSize: 13.5, fontWeight: '700', color: lightColors.primary },
  iosPickerWrap: { paddingBottom: 8 },

  warnRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, paddingHorizontal: 2 },
  warnRowText: { fontSize: 12.5, color: lightColors.error, fontWeight: '600' },

  stepperCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
  },
  stepperTitle: { fontSize: 14, fontWeight: '700', color: lightColors.textDark },
  stepperSubtitle: { fontSize: 12, color: lightColors.textMuted, marginTop: 3, lineHeight: 16 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  stepBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: lightColors.chipBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: { fontSize: 17, fontWeight: '800', color: lightColors.textDark, minWidth: 24, textAlign: 'center' },

  menuEmpty: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    backgroundColor: lightColors.surface,
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: lightColors.divider,
  },
  menuEmptyText: { flex: 1, fontSize: 12.5, color: lightColors.textMuted, lineHeight: 18 },
  menuRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: lightColors.surface,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: lightColors.divider,
    marginBottom: 8,
  },
  menuRowSelected: { borderColor: lightColors.primary, backgroundColor: '#FBFEFC' },
  menuThumb: { width: 44, height: 44, borderRadius: 10, backgroundColor: lightColors.inputBg },
  menuThumbPlaceholder: { alignItems: 'center', justifyContent: 'center' },
  menuName: { fontSize: 14, fontWeight: '700', color: lightColors.textDark },
  menuPrice: { fontSize: 12.5, fontWeight: '700', color: lightColors.primary, marginTop: 2 },

  lockNote: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, paddingHorizontal: 2 },
  lockNoteText: { fontSize: 12, color: '#8A6D1D', fontWeight: '600' },

  cancelDropBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.lg,
    paddingVertical: 12,
  },
  cancelDropText: { color: lightColors.error, fontWeight: '700', fontSize: 14 },

  bottomBar: {
    paddingHorizontal: spacing.md,
    paddingTop: spacing.sm,
    backgroundColor: lightColors.background,
    borderTopWidth: 1,
    borderTopColor: lightColors.divider,
  },
  primaryBtn: {
    backgroundColor: lightColors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
});
