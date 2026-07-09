// app/lib/notify.ts — imperative notification API (toasts + branded dialogs).
//
// Mirrors the navigationRef singleton pattern: NotificationProvider
// (app/components/ui/Notify.tsx) registers its handlers into a module-level
// ref on mount, and `notify.*` delegates to them. This means notify works
// anywhere — inside components (via useNotify()) or in plain modules,
// services, and callbacks outside the React tree.
//
// Called before the provider mounts? Toasts are queued and flushed on
// registration; dialogs resolve immediately (alert -> void, confirm -> false)
// so awaiting callers never hang.

export type ToastKind = 'success' | 'error' | 'info' | 'warning';

export interface ToastOptions {
  title?: string;
  duration?: number; // ms; defaults: 3200 (success/info/warning), 4500 (error)
}

export interface AlertOptions {
  title?: string;
  message: string;
  confirmText?: string; // default 'OK'
}

export interface ConfirmOptions {
  title?: string;
  message: string;
  confirmText?: string; // default 'Confirm'
  cancelText?: string; // default 'Cancel'
  destructive?: boolean; // red confirm button, backdrop tap disabled
  onConfirm?: () => void; // called in addition to resolving true
  onCancel?: () => void; // called in addition to resolving false
}

export interface NotifyHandlers {
  showToast: (kind: ToastKind, message: string, opts?: ToastOptions) => void;
  showAlert: (opts: AlertOptions) => Promise<void>;
  showConfirm: (opts: ConfirmOptions) => Promise<boolean>;
}

// ── Module-level mutable ref (like navigationRef) ────────────────────────────

let handlers: NotifyHandlers | null = null;

interface QueuedToast {
  kind: ToastKind;
  message: string;
  opts?: ToastOptions;
}

const MAX_PENDING = 10;
let pendingToasts: QueuedToast[] = [];

/**
 * Called by NotificationProvider on mount/unmount. Flushes any toasts that
 * were fired before the provider existed.
 */
export function registerNotifyHandlers(next: NotifyHandlers | null): void {
  handlers = next;
  if (next && pendingToasts.length > 0) {
    const flush = pendingToasts;
    pendingToasts = [];
    for (const t of flush) {
      next.showToast(t.kind, t.message, t.opts);
    }
  }
}

function toast(kind: ToastKind, message: string, opts?: ToastOptions): void {
  if (handlers) {
    handlers.showToast(kind, message, opts);
    return;
  }
  // Provider not mounted yet — queue safely (bounded).
  if (pendingToasts.length >= MAX_PENDING) pendingToasts.shift();
  pendingToasts.push({ kind, message, opts });
}

// ── Public API ───────────────────────────────────────────────────────────────

export const notify = {
  success(message: string, opts?: ToastOptions): void {
    toast('success', message, opts);
  },
  error(message: string, opts?: ToastOptions): void {
    toast('error', message, opts);
  },
  info(message: string, opts?: ToastOptions): void {
    toast('info', message, opts);
  },
  warning(message: string, opts?: ToastOptions): void {
    toast('warning', message, opts);
  },
  toast(kind: ToastKind, message: string, opts?: ToastOptions): void {
    toast(kind, message, opts);
  },

  /**
   * Single-button branded modal. Replaces informational Alert.alert that
   * needs acknowledgment. Resolves when the user dismisses it.
   */
  alert(opts: AlertOptions): Promise<void> {
    if (handlers) return handlers.showAlert(opts);
    return Promise.resolve(); // no provider — never hang callers
  },

  /**
   * Two-button branded modal. Replaces confirm-style Alert.alert.
   * Resolves true on confirm, false on cancel. onConfirm/onCancel callbacks
   * (if provided) are invoked in addition to the resolution.
   */
  confirm(opts: ConfirmOptions): Promise<boolean> {
    if (handlers) return handlers.showConfirm(opts);
    return Promise.resolve(false); // no provider — safe default, no callbacks
  },
};

/** Hook flavor for components — returns the same imperative API. */
export function useNotify(): typeof notify {
  return notify;
}

export default notify;
