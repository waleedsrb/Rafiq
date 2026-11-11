// Who is signed in, and their profile. Any screen can call useSession().
//
// "Context" in React is a way to share one value with every screen without
// passing it down by hand. Here that value is the session + profile.

import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

import { deviceLanguage, t as translate, type Gender, type Language } from '@/i18n';
import type { StringKey } from '@/i18n/strings';
import { createAuthSync } from '@/lib/auth-sync';
import { supabase } from '@/lib/supabase';

export type Profile = {
  id: string;
  full_name: string;
  gender: Gender | null;
  language: Language;
  /** Set by an admin after the ID check (slice 5). Needed before booking. */
  id_verified_at: string | null;
  /** Set when an admin confirmed gender from the ID (slice 12). Women-only trips need it. */
  gender_verified_at: string | null;
  /** Profile photo in the "avatars" bucket, or null. Optional unless settings say otherwise. */
  avatar_path: string | null;
};

type SessionState = {
  loading: boolean;
  session: Session | null;
  profile: Profile | null;
  refreshProfile: () => Promise<void>;
  /** Language picked before signing up (the Welcome screen's language button). */
  chosenLanguage: Language | null;
  setChosenLanguage: (l: Language) => void;
};

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [chosenLanguage, setChosenLanguage] = useState<Language | null>(null);

  // One "apply" for every auth change: it fetches the profile first, then sets
  // session and profile in the same render (see src/lib/auth-sync.ts for why).
  const sessionRef = useRef<Session | null>(null);
  const [apply] = useState(() =>
    createAuthSync<Session, Profile>(
      // my_profile() reads the signed-in user from the token, so the id isn't passed on.
      async () => {
        const { data, error } = await supabase
          .rpc('my_profile')
          .select('id, full_name, gender, language, id_verified_at, gender_verified_at, avatar_path')
          .maybeSingle();
        if (error) throw error;
        return (data as Profile | null) ?? null;
      },
      (nextSession, nextProfile) => {
        sessionRef.current = nextSession;
        setSession(nextSession);
        setProfile(nextProfile);
        // Loading ends with the first answer that lands, whichever source sent it.
        setLoading(false);
      },
    ),
  );

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => apply(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      // Supabase asks not to call it again from inside this callback, so the
      // profile query starts on the next tick.
      setTimeout(() => void apply(next), 0);
    });
    return () => sub.subscription.unsubscribe();
  }, [apply]);

  const refreshProfile = useCallback(async () => {
    await apply(sessionRef.current);
  }, [apply]);

  return (
    <SessionContext.Provider value={{ loading, session, profile, refreshProfile, chosenLanguage, setChosenLanguage }}>
      {children}
    </SessionContext.Provider>
  );
}

export function useSession(): SessionState {
  const value = useContext(SessionContext);
  if (!value) throw new Error('useSession must be used inside <SessionProvider>');
  return value;
}

/** A woman whose gender an admin confirmed from her ID: may use women-only trips. */
export function isVerifiedWoman(profile: Profile | null): boolean {
  return !!profile && profile.gender === 'f' && !!profile.gender_verified_at && !!profile.id_verified_at;
}

/** Language + gender-aware translator for the current person. */
export function useT() {
  const { profile, chosenLanguage } = useSession();
  const lang = profile?.language ?? chosenLanguage ?? deviceLanguage();
  const gender = profile?.gender ?? 'm';
  return { lang, t: (key: StringKey) => translate(key, lang, gender) };
}
