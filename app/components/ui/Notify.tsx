// app/components/ui/Notify.tsx — branded in-app notification system.
//
// <NotificationProvider> renders, above all app content:
//   • a TOAST host — top-of-screen sliding toasts (success / error / info /
//     warning), one visible at a time with a small queue;
//   • a DIALOG host — a centered RN Modal for notify.alert / notify.confirm,
//     replacing native Alert.alert with a white-card / forest-green dialog.
//
// It registers imperative handlers into app/lib/notify.ts on mount (the same
// singleton pattern as app/navigation/navigationRef.ts), so `notify.*` works
// from anywhere — including plain modules outside the React tree.

import React from 'react';
import {
  Animated,
  Easing,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  SafeAreaProvider,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';
import { lightColors } from '../../../constants/theme';
import {
  registerNotifyHandlers,
  type AlertOptions,
  type ConfirmOptions,
  type ToastKind,
  type ToastOptions,
} from '../../lib/notify';

// ── Constants ────────────────────────────────────────────────────────────────

const TOAST_DURATION_DEFAULT = 3200;
const TOAST_DURATION_ERROR = 4500;
const TOAST_OFFSCREEN_Y = -160;
const TOAST_QUEUE_MAX = 4;
const WARNING_AMBER = '#F5A623';

type IoniconName = React.ComponentProps<typeof Ionicons>['name'];

const KIND_META: Record<ToastKind, { icon: IoniconName; color: string }> = {
  success: { icon: 'checkmark-circle', color: lightColors.primary },
  error: { icon: 'alert-circle', color: lightColors.error },
  warning: { icon: 'warning', color: WARNING_AMBER },
  info: { icon: 'information-circle', color: lightColors.primary },
};

// ── Internal types ───────────────────────────────────────────────────────────

interface ToastData {
  id: number;
  kind: ToastKind;
  message: string;
  title?: string;
  duration: number;
}

interface DialogData {
  id: number;
  mode: 'alert' | 'confirm';
  title?: string;
  message: string;
  confirmText: string;
  cancelText: string;
  destructive: boolean;
  onConfirm?: () => void;
  onCancel?: () => void;
  resolve: (confirmed: boolean) => void;
}

let nextId = 1;

// ── Toast card ───────────────────────────────────────────────────────────────

function ToastCard({
  toast,
  topInset,
  onDone,
}: {
  toast: ToastData;
  topInset: number;
  onDone: (id: number) => void;
}) {
  const translateY = React.useRef(new Animated.Value(TOAST_OFFSCREEN_Y)).current;
  const opacity = React.useRef(new Animated.Value(0)).current;
  const scale = React.useRef(new Animated.Value(0.95)).current;
  const progress = React.useRef(new Animated.Value(1)).current;
  const dismissedRef = React.useRef(false);
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const dismiss = React.useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    Animated.parallel([
      Animated.timing(translateY, {
        toValue: TOAST_OFFSCREEN_Y,
        duration: 220,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => onDone(toast.id));
  }, [onDone, opacity, toast.id, translateY]);

  React.useEffect(() => {
    // Slide down + fade + settle-in scale.
    Animated.parallel([
      Animated.spring(translateY, {
        toValue: 0,
        tension: 70,
        friction: 11,
        useNativeDriver: true,
      }),
      Animated.spring(scale, {
        toValue: 1,
        tension: 70,
        friction: 11,
        useNativeDriver: true,
      }),
      Animated.timing(opacity, {
        toValue: 1,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start();

    // Auto-dismiss progress bar (JS-driven width; separate value from the
    // native-driven transforms above, so no driver conflict).
    Animated.timing(progress, {
      toValue: 0,
      duration: toast.duration,
      easing: Easing.linear,
      useNativeDriver: false,
    }).start();

    timerRef.current = setTimeout(dismiss, toast.duration);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // Intentionally run once per mounted toast (each toast mounts a new card).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Swipe-up to dismiss. Uses the capture phase so the gesture is claimed
  // from the inner Pressable once upward movement starts (tap still works).
  const panResponder = React.useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, g) =>
        g.dy < -4 && Math.abs(g.dy) > Math.abs(g.dx),
      onMoveShouldSetPanResponderCapture: (_evt, g) =>
        g.dy < -4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_evt, g) => {
        if (g.dy < 0) translateY.setValue(g.dy);
      },
      onPanResponderRelease: (_evt, g) => {
        if (g.dy < -24 || g.vy < -0.4) {
          dismiss();
        } else {
          Animated.spring(translateY, {
            toValue: 0,
            tension: 90,
            friction: 10,
            useNativeDriver: true,
          }).start();
        }
      },
    }),
  ).current;

  const meta = KIND_META[toast.kind];
  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <Animated.View
      style={[
        styles.toastWrap,
        { paddingTop: topInset + 8, opacity, transform: [{ translateY }, { scale }] },
      ]}
      pointerEvents="box-none"
    >
      <View {...panResponder.panHandlers}>
        <Pressable
          onPress={dismiss}
          style={styles.toastCard}
          accessibilityRole="alert"
          accessibilityLabel={
            toast.title ? `${toast.title}. ${toast.message}` : toast.message
          }
        >
          <View style={[styles.toastChip, { backgroundColor: meta.color + '1A' }]}>
            <Ionicons name={meta.icon} size={20} color={meta.color} />
          </View>
          <View style={styles.toastTextCol}>
            {toast.title ? (
              <Text style={styles.toastTitle} numberOfLines={1}>
                {toast.title}
              </Text>
            ) : null}
            <Text
              style={[
                styles.toastMessage,
                !toast.title && styles.toastMessageSolo,
              ]}
              numberOfLines={3}
            >
              {toast.message}
            </Text>
          </View>
          {/* Auto-dismiss countdown bar, kind-colored, clipped to the card radius. */}
          <Animated.View
            style={[
              styles.toastProgress,
              { backgroundColor: meta.color, width: progressWidth },
            ]}
          />
        </Pressable>
      </View>
    </Animated.View>
  );
}

// ── Dialog host ──────────────────────────────────────────────────────────────

function DialogHost({
  dialog,
  onClose,
}: {
  dialog: DialogData | null;
  onClose: (id: number, confirmed: boolean) => void;
}) {
  const backdropOpacity = React.useRef(new Animated.Value(0)).current;
  const cardScale = React.useRef(new Animated.Value(0.92)).current;
  const cardOpacity = React.useRef(new Animated.Value(0)).current;
  const closingRef = React.useRef(false);

  React.useEffect(() => {
    if (!dialog) return;
    closingRef.current = false;
    backdropOpacity.setValue(0);
    cardScale.setValue(0.92);
    cardOpacity.setValue(0);
    Animated.parallel([
      Animated.timing(backdropOpacity, {
        toValue: 1,
        duration: 180,
        useNativeDriver: true,
      }),
      Animated.spring(cardScale, {
        toValue: 1,
        tension: 90,
        friction: 10,
        useNativeDriver: true,
      }),
      Animated.timing(cardOpacity, {
        toValue: 1,
        duration: 160,
        useNativeDriver: true,
      }),
    ]).start();
  }, [dialog, backdropOpacity, cardScale, cardOpacity]);

  const close = React.useCallback(
    (confirmed: boolean) => {
      if (!dialog || closingRef.current) return;
      closingRef.current = true;
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(cardOpacity, {
          toValue: 0,
          duration: 130,
          useNativeDriver: true,
        }),
        Animated.timing(cardScale, {
          toValue: 0.95,
          duration: 130,
          useNativeDriver: true,
        }),
      ]).start(() => onClose(dialog.id, confirmed));
    },
    [dialog, onClose, backdropOpacity, cardOpacity, cardScale],
  );

  if (!dialog) return null;

  const handleBackdrop = () => {
    if (dialog.mode === 'alert') {
      close(true); // acknowledge
    } else if (!dialog.destructive) {
      close(false); // backdrop tap = cancel (unless destructive)
    }
  };

  const confirmBg = dialog.destructive
    ? lightColors.error
    : lightColors.primary;
  const dialogIcon: IoniconName = dialog.destructive
    ? 'alert-circle'
    : 'information-circle';

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => close(dialog.mode !== 'confirm')}
    >
      <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={handleBackdrop} />
        <Animated.View
          style={[
            styles.dialogCard,
            { opacity: cardOpacity, transform: [{ scale: cardScale }] },
          ]}
        >
          <View style={[styles.dialogChip, { backgroundColor: confirmBg + '1A' }]}>
            <Ionicons name={dialogIcon} size={30} color={confirmBg} />
          </View>
          {dialog.title ? (
            <Text style={styles.dialogTitle}>{dialog.title}</Text>
          ) : null}
          <ScrollView style={styles.dialogMessageScroll} bounces={false}>
            <Text style={styles.dialogMessage}>{dialog.message}</Text>
          </ScrollView>
          <View
            style={[
              styles.dialogButtons,
              dialog.mode === 'alert' && styles.dialogButtonsSingle,
            ]}
          >
            {dialog.mode === 'confirm' ? (
              <Pressable
                onPress={() => close(false)}
                style={({ pressed }) => [
                  styles.btn,
                  styles.btnGhost,
                  pressed && styles.btnGhostPressed,
                ]}
                accessibilityRole="button"
              >
                <Text style={styles.btnGhostText}>{dialog.cancelText}</Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => close(true)}
              style={({ pressed }) => [
                styles.btn,
                { backgroundColor: confirmBg },
                pressed && {
                  backgroundColor: dialog.destructive
                    ? '#C0392B'
                    : lightColors.primaryDark,
                },
              ]}
              accessibilityRole="button"
            >
              <Text style={styles.btnPrimaryText}>{dialog.confirmText}</Text>
            </Pressable>
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

// ── Provider ─────────────────────────────────────────────────────────────────

function NotificationRoot({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();

  const [toast, setToast] = React.useState<ToastData | null>(null);
  const toastQueueRef = React.useRef<ToastData[]>([]);

  const [dialog, setDialog] = React.useState<DialogData | null>(null);
  const dialogQueueRef = React.useRef<DialogData[]>([]);
  const dialogRef = React.useRef<DialogData | null>(null);
  dialogRef.current = dialog;

  // — toasts —

  const handleToastDone = React.useCallback((id: number) => {
    setToast((current) => {
      if (current && current.id !== id) return current;
      return toastQueueRef.current.shift() ?? null;
    });
  }, []);

  const showToast = React.useCallback(
    (kind: ToastKind, message: string, opts?: ToastOptions) => {
      const data: ToastData = {
        id: nextId++,
        kind,
        message,
        title: opts?.title,
        duration:
          opts?.duration ??
          (kind === 'error' ? TOAST_DURATION_ERROR : TOAST_DURATION_DEFAULT),
      };
      setToast((current) => {
        if (!current) return data;
        // Queue behind the visible toast; bound the queue and drop the oldest.
        if (toastQueueRef.current.length >= TOAST_QUEUE_MAX) {
          toastQueueRef.current.shift();
        }
        toastQueueRef.current.push(data);
        return current;
      });
    },
    [],
  );

  // — dialogs —

  const enqueueDialog = React.useCallback((data: DialogData) => {
    if (dialogRef.current) {
      dialogQueueRef.current.push(data);
    } else {
      setDialog(data);
    }
  }, []);

  const handleDialogClose = React.useCallback(
    (id: number, confirmed: boolean) => {
      const current = dialogRef.current;
      setDialog(dialogQueueRef.current.shift() ?? null);
      if (!current || current.id !== id) return;
      try {
        if (confirmed) current.onConfirm?.();
        else current.onCancel?.();
      } finally {
        current.resolve(confirmed);
      }
    },
    [],
  );

  const showAlert = React.useCallback(
    (opts: AlertOptions): Promise<void> =>
      new Promise<void>((resolve) => {
        enqueueDialog({
          id: nextId++,
          mode: 'alert',
          title: opts.title,
          message: opts.message,
          confirmText: opts.confirmText ?? 'OK',
          cancelText: '',
          destructive: false,
          resolve: () => resolve(),
        });
      }),
    [enqueueDialog],
  );

  const showConfirm = React.useCallback(
    (opts: ConfirmOptions): Promise<boolean> =>
      new Promise<boolean>((resolve) => {
        enqueueDialog({
          id: nextId++,
          mode: 'confirm',
          title: opts.title,
          message: opts.message,
          confirmText: opts.confirmText ?? 'Confirm',
          cancelText: opts.cancelText ?? 'Cancel',
          destructive: opts.destructive === true,
          onConfirm: opts.onConfirm,
          onCancel: opts.onCancel,
          resolve,
        });
      }),
    [enqueueDialog],
  );

  // Register the imperative handlers (navigationRef-style singleton).
  React.useEffect(() => {
    registerNotifyHandlers({ showToast, showAlert, showConfirm });
    return () => registerNotifyHandlers(null);
  }, [showToast, showAlert, showConfirm]);

  return (
    <View style={styles.root} pointerEvents="box-none">
      {children}
      {/* Toast overlay — absolute, above the navigator (incl. maps). */}
      <View style={styles.toastHost} pointerEvents="box-none">
        {toast ? (
          <ToastCard
            key={toast.id}
            toast={toast}
            topInset={insets.top}
            onDone={handleToastDone}
          />
        ) : null}
      </View>
      {/* Dialog — RN Modal, above everything including native modals. */}
      <DialogHost dialog={dialog} onClose={handleDialogClose} />
    </View>
  );
}

export function NotificationProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <SafeAreaProvider>
      <NotificationRoot>{children}</NotificationRoot>
    </SafeAreaProvider>
  );
}

export default NotificationProvider;

// ── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },

  // Toasts
  toastHost: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 9999,
    justifyContent: 'flex-start',
  },
  toastWrap: {
    paddingHorizontal: 16,
  },
  toastCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 12,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: lightColors.divider,
    shadowColor: lightColors.cardShadow,
    shadowOpacity: 0.16,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  toastChip: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toastTextCol: {
    flex: 1,
  },
  toastTitle: {
    color: lightColors.textDark,
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 2,
  },
  toastMessage: {
    color: lightColors.textMuted,
    fontSize: 14,
    lineHeight: 19,
  },
  toastMessageSolo: {
    color: lightColors.textDark,
    fontWeight: '600',
    fontSize: 14.5,
    lineHeight: 20,
  },
  toastProgress: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: 3,
    borderTopRightRadius: 3,
  },

  // Dialog
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 26, 15, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 28,
  },
  dialogCard: {
    width: '100%',
    maxWidth: 340,
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 20,
    alignItems: 'center', // center the icon, title and message
    shadowColor: lightColors.cardShadow,
    shadowOpacity: 0.22,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 12,
  },
  dialogChip: {
    width: 60,
    height: 60,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  dialogTitle: {
    color: lightColors.textDark,
    fontSize: 20,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: -0.3,
    marginBottom: 8,
  },
  dialogMessageScroll: {
    flexGrow: 0,
    flexShrink: 1,
    width: '100%',
    marginBottom: 24,
  },
  dialogMessage: {
    color: lightColors.textMuted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  dialogButtons: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  dialogButtonsSingle: {
    justifyContent: 'center',
  },
  btn: {
    flex: 1,
    minHeight: 52,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  btnGhost: {
    backgroundColor: '#F1F4F2',
  },
  btnGhostPressed: {
    backgroundColor: '#E4EBE7',
  },
  btnGhostText: {
    color: lightColors.textDark,
    fontSize: 15.5,
    fontWeight: '700',
  },
  btnPrimaryText: {
    color: '#FFFFFF',
    fontSize: 15.5,
    fontWeight: '800',
  },
});
