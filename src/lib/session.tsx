// Who is signed in, and their profile. Any screen can call useSession().
//
// "Context" in React is a way to share one value with every screen without
// passing it down by hand. Here that value is the session + profile.

import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

import { deviceLanguage, t as translate, type Gender, type Language } from '@/i18n';
import type { StringKey } from '@/i18n/strings';
import { supabase } from '@/lib/supabase';

export type Profile = {
  id: string;
  full_name: string;
  gender: Gender | null;
  language: Language;
};

type SessionState = {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const loadProfile = useCallback(async (userId: string | undefined) => {
    if (!userId) {
      setProfile(null);
      return;
    }
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, gender, language')
      .eq('id', userId)
      .maybeSingle();
    setProfile((data as Profile | null) ?? null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      await loadProfile(data.session?.user.id);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      loadProfile(next?.user.id);
    });
    return () => sub.subscription.unsubscribe();
  }, [loadProfile]);

  const refreshProfile = useCallback(
    () => loadProfile(session?.user.id),
    [loadProfile, session?.user.id],
  );

  return (
    <SessionContext.Provider value={{ loading, session, profile, refreshProfile }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}

/** Language + gender-aware translator for the current person. */
export function useT() {
  const { profile } = useSession();
  const lang = profile?.language ?? deviceLanguage();
  const gender = profile?.gender ?? 'm';
  return { lang, t: (key: StringKey) => translate(key, lang, gender) };
}
