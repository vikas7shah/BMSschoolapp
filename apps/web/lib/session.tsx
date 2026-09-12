'use client';

import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { ApiError, api, type Me } from './api';

interface SessionState {
  me: Me | null;
  loading: boolean;
  reload: () => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionState>({
  me: null,
  loading: true,
  reload: async () => {},
  signOut: async () => {},
});

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    try {
      setMe(await api.get<Me>('/api/me'));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) setMe(null);
      else console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  const signOut = useCallback(async () => {
    await api.post('/api/auth/logout').catch(() => undefined);
    setMe(null);
    window.location.href = '/login/';
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return <Ctx.Provider value={{ me, loading, reload, signOut }}>{children}</Ctx.Provider>;
}

export const useSession = () => useContext(Ctx);

/** Sends anonymous visitors to the sign-in screen. */
export function useRequireAuth() {
  const session = useSession();
  useEffect(() => {
    if (!session.loading && !session.me) window.location.href = '/login/';
  }, [session.loading, session.me]);
  return session;
}
