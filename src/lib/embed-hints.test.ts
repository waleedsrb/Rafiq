/// <reference types="node" />
// Supabase can join trips to profiles in more than one way: trips.driver_id points at a
// profile, and trip_reminders / trip_nudges hold a trip and a profile each. Asked for
// `profiles(...)` with no hint, the API can't tell which one we mean and fails the whole
// query, so the screen quietly shows nothing (Home lost the rider's seat this way; the
// end-to-end test found it). Every embed of profiles must name its link, e.g.
// `profiles!trips_driver_id_fkey(...)`.
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !name.endsWith('.test.ts') ? [path] : [];
  });
}

test('every profiles embed names which link it follows', () => {
  const bad: string[] = [];
  for (const path of files(new URL('..', import.meta.url).pathname)) {
    readFileSync(path, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (/[:,\s'`(]profiles\(/.test(line)) bad.push(`${path}:${i + 1}`);
      });
  }
  assert.deepEqual(bad, []);
});
