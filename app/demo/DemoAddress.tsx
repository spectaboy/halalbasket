import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useDemo } from './DemoContext';
import { fonts } from '../../constants/typography';

export default function DemoAddress({
  visible,
  onClose,
}: {
  visible: boolean;
  onClose: () => void;
}) {
  const demo = useDemo();
  const [address, setAddress] = useState(demo.address);
  useEffect(() => {
    if (visible) setAddress(demo.address);
  }, [visible, demo.address]);
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={s.backdrop}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={s.card}>
          <Text style={s.title}>Where to?</Text>
          <Text style={s.body}>
            Choose where you want your food delivered.
          </Text>
          <TextInput
            accessibilityLabel="Delivery address"
            value={address}
            onChangeText={setAddress}
            style={s.input}
            multiline
            placeholder="Enter delivery address"
          />
          <TouchableOpacity
            accessibilityRole="button"
            disabled={!address.trim()}
            style={[s.button, !address.trim() && { opacity: 0.4 }]}
            onPress={() => {
              demo.setAddress(address.trim());
              onClose();
            }}
          >
            <Text style={s.buttonText}>Save address</Text>
          </TouchableOpacity>
          <TouchableOpacity accessibilityRole="button" style={s.cancel} onPress={onClose}>
            <Text style={s.body}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#102A2080', justifyContent: 'center', padding: 24 },
  card: { backgroundColor: '#FBF8F1', borderRadius: 24, padding: 24, gap: 16 },
  title: { fontFamily: fonts.extraBold, fontSize: 30, color: '#19382A' },
  body: { fontFamily: fonts.regular, fontSize: 14, lineHeight: 21, color: '#667166' },
  input: {
    borderWidth: 1,
    borderColor: '#D8DFD5',
    borderRadius: 14,
    padding: 14,
    minHeight: 64,
    fontFamily: fonts.medium,
    color: '#19382A',
  },
  button: { backgroundColor: '#205A3C', padding: 17, borderRadius: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontFamily: fonts.bold, fontSize: 16 },
  cancel: { alignItems: 'center', padding: 10 },
});
