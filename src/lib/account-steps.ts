// The "Get verified" steps at the top of Account. Each step is its own row and goes away
// once it's done; when nothing is left, the whole group is gone and only the seal by your
// name remains (Waleed, Nov 11).
//   1. Profile photo   needed before your first booking or trip post
//   2. ID check        needed before your first booking
//   3. Driver check    only once you've added a car (needed before your first trip post)
// Kept free of React Native imports so it can be tested on its own.

import type { CheckState } from './check-status.ts';

export type StepKey = 'photo' | 'id' | 'driver';
export type Step = { key: StepKey; state: CheckState };

export function accountSteps(input: {
  hasPhoto: boolean;
  id: CheckState | null; // null while loading
  driver: CheckState | null;
  hasCar: boolean;
}): Step[] {
  const steps: Step[] = [];
  if (!input.hasPhoto) steps.push({ key: 'photo', state: 'none' });
  if (input.id && input.id !== 'approved') steps.push({ key: 'id', state: input.id });
  if (input.hasCar && input.driver && input.driver !== 'approved') steps.push({ key: 'driver', state: input.driver });
  return steps;
}
