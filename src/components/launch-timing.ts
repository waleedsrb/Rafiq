import type { LaunchMode } from '../lib/launch-state.ts';
import { REVEAL_END } from './intro-motion.ts';

export const LAUNCH_FADE = 200;
export function launchDuration(mode: LaunchMode, reduced: boolean) {
  return reduced ? 0 : mode === 'full' ? REVEAL_END + 250 : 1800;
}

export function launchSceneTime(elapsed: number, mode: LaunchMode) {
  'worklet';
  if (mode === 'full') return Math.max(0, Math.min(REVEAL_END, elapsed));
  // A brief road drawing, then the same camera/mark reveal, without a long hold.
  const t = Math.max(0, elapsed);
  return t < 400 ? t / 400 * 3950 : Math.min(REVEAL_END, 3950 + (t - 400) / 1250 * 2500);
}
