// App session: resolves the Clerk user to a HalalBasket users row plus any
// seller/driver records, and tracks which surface the user is operating in.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { ProfileService } from '../services/profile';
import type { DriverRow, SellerRow, UserRow } from '../types/database';

export type AppMode = 'customer' | 'seller' | 'driver' | 'admin';

interface SessionShape {
  loading: boolean;
  error: string | null;
  user: UserRow | null;
  seller: SellerRow | null;
  driver: DriverRow | null;
  mode: AppMode;
  setMode: (mode: AppMode) => void;
  refresh: () => Promise<void>;
}

const SessionContext = createContext<SessionShape | undefined>(undefined);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const { isSignedIn, userId } = useAuth();
  const { user: clerkUser, isLoaded: userLoaded } = useUser();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [resolvedUserId, setResolvedUserId] = useState<string | null>(null);
  const request = useRef(0);
  const [user, setUser] = useState<UserRow | null>(null);
  const [seller, setSeller] = useState<SellerRow | null>(null);
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [mode, setMode] = useState<AppMode>('customer');

  const refresh = useCallback(async () => {
    const currentRequest = ++request.current;
    setError(null);
    if (!isSignedIn || !userId) {
      setUser(null);
      setSeller(null);
      setDriver(null);
      setMode('customer');
      setResolvedUserId(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setUser(null);
    setSeller(null);
    setDriver(null);
    if (!userLoaded) return;
    try {
      const row = await ProfileService.ensureUser(userId, clerkUser?.primaryEmailAddress?.emailAddress);
      const [s, d] = await Promise.all([
        ProfileService.getSellerByUserId(row.id),
        ProfileService.getDriverByUserId(row.id),
      ]);
      if (currentRequest !== request.current) return;
      setUser(row);
      setSeller(s);
      setDriver(d);
      if (row.is_admin) setMode('admin');
      else if (row.role === 'seller' && s) setMode('seller');
      else if (row.role === 'driver' && d) setMode('driver');
      else setMode('customer');
    } catch (err) {
      if (currentRequest !== request.current) return;
      console.error('[Session] Could not load the signed-in profile', err);
      setError('We could not load your profile. Check your connection and try again.');
    } finally {
      if (currentRequest === request.current) {
        setResolvedUserId(userId);
        setLoading(false);
      }
    }
  }, [isSignedIn, userId, userLoaded, clerkUser?.primaryEmailAddress?.emailAddress]);

  useEffect(() => {
    void refresh();
    return () => { request.current += 1; };
  }, [refresh]);

  const value = useMemo(
    () => ({ loading: loading || (!!isSignedIn && resolvedUserId !== userId), error, user, seller, driver, mode, setMode, refresh }),
    [loading, isSignedIn, resolvedUserId, userId, error, user, seller, driver, mode, refresh]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionShape {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
