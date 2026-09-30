import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CartItem, CartSellerInfo } from '../context/CartContext';
import {
  initialDemoState,
  createDemoOrder,
  advanceDemoOrder,
  reviewDemoOrder,
  type DemoState,
} from './model';
import { isDemoId, makeDemoWindows, localCookDate } from './catalog';

const STORAGE_KEY = '@halalbasket/local-demo/v1';
type DemoContextValue = DemoState & {
  ready: boolean;
  setEnabled: (enabled: boolean) => void;
  reset: () => void;
  toggleFavourite: (id: string) => void;
  setAddress: (address: string) => void;
  placeOrder: (
    items: CartItem[],
    seller: CartSellerInfo,
    address: string,
    instructions: string,
  ) => string;
  advanceOrder: (id: string) => void;
  reviewOrder: (id: string, rating: number, comment: string) => void;
};
const DemoContext = createContext<DemoContextValue | null>(null);

export function DemoProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState(() => initialDemoState(__DEV__));
  const [ready, setReady] = useState(false);
  const current = useRef(state);
  const writes = useRef(Promise.resolve());
  const update = useCallback((change: (previous: DemoState) => DemoState) => {
    const next = change(current.current);
    current.current = next;
    setState(next);
    // Serialize storage writes so an older snapshot cannot overwrite a newer order.
    writes.current = writes.current
      .then(() => AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next)))
      .catch(() => {});
  }, []);
  useEffect(() => {
    let active = true;
    void AsyncStorage.getItem(STORAGE_KEY)
      .then((raw) => {
        if (!active || !raw) return;
        const saved = JSON.parse(raw) as DemoState;
        if (
          saved.version !== 1 ||
          !Array.isArray(saved.orders) ||
          !Array.isArray(saved.favourites) ||
          !Array.isArray(saved.windows) ||
          typeof saved.address !== 'string' ||
          saved.orders.some(
            (o) => !isDemoId(o.id) || !Array.isArray(o.order_items) || !Array.isArray(o.reviews),
          )
        )
          return;
        // Production builds always start in the real marketplace. The demo is a development tool.
        const next = {
          ...saved,
          enabled: __DEV__ && saved.enabled,
          windows: saved.windows.some((w) => Date.parse(w.order_cutoff) <= Date.now() || w.cook_date !== localCookDate(new Date(w.pickup_ready_at)))
            ? makeDemoWindows()
            : saved.windows,
        };
        current.current = next;
        setState(next);
      })
      .catch(() => {})
      .finally(() => {
        if (active) setReady(true);
      });
    return () => {
      active = false;
    };
  }, []);
  const value: DemoContextValue = {
    ...state,
    ready,
    setEnabled: (enabled) => update((s) => ({ ...s, enabled: __DEV__ && enabled })),
    reset: () => update((s) => initialDemoState(s.enabled)),
    setAddress: (address) => update((s) => ({ ...s, address })),
    toggleFavourite: (id) =>
      update((s) => ({
        ...s,
        favourites: s.favourites.includes(id)
          ? s.favourites.filter((value) => value !== id)
          : [...s.favourites, id],
      })),
    placeOrder: (items, seller, address, instructions) => {
      if (!current.current.enabled) throw new Error('The preview marketplace is off.');
      const order = createDemoOrder(items, seller, address, instructions, current.current.windows);
      update((s) => ({ ...s, address, orders: [order, ...s.orders] }));
      return order.id;
    },
    advanceOrder: (id) =>
      update((s) => ({
        ...s,
        orders: s.orders.map((o) => (o.id === id ? advanceDemoOrder(o) : o)),
      })),
    reviewOrder: (id, rating, comment) =>
      update((s) => ({
        ...s,
        orders: s.orders.map((o) => (o.id === id ? reviewDemoOrder(o, rating, comment) : o)),
      })),
  };
  return <DemoContext.Provider value={value}>{children}</DemoContext.Provider>;
}

export function useDemo() {
  const context = useContext(DemoContext);
  if (!context) throw new Error('useDemo must be used within DemoProvider');
  return context;
}
