// Keeps "who is signed in" and "their profile" in step.
//
// The bug this prevents: on sign in, Supabase reports the new session right
// away, but the profile row arrives a moment later from the database. If the
// app publishes the session first, there is a split second where it looks like
// "signed in, no profile", and the router shows the name + gender step before
// jumping to Home. So we wait for the profile, then publish both together.

type WithUser = { user: { id: string } };

export function createAuthSync<S extends WithUser, P>(
  loadProfile: (userId: string) => Promise<P | null>,
  commit: (session: S | null, profile: P | null) => void,
) {
  // Every call gets a ticket. If a newer call started while we waited (for
  // example sign out right after sign in), the older answer is thrown away.
  let latest = 0;

  return async function apply(session: S | null): Promise<boolean> {
    const ticket = ++latest;
    let profile: P | null = null;
    if (session) {
      try {
        profile = await loadProfile(session.user.id);
      } catch {
        profile = null;
      }
    }
    if (ticket !== latest) return false;
    commit(session, profile);
    return true;
  };
}
