// Device-local, independent of authentication. Do not reset this on sign-out.
export const LAUNCH_SEEN_KEY = 'rafiq.launch.seen.v1';
export type LaunchMode = 'full' | 'short';
type Storage = { getItem: (key: string) => Promise<string | null>; setItem: (key: string, value: string) => Promise<unknown> };

export async function readLaunchMode(storage: Storage): Promise<LaunchMode> {
  try {
    return await storage.getItem(LAUNCH_SEEN_KEY) === '1' ? 'short' : 'full';
  } catch {
    // Unavailable storage must not trap someone in a long intro on every launch.
    return 'short';
  }
}

export async function markLaunchSeen(storage: Storage): Promise<void> {
  try { await storage.setItem(LAUNCH_SEEN_KEY, '1'); } catch {
    // Branding must never block access when local persistence is unavailable.
  }
}

export function launchDestination(signedIn: boolean, hasProfile: boolean) {
  return !signedIn ? '/intro' : !hasProfile ? '/sign-up/profile' : '/home';
}
