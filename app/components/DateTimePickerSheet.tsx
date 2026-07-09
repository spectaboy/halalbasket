import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Pressable,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Ionicons } from '@expo/vector-icons';
import { lightColors } from '../../constants/theme';
import BackgroundPattern from './BackgroundPattern';

export type ArriveBySelection = {
  arriveBy: Date;
  flexibilityMins: number;
  mode: 'exact' | 'window';
  windowMinutes?: number;
};

export interface DateTimePickerSheetProps {
  visible: boolean;
  initial?: Date | null;
  onClose: () => void;
  onConfirm: (value: ArriveBySelection) => void;
  role?: 'rider' | 'driver' | 'both';
}

// Snap a datetime to the nearest 5-minute step so the picker only ever offers
// 2:10 / 2:15 / 2:20 ... never an arbitrary minute.
const roundToFive = (d: Date): Date => {
  const r = new Date(d);
  r.setMinutes(Math.round(r.getMinutes() / 5) * 5, 0, 0);
  return r;
};

const DateTimePickerSheet: React.FC<DateTimePickerSheetProps> = ({
  visible,
  initial,
  onClose,
  onConfirm,
  role = 'rider',
}) => {
  const [date, setDate] = useState<Date>(roundToFive(initial ?? new Date()));

  // Scheduling window: now through 7 days from now
  const minDate = new Date();
  const maxDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  useEffect(() => {
    if (visible) setDate(roundToFive(initial ?? new Date()));
  }, [visible, initial]);

  const handleNow = () => setDate(roundToFive(new Date()));

  const handleConfirm = () => {
    onConfirm({
      arriveBy: date,
      flexibilityMins: 30,
      mode: 'window',
      windowMinutes: 30,
    });
    onClose();
  };

  const openAndroidPicker = (pickerMode: 'date' | 'time') => {
    if (Platform.OS !== 'android') return;
    DateTimePickerAndroid.open({
      value: date,
      mode: pickerMode,
      is24Hour: false,
      // Spinner + minuteInterval is the only Android combo that honors 5-min
      // steps; we also snap in onChange so it holds even if a device ignores it.
      display: pickerMode === 'time' ? 'spinner' : 'default',
      minuteInterval: pickerMode === 'time' ? 5 : undefined,
      minimumDate: pickerMode === 'date' ? minDate : undefined,
      maximumDate: pickerMode === 'date' ? maxDate : undefined,
      onChange: (event, selected) => {
        if (event.type !== 'set' || !selected) return;
        let next = new Date(date);
        if (pickerMode === 'date') {
          next.setFullYear(selected.getFullYear(), selected.getMonth(), selected.getDate());
        } else {
          next.setHours(selected.getHours(), selected.getMinutes());
          next = roundToFive(next);
        }
        setDate(next);
      },
    });
  };

  const isDriver = role === 'driver';
  const dateLabel = date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const timeLabel = date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onClose}
    >
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={e => e.stopPropagation()}>
          <BackgroundPattern />

          {/* Header row */}
          <View style={styles.header}>
            <View style={styles.iconWrap}>
              <Ionicons name={isDriver ? 'car-outline' : 'time-outline'} size={20} color="#1A5C38" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Leaving at</Text>
              <Text style={styles.subtitle}>
                {isDriver ? 'When are you heading out?' : "We'll find rides leaving around this time."}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <Ionicons name="close" size={20} color={lightColors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Date & Time rows */}
          {Platform.OS === 'android' ? (
            <>
              <TouchableOpacity style={styles.fieldRow} onPress={() => openAndroidPicker('date')}>
                <Text style={styles.fieldLabel}>Date</Text>
                <Text style={styles.fieldValue}>{dateLabel}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.fieldRow, styles.fieldRowLast]} onPress={() => openAndroidPicker('time')}>
                <Text style={styles.fieldLabel}>Leave at</Text>
                <Text style={styles.fieldValue}>{timeLabel}</Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <View style={styles.fieldRow}>
                <Text style={styles.fieldLabel}>Date</Text>
                <DateTimePicker
                  value={date}
                  mode="date"
                  display="compact"
                  minimumDate={minDate}
                  maximumDate={maxDate}
                  onChange={(_, d) => {
                    if (!d) return;
                    const next = new Date(date);
                    next.setFullYear(d.getFullYear(), d.getMonth(), d.getDate());
                    setDate(next);
                  }}
                  themeVariant="light"
                />
              </View>
              <View style={[styles.fieldRow, styles.fieldRowLast]}>
                <Text style={styles.fieldLabel}>Leave at</Text>
                <DateTimePicker
                  value={date}
                  mode="time"
                  display="compact"
                  minuteInterval={5}
                  onChange={(_, d) => {
                    if (!d) return;
                    const next = new Date(date);
                    next.setHours(d.getHours(), d.getMinutes());
                    setDate(roundToFive(next));
                  }}
                  themeVariant="light"
                />
              </View>
            </>
          )}

          {/* Actions */}
          <View style={styles.actions}>
            <TouchableOpacity style={styles.nowBtn} onPress={handleNow} activeOpacity={0.75}>
              <Ionicons name="flash" size={14} color="#1A5C38" />
              <Text style={styles.nowBtnText}>Now</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.doneBtn} onPress={handleConfirm} activeOpacity={0.85}>
              <Text style={styles.doneBtnText}>Confirm</Text>
            </TouchableOpacity>
          </View>

        </Pressable>
      </Pressable>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.40)',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 20,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 20,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EAF5EE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    color: '#1A2E1F',
    fontWeight: '800',
    fontSize: 16,
    marginBottom: 2,
  },
  subtitle: {
    color: lightColors.textMuted,
    fontSize: 12,
    lineHeight: 16,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: lightColors.inputBg,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    marginBottom: 8,
  },
  fieldRowLast: {
    marginBottom: 0,
  },
  fieldLabel: {
    color: '#1A2E1F',
    fontSize: 14,
    fontWeight: '600',
  },
  fieldValue: {
    color: '#1A5C38',
    fontSize: 14,
    fontWeight: '700',
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 16,
  },
  nowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EAF5EE',
    borderRadius: 9999,
    paddingHorizontal: 18,
    paddingVertical: 13,
  },
  nowBtnText: {
    color: '#1A5C38',
    fontWeight: '700',
    fontSize: 14,
  },
  doneBtn: {
    flex: 1,
    backgroundColor: '#1A5C38',
    borderRadius: 9999,
    paddingVertical: 13,
    alignItems: 'center',
    shadowColor: '#1A5C38',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  doneBtnText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 15,
  },
});

export default DateTimePickerSheet;
