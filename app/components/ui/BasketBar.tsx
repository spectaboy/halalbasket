import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useCart } from '../../context/CartContext';
import { formatMoney } from '../../utils/pricing';
import { fonts } from '../../../constants/typography';

export default function BasketBar({
  onPress,
  bottom = 12,
}: {
  onPress: () => void;
  bottom?: number;
}) {
  const { itemCount, subtotal } = useCart();
  if (!itemCount) return null;
  return (
    <TouchableOpacity
      accessibilityRole="button"
      accessibilityLabel="View basket"
      style={[s.bar, { bottom }]}
      onPress={onPress}
    >
      <View style={s.badge}>
        <Text style={s.text}>{itemCount}</Text>
      </View>
      <Text style={[s.text, { flex: 1 }]}>View basket</Text>
      <Text style={s.text}>{formatMoney(subtotal)}</Text>
      <Ionicons name="arrow-forward" size={19} color="#fff" />
    </TouchableOpacity>
  );
}
const s = StyleSheet.create({
  bar: {
    position: 'absolute',
    left: 20,
    right: 20,
    padding: 16,
    borderRadius: 20,
    backgroundColor: '#205A3C',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    elevation: 4,
  },
  badge: {
    minWidth: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: '#FFFFFF22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { fontFamily: fonts.bold, fontSize: 15, color: '#fff' },
});
