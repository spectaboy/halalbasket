// Admin seller review: full application detail, signed-URL document viewer
// (private 'verification-docs' bucket), approve / reject (with required
// reason), and — for home cooks — the permit_status compliance ladder.
// Setting permit_status='approved' is what unlocks their high-risk listings.

import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Image,
  Modal,
  TextInput,
  Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import type { MainStackParamList } from '../navigation/types';
import { supabase } from '../config/supabase';
import { lightColors } from '../../constants/theme';
import { notify } from '../lib/notify';
import type { SellerRow, PermitStatus, VerificationStatus } from '../types/database';

type Props = NativeStackScreenProps<MainStackParamList, 'AdminSellerReview'>;

interface SellerWithUser extends SellerRow {
  users: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
}

interface SignedDoc {
  key: string;
  label: string;
  path: string;
  url: string | null;
}

const DOC_FIELDS: { key: keyof SellerRow; label: string }[] = [
  { key: 'licence_doc_path', label: 'Business licence' },
  { key: 'id_doc_path', label: 'Government ID' },
  { key: 'food_handler_cert_path', label: 'Food handler certificate' },
  { key: 'permit_doc_path', label: 'Home kitchen permit' },
];

const TYPE_LABELS: Record<SellerRow['seller_type'], string> = {
  restaurant: 'Restaurant',
  butcher: 'Butcher',
  home_cook: 'Home cook',
};

const PERMIT_STEPS: { key: PermitStatus; label: string }[] = [
  { key: 'none', label: 'None' },
  { key: 'course_done', label: 'Course done' },
  { key: 'permit_applied', label: 'Permit applied' },
  { key: 'inspection_scheduled', label: 'Inspection scheduled' },
  { key: 'approved', label: 'Approved' },
];

const STATUS_META: Record<VerificationStatus, { label: string; color: string }> = {
  pending: { label: 'Pending review', color: '#E67E22' },
  approved: { label: 'Approved', color: lightColors.primary },
  rejected: { label: 'Rejected', color: lightColors.error },
};

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

export default function AdminSellerReviewScreen({ navigation, route }: Props) {
  const { sellerId } = route.params;
  const insets = useSafeAreaInsets();
  const [seller, setSeller] = useState<SellerWithUser | null>(null);
  const [docs, setDocs] = useState<SignedDoc[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('sellers')
        .select('*, users(first_name, last_name, email, phone)')
        .eq('id', sellerId)
        .maybeSingle();
      if (error) throw error;
      const s = data as unknown as SellerWithUser | null;
      setSeller(s);
      if (s) {
        const present = DOC_FIELDS.filter((d) => {
          const v = s[d.key];
          return typeof v === 'string' && v.length > 0;
        });
        const signed = await Promise.all(
          present.map(async (d): Promise<SignedDoc> => {
            const path = s[d.key] as string;
            const { data: su } = await supabase.storage
              .from('verification-docs')
              .createSignedUrl(path, 3600);
            return { key: String(d.key), label: d.label, path, url: su?.signedUrl ?? null };
          })
        );
        setDocs(signed);
      }
    } catch (e: any) {
      notify.error(e?.message ?? 'Failed to load seller');
    } finally {
      setLoading(false);
    }
  }, [sellerId]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async () => {
    if (!seller) return;
    const ok = await notify.confirm({
      title: 'Approve seller',
      message: `Approve ${seller.business_name}? Their listings become visible under the compliance rules.`,
      confirmText: 'Approve',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from('sellers')
        .update({ verification_status: 'approved', rejection_reason: null })
        .eq('id', sellerId);
      if (error) throw error;
      notify.success('Seller approved');
      await load();
    } catch (e: any) {
      notify.error(e?.message ?? 'Failed to approve seller');
    } finally {
      setBusy(false);
    }
  };

  const submitReject = async () => {
    const trimmed = reason.trim();
    if (!trimmed || !seller) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from('sellers')
        .update({ verification_status: 'rejected', rejection_reason: trimmed })
        .eq('id', sellerId);
      if (error) throw error;
      setRejectOpen(false);
      setReason('');
      notify.success('Seller rejected');
      await load();
    } catch (e: any) {
      notify.error(e?.message ?? 'Failed to reject seller');
    } finally {
      setBusy(false);
    }
  };

  const setPermit = async (next: PermitStatus) => {
    if (!seller || next === seller.permit_status) return;
    const step = PERMIT_STEPS.find((p) => p.key === next);
    const ok = await notify.confirm({
      title: 'Update permit status',
      message:
        next === 'approved'
          ? `Set permit status to "${step?.label}"? This unlocks their high-risk listings.`
          : `Set permit status to "${step?.label}"?`,
      confirmText: 'Update',
    });
    if (!ok) return;
    setBusy(true);
    try {
      const { error } = await supabase
        .from('sellers')
        .update({ permit_status: next })
        .eq('id', sellerId);
      if (error) throw error;
      notify.success('Permit status updated');
      await load();
    } catch (e: any) {
      notify.error(e?.message ?? 'Failed to update permit status');
    } finally {
      setBusy(false);
    }
  };

  const InfoRow = ({
    icon,
    label,
    value,
  }: {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    value: string | null | undefined;
  }) => (
    <View style={styles.infoRow}>
      <Ionicons name={icon} size={16} color={lightColors.textMuted} />
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue} numberOfLines={2}>
        {value || '—'}
      </Text>
    </View>
  );

  if (loading) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header navigation={navigation} />
        <View style={styles.center}>
          <ActivityIndicator color={lightColors.primary} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (!seller) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <Header navigation={navigation} />
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={40} color="#9CA3AF" />
          <Text style={styles.emptyText}>Seller not found.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const statusMeta = STATUS_META[seller.verification_status];
  const applicantName =
    [seller.users?.first_name, seller.users?.last_name].filter(Boolean).join(' ') || '—';

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <Header navigation={navigation} />
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 120 }}>
        {/* Business */}
        <View style={styles.card}>
          <View style={styles.cardTop}>
            <Text style={styles.bizName}>{seller.business_name}</Text>
            <View style={[styles.statusPill, { backgroundColor: statusMeta.color + '1A' }]}>
              <Text style={[styles.statusPillText, { color: statusMeta.color }]}>
                {statusMeta.label}
              </Text>
            </View>
          </View>
          <InfoRow icon="pricetag-outline" label="Type" value={TYPE_LABELS[seller.seller_type]} />
          <InfoRow icon="document-text-outline" label="About" value={seller.description} />
          <InfoRow icon="location-outline" label="Address" value={seller.address} />
          <InfoRow
            icon="restaurant-outline"
            label="Tags"
            value={seller.cuisine_tags?.length ? seller.cuisine_tags.join(', ') : null}
          />
          <InfoRow icon="calendar-outline" label="Applied" value={fmtDate(seller.created_at)} />
          {seller.verification_status === 'rejected' && seller.rejection_reason ? (
            <View style={styles.rejectionBox}>
              <Text style={styles.rejectionText}>Reason: {seller.rejection_reason}</Text>
            </View>
          ) : null}
        </View>

        {/* Applicant */}
        <Text style={styles.sectionTitle}>Applicant</Text>
        <View style={styles.card}>
          <InfoRow icon="person-outline" label="Name" value={applicantName} />
          <InfoRow icon="mail-outline" label="Email" value={seller.users?.email} />
          <InfoRow icon="call-outline" label="Phone" value={seller.users?.phone} />
        </View>

        {/* Documents */}
        <Text style={styles.sectionTitle}>Documents</Text>
        {docs.length === 0 ? (
          <View style={styles.card}>
            <Text style={styles.emptyText}>No documents uploaded.</Text>
          </View>
        ) : (
          docs.map((d) => (
            <TouchableOpacity
              key={d.key}
              style={styles.docCard}
              activeOpacity={0.8}
              disabled={!d.url}
              onPress={() => d.url && setViewerUrl(d.url)}
            >
              <View style={styles.docHeader}>
                <Ionicons name="document-attach-outline" size={16} color={lightColors.primary} />
                <Text style={styles.docLabel}>{d.label}</Text>
                {d.url ? <Ionicons name="expand-outline" size={16} color="#9CA3AF" /> : null}
              </View>
              {d.url ? (
                <Image source={{ uri: d.url }} style={styles.docImage} resizeMode="cover" />
              ) : (
                <View style={styles.docError}>
                  <Ionicons name="cloud-offline-outline" size={22} color="#9CA3AF" />
                  <Text style={styles.docErrorText}>Could not load document.</Text>
                </View>
              )}
            </TouchableOpacity>
          ))
        )}

        {/* Home-cook permit ladder */}
        {seller.seller_type === 'home_cook' && (
          <>
            <Text style={styles.sectionTitle}>Permit status</Text>
            <View style={styles.card}>
              <Text style={styles.permitHint}>
                Home-cook compliance ladder. "Approved" unlocks high-risk listings.
              </Text>
              <View style={styles.permitRow}>
                {PERMIT_STEPS.map((p) => {
                  const active = seller.permit_status === p.key;
                  return (
                    <TouchableOpacity
                      key={p.key}
                      style={[styles.permitBtn, active && styles.permitBtnActive]}
                      disabled={busy}
                      onPress={() => setPermit(p.key)}
                    >
                      <Text style={[styles.permitBtnText, active && styles.permitBtnTextActive]}>
                        {p.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </>
        )}
      </ScrollView>

      {/* Action bar */}
      <View style={[styles.actionBar, { paddingBottom: insets.bottom + 12 }]}>
        <TouchableOpacity
          style={[styles.actBtn, styles.rejectBtn, busy && styles.btnDisabled]}
          disabled={busy}
          onPress={() => setRejectOpen(true)}
        >
          <Text style={styles.actText}>Reject</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[
            styles.actBtn,
            styles.approveBtn,
            (busy || seller.verification_status === 'approved') && styles.btnDisabled,
          ]}
          disabled={busy || seller.verification_status === 'approved'}
          onPress={approve}
        >
          {busy ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.actText}>
              {seller.verification_status === 'approved' ? 'Approved' : 'Approve'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Full-screen doc viewer */}
      <Modal visible={!!viewerUrl} transparent animationType="fade" onRequestClose={() => setViewerUrl(null)}>
        <View style={styles.viewerBackdrop}>
          {viewerUrl ? (
            <Image source={{ uri: viewerUrl }} style={styles.viewerImage} resizeMode="contain" />
          ) : null}
          <TouchableOpacity
            style={[styles.viewerClose, { top: insets.top + 12 }]}
            onPress={() => setViewerUrl(null)}
          >
            <Ionicons name="close" size={26} color="#fff" />
          </TouchableOpacity>
        </View>
      </Modal>

      {/* Reject reason modal */}
      <Modal visible={rejectOpen} transparent animationType="fade" onRequestClose={() => setRejectOpen(false)}>
        <KeyboardAvoidingView
          style={styles.modalBackdrop}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Reject seller</Text>
            <Text style={styles.modalSub}>
              The applicant sees this reason. Be specific about what to fix.
            </Text>
            <TextInput
              style={styles.reasonInput}
              placeholder="Rejection reason (required)"
              placeholderTextColor="#9CA3AF"
              value={reason}
              onChangeText={setReason}
              multiline
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={[styles.actBtn, styles.cancelBtn]}
                onPress={() => setRejectOpen(false)}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.actBtn, styles.rejectBtn, (!reason.trim() || busy) && styles.btnDisabled]}
                disabled={!reason.trim() || busy}
                onPress={submitReject}
              >
                {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.actText}>Reject</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

function Header({ navigation }: { navigation: Props['navigation'] }) {
  return (
    <View style={styles.header}>
      <TouchableOpacity
        onPress={() => navigation.goBack()}
        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
      >
        <Ionicons name="arrow-back" size={24} color={lightColors.textDark} />
      </TouchableOpacity>
      <Text style={styles.headerTitle}>Seller review</Text>
      <View style={{ width: 24 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F7F9F8' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#ECEFED',
  },
  headerTitle: { fontSize: 20, fontWeight: '800', color: lightColors.textDark },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10 },
  emptyText: { fontSize: 14, color: lightColors.textMuted },
  card: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: lightColors.divider,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  bizName: { flex: 1, fontSize: 18, fontWeight: '800', color: lightColors.textDark, marginRight: 8 },
  statusPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
  statusPillText: { fontSize: 12, fontWeight: '700' },
  infoRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 5 },
  infoLabel: { fontSize: 13, color: lightColors.textMuted, width: 64 },
  infoValue: { flex: 1, fontSize: 13, color: lightColors.textDark, fontWeight: '600' },
  rejectionBox: {
    backgroundColor: 'rgba(231,76,60,0.08)',
    borderRadius: 10,
    padding: 10,
    marginTop: 8,
  },
  rejectionText: { fontSize: 13, color: lightColors.error },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: lightColors.textDark,
    marginTop: 10,
    marginBottom: 10,
  },
  docCard: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: lightColors.divider,
  },
  docHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 10 },
  docLabel: { flex: 1, fontSize: 14, fontWeight: '700', color: lightColors.textDark },
  docImage: { width: '100%', height: 180, borderRadius: 12, backgroundColor: '#F3F4F6' },
  docError: {
    height: 110,
    borderRadius: 12,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  docErrorText: { fontSize: 12, color: lightColors.textMuted },
  permitHint: { fontSize: 12, color: lightColors.textMuted, marginBottom: 10 },
  permitRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  permitBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: lightColors.inputBg,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  permitBtnActive: { backgroundColor: lightColors.primary },
  permitBtnText: { fontSize: 13, fontWeight: '600', color: lightColors.textDark },
  permitBtnTextActive: { color: '#fff', fontWeight: '700' },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#ECEFED',
  },
  actBtn: {
    flex: 1,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBtn: { backgroundColor: lightColors.primary },
  rejectBtn: { backgroundColor: lightColors.error },
  cancelBtn: { backgroundColor: lightColors.inputBg },
  btnDisabled: { opacity: 0.5 },
  actText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  cancelText: { color: lightColors.textDark, fontWeight: '700', fontSize: 15 },
  viewerBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  viewerImage: { flex: 1 },
  viewerClose: {
    position: 'absolute',
    right: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    padding: 24,
  },
  modalCard: { backgroundColor: '#fff', borderRadius: 20, padding: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: lightColors.textDark },
  modalSub: { fontSize: 13, color: lightColors.textMuted, marginTop: 4, marginBottom: 12 },
  reasonInput: {
    backgroundColor: lightColors.inputBg,
    borderRadius: 12,
    padding: 12,
    minHeight: 90,
    textAlignVertical: 'top',
    fontSize: 14,
    color: lightColors.textDark,
  },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 14 },
});
