import assert from 'node:assert/strict';
import { test } from 'node:test';

import { HOLD_MS, HUM_FAST_MS, HUM_SLOW_MS, confidence, humGap, humPattern, minutesAgo, reportsKey } from './checkpoints.ts';

test('minutes ago rounds down and never goes negative', () => {
  const now = new Date('2026-11-07T08:30:00Z');
  assert.equal(minutesAgo(new Date('2026-11-07T08:21:30Z'), now), 8);
  assert.equal(minutesAgo(new Date('2026-11-07T08:30:00Z'), now), 0);
  assert.equal(minutesAgo(new Date('2026-11-07T08:31:00Z'), now), 0); // phone clock a bit behind
});

test('the hum speeds up smoothly from slow to fast, never backwards', () => {
  assert.equal(humGap(0), HUM_SLOW_MS);
  assert.equal(humGap(HOLD_MS), HUM_FAST_MS);
  for (let t = 10; t <= HOLD_MS; t += 10) assert.ok(humGap(t) <= humGap(t - 10));
});

test('the Android pattern lasts the hold and ends as one continuous buzz', () => {
  const p = humPattern();
  const total = p.reduce((a, b) => a + b, 0);
  assert.ok(total >= HOLD_MS && total < HOLD_MS + 60);
  assert.equal(p[p.length - 1], 0); // last wait: none
});

test('confidence: nothing without a status, otherwise confirmed or not yet', () => {
  assert.equal(confidence({ status: null, confirmed: false }), null);
  assert.equal(confidence({ status: 'open', confirmed: true }), 'confirmed');
  assert.equal(confidence({ status: 'closed', confirmed: false }), 'unconfirmed');
  assert.equal(confidence({ status: 'crowded' }), 'unconfirmed'); // an older app version's row
});

test('report counts take the right word: 1 report, 2-10 reports, Arabic 11+ form', () => {
  assert.equal(reportsKey(1), 'reportsWordOne');
  assert.equal(reportsKey(2), 'reportsWord');
  assert.equal(reportsKey(10), 'reportsWord');
  assert.equal(reportsKey(11), 'reportsWordMany');
});

test('governorates: north to south, named in the app language, unknown last', async () => {
  const { governorate } = await import('./checkpoints.ts');
  assert.deepEqual(governorate('Jenin Governorate', 'en'), { order: 0, name: 'Jenin' });
  assert.deepEqual(governorate('Jerusalem Periphery Governorate', 'ar'), { order: 8, name: 'القدس' });
  assert.equal(governorate(null, 'en').name, null);
  assert.ok(governorate(null, 'en').order > governorate('Hebron Governorate', 'en').order);
});

test('search ignores vowel marks, alef and ta marbuta forms, and case', async () => {
  const { matchesQuery } = await import('./checkpoints.ts');
  const huwara = { name_ar: 'حوّارة', name_en: 'Huwara' };
  assert.ok(matchesQuery(huwara, 'حواره'));
  assert.ok(matchesQuery(huwara, 'HUW'));
  assert.ok(matchesQuery({ name_ar: 'عين سينيا', name_en: "Ein Siniya" }, 'ein s'));
  assert.ok(!matchesQuery(huwara, 'زعترة'));
  assert.ok(matchesQuery(huwara, '  '));
});

test('groups by governorate, names sorted inside', async () => {
  const { byGovernorate } = await import('./checkpoints.ts');
  const rows = [
    { name_ar: 'ب', name_en: 'Zaatara', governorate: 'Nablus Governorate' },
    { name_ar: 'أ', name_en: 'Atara', governorate: 'Ramallah and al-Bireh Governorate' },
    { name_ar: 'ج', name_en: 'Huwara', governorate: 'Nablus Governorate' },
    { name_ar: 'د', name_en: 'Somewhere', governorate: null },
  ];
  const groups = byGovernorate(rows, 'en');
  assert.deepEqual(groups.map((g) => g.name), ['Nablus', 'Ramallah and al-Bireh', null]);
  assert.deepEqual(groups[0].rows.map((r) => r.name_en), ['Huwara', 'Zaatara']);
});
