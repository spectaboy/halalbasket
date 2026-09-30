import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { lightColors } from '../../../constants/theme';
import { fonts } from '../../../constants/typography';

export default function ProfileConnectionError({ message, onRetry, onSignOut }: {
  message: string;
  onRetry: () => void;
  onSignOut: () => void;
}) {
  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.content}>
        <Ionicons name="cloud-offline-outline" size={44} color={lightColors.primary} />
        <Text style={styles.title}>Let’s try that again</Text>
        <Text style={styles.message} accessibilityRole="alert">{message}</Text>
        <Pressable onPress={onRetry} accessibilityRole="button" style={styles.button}>
          <Text style={styles.buttonLabel}>Try again</Text>
        </Pressable>
        <Pressable onPress={onSignOut} accessibilityRole="button" style={styles.signOut}>
          <Text style={styles.signOutLabel}>Sign out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: lightColors.background, alignItems: 'center', justifyContent: 'center' },
  content: { padding: 28, width: '100%', maxWidth: 480, alignItems: 'center', gap: 20 },
  title: { fontFamily: fonts.bold, fontSize: 27, color: lightColors.textDark, textAlign: 'center' },
  message: { fontFamily: fonts.regular, fontSize: 16, lineHeight: 25, color: lightColors.textMuted, textAlign: 'center' },
  button: { padding: 18, borderRadius: 18, backgroundColor: lightColors.primary, alignSelf: 'stretch', alignItems: 'center' },
  buttonLabel: { fontFamily: fonts.bold, fontSize: 16, color: '#fff' },
  signOut: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 20 },
  signOutLabel: { fontFamily: fonts.semibold, color: lightColors.primary, fontSize: 15 },
});
