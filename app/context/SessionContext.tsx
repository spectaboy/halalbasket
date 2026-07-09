// App session: resolves the Clerk user to a HalalBasket users row plus any
// seller/driver records, and tracks which surface the user is operating in.

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { ProfileService } from '../services/profile';
import type { DriverRow, SellerRow, UserRow } from '../types/database';

export type AppMode = 'customer' | 'seller' | 'driver' | 'admin';

interface SessionShape {
  loading: boolean;
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
  const { user: clerkUser } = useUser();
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<UserRow | null>(null);
  const [seller, setSeller] = useState<SellerRow | null>(null);
  const [driver, setDriver] = useState<DriverRow | null>(null);
  const [mode, setMode] = useState<AppMode>('customer');

  const refresh = useCallback(async () => {
    if (!isSignedIn || !userId) {
      setUser(null);
      setSeller(null);
      setDriver(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const row = await ProfileService.ensureUser(
      userId,
      clerkUser?.primaryEmailAddress?.emailAddress
    );
    setUser(row);
    if (row) {
      const [s, d] = await Promise.all([
        ProfileService.getSellerByUserId(row.id),
        ProfileService.getDriverByUserId(row.id),
      ]);
      setSeller(s);
      setDriver(d);
      if (row.is_admin) setMode('admin');
      else if (row.role === 'seller' && s) setMode('seller');
      else if (row.role === 'driver' && d) setMode('driver');
      else setMode('customer');
    }
    setLoading(false);
  }, [isSignedIn, userId, clerkUser?.primaryEmailAddress?.emailAddress]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({ loading, user, seller, driver, mode, setMode, refresh }),
    [loading, user, seller, driver, mode, refresh]
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionShape {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within SessionProvider');
  return ctx;
}
