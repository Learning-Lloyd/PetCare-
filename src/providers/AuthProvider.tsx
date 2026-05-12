import { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabaseClient';

type AuthContextValue = {
  session: Session | null;
  isLoading: boolean;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  /** Ignore early onAuthStateChange(null) before getSession() finishes reading storage (refresh race). */
  const initialSessionResolved = useRef(false);

  useEffect(() => {
    let cancelled = false;
    initialSessionResolved.current = false;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (cancelled) return;
      if (!initialSessionResolved.current && !nextSession?.user) {
        return;
      }
      setSession(nextSession);
    });

    (async () => {
      try {
        const {
          data: { session: initial },
        } = await supabase.auth.getSession();
        if (cancelled) return;
        setSession(initial ?? null);
      } finally {
        if (!cancelled) {
          initialSessionResolved.current = true;
          setIsLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const value = useMemo(() => ({ session, isLoading }), [session, isLoading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return ctx;
}
