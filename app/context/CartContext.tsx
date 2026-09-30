// Single-seller cart (Uber Eats model: adding from a second seller prompts a reset).

import React, { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { SellerType, VisibleListingRow } from '../types/database';

export interface CartItem {
  listing: VisibleListingRow;
  quantity: number;
}

export interface CartSellerInfo {
  sellerId: string;
  sellerType: SellerType;
  businessName: string;
  /** Set when the cart was started from a home-cook pre-order window. */
  preOrderWindowId?: string;
}

interface CartContextShape {
  seller: CartSellerInfo | null;
  items: CartItem[];
  subtotal: number;
  itemCount: number;
  /** Returns false if the listing belongs to a different seller than the current cart. */
  addItem: (listing: VisibleListingRow, seller: CartSellerInfo) => boolean;
  setQuantity: (listingId: string, quantity: number) => void;
  removeItem: (listingId: string) => void;
  clearCart: () => void;
  /** Clears and re-adds in one step (used by the "start new basket?" confirm). */
  replaceCart: (listing: VisibleListingRow, seller: CartSellerInfo) => void;
  restoreCart: (items: CartItem[], seller: CartSellerInfo) => void;
}

const CartContext = createContext<CartContextShape | undefined>(undefined);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [seller, setSeller] = useState<CartSellerInfo | null>(null);
  const [items, setItems] = useState<CartItem[]>([]);

  const addItem = useCallback(
    (listing: VisibleListingRow, from: CartSellerInfo): boolean => {
      if (
        seller &&
        (seller.sellerId !== from.sellerId || seller.preOrderWindowId !== from.preOrderWindowId)
      )
        return false;
      setSeller(from);
      setItems((prev) => {
        const existing = prev.find((i) => i.listing.id === listing.id);
        if (existing) {
          return prev.map((i) =>
            i.listing.id === listing.id ? { ...i, quantity: Math.min(99, i.quantity + 1) } : i,
          );
        }
        return [...prev, { listing, quantity: 1 }];
      });
      return true;
    },
    [seller],
  );

  const setQuantity = useCallback((listingId: string, quantity: number) => {
    if (!Number.isFinite(quantity)) return;
    quantity = Math.max(0, Math.min(99, Math.floor(quantity)));
    setItems((prev) => {
      const next =
        quantity <= 0
          ? prev.filter((i) => i.listing.id !== listingId)
          : prev.map((i) => (i.listing.id === listingId ? { ...i, quantity } : i));
      if (next.length === 0) setSeller(null);
      return next;
    });
  }, []);

  const removeItem = useCallback((listingId: string) => setQuantity(listingId, 0), [setQuantity]);

  const clearCart = useCallback(() => {
    setItems([]);
    setSeller(null);
  }, []);

  const replaceCart = useCallback((listing: VisibleListingRow, from: CartSellerInfo) => {
    setSeller(from);
    setItems([{ listing, quantity: 1 }]);
  }, []);

  const restoreCart = useCallback((next: CartItem[], from: CartSellerInfo) => {
    setSeller(next.length ? from : null);
    setItems(next);
  }, []);

  const value = useMemo<CartContextShape>(() => {
    const subtotal = items.reduce((sum, i) => sum + i.listing.price * i.quantity, 0);
    const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);
    return {
      seller,
      items,
      subtotal,
      itemCount,
      addItem,
      setQuantity,
      removeItem,
      clearCart,
      replaceCart,
      restoreCart,
    };
  }, [seller, items, addItem, setQuantity, removeItem, clearCart, replaceCart, restoreCart]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartContextShape {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
