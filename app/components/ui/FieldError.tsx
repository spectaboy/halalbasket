// app/components/ui/FieldError.tsx — inline form-field error primitive.
//
// The UX rule: when something's wrong, point AT the field. A toast alone makes
// the user hunt. So: red border on the offending field + a specific red message
// directly under it, all invalid fields flagged at once, and the error clears
// the moment the user fixes it.
//
//   const { errors, setErrors, clearError } = useInlineErrors<MyField>();
//   ...
//   <View onLayout={...}>
//     <TextInput style={[styles.input, errorBorder(!!errors.email)]}
//       onChangeText={(t) => { setEmail(t); clearError('email'); }} />
//     <FieldError message={errors.email} />
//   </View>

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { lightColors } from '../../../constants/theme';

/** Red alert-icon + message row under a field. Renders nothing when empty. */
export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <View style={styles.row} accessibilityLiveRegion="polite">
      <Ionicons
        name="alert-circle"
        size={14}
        color={lightColors.error}
        style={{ marginRight: 5, marginTop: 1 }}
      />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

/** Spread onto an input's style to turn its border red when it has an error. */
export function errorBorder(hasError?: boolean) {
  return hasError
    ? { borderColor: lightColors.error, borderWidth: 1.5 }
    : null;
}

/** Small controller for a screen's field-error map. */
export function useInlineErrors<K extends string>() {
  const [errors, setErrors] = React.useState<Partial<Record<K, string>>>({});

  // Clear one field's error (used on edit, so red vanishes as soon as fixed).
  const clearError = React.useCallback((key: K) => {
    setErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const clearAll = React.useCallback(() => setErrors({}), []);

  return { errors, setErrors, clearError, clearAll };
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: 6,
    paddingHorizontal: 2,
  },
  text: {
    color: lightColors.error,
    fontSize: 12.5,
    fontWeight: '600',
    flex: 1,
    lineHeight: 16,
  },
});
