// HalalBasket — post-delivery review modal: tappable stars + optional comment.

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { lightColors, spacing } from '../../constants/theme';
import { supabase } from '../config/supabase';
import { useSession } from '../context/SessionContext';
import { notify } from '../lib/notify';
import type { MainStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<MainStackParamList, 'LeaveReview'>;

const RATING_LABELS = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

export default function LeaveReviewScreen({ navigation, route }: Props) {
  const { orderId, sellerId, sellerName } = route.params;
  const { user } = useSession();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!user || rating < 1) return;
    setSubmitting(true);
    const { error } = await supabase.from('reviews').insert({
      order_id: orderId,
      customer_id: user.id,
      seller_id: sellerId,
      rating,
      comment: comment.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      notify.error(
        error.message.includes('duplicate')
          ? 'You already reviewed this order.'
          : 'Could not submit your review. Try again.'
      );
      return;
    }
    notify.success('Thanks for your review!');
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.closeBtn}>
            <Ionicons name="close" size={24} color={lightColors.textDark} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Rate your order</Text>
          <View style={styles.closeBtn} />
        </View>

        <View style={styles.content}>
          <Text style={styles.prompt}>How was {sellerName}?</Text>

          <View style={styles.starsRow}>
            {[1, 2, 3, 4, 5].map((star) => (
              <TouchableOpacity key={star} onPress={() => setRating(star)} activeOpacity={0.7}>
                <Ionicons
                  name={star <= rating ? 'star' : 'star-outline'}
                  size={44}
                  color={star <= rating ? '#F5A623' : lightColors.textMuted}
                />
              </TouchableOpacity>
            ))}
          </View>
          <Text style={styles.ratingLabel}>{RATING_LABELS[rating]}</Text>

          <TextInput
            style={styles.commentInput}
            placeholder="Share what you loved (or what could be better)…"
            placeholderTextColor={lightColors.textMuted}
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={500}
            textAlignVertical="top"
          />
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.submitBtn, rating < 1 && styles.submitBtnDisabled]}
            activeOpacity={0.9}
            disabled={rating < 1 || submitting}
            onPress={() => void submit()}
          >
            {submitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitText}>Submit review</Text>
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: lightColors.background,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  closeBtn: {
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: lightColors.textDark,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    padding: spacing.xl,
    gap: 12,
  },
  prompt: {
    fontSize: 20,
    fontWeight: '800',
    color: lightColors.textDark,
    textAlign: 'center',
    marginTop: spacing.lg,
  },
  starsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: spacing.md,
  },
  ratingLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: lightColors.primary,
    minHeight: 20,
  },
  commentInput: {
    alignSelf: 'stretch',
    minHeight: 120,
    backgroundColor: lightColors.inputBg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: lightColors.divider,
    padding: spacing.md,
    fontSize: 14.5,
    color: lightColors.textDark,
    marginTop: spacing.md,
  },
  footer: {
    padding: spacing.md,
  },
  submitBtn: {
    backgroundColor: lightColors.primary,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  submitBtnDisabled: {
    opacity: 0.4,
  },
  submitText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
  },
});
