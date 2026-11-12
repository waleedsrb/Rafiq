import assert from 'node:assert/strict';
import { test } from 'node:test';

import { dark, light, nativeOverride, parsePref, resolveScheme } from './palettes.ts';

test('both palettes have exactly the same colour names', () => {
  assert.deepEqual(Object.keys(dark).sort(), Object.keys(light).sort());
});

test('plates and the fixed colours never change with the look', () => {
  for (const name of ['plateInk', 'graphite', 'white', 'alarm'] as const) assert.equal(dark[name], light[name]);
});

test('a saved pick is read back, anything else falls to the default', () => {
  assert.equal(parsePref('dark'), 'dark');
  assert.equal(parsePref('system'), 'system');
  assert.equal(parsePref('light'), 'light');
  assert.equal(parsePref(null), parsePref('nonsense'));
});

test('following the phone uses the phone, a pick wins over it', () => {
  assert.equal(resolveScheme('system', 'dark'), 'dark');
  assert.equal(resolveScheme('system', 'light'), 'light');
  assert.equal(resolveScheme('system', null), 'light');
  assert.equal(resolveScheme('light', 'dark'), 'light');
  assert.equal(resolveScheme('dark', 'light'), 'dark');
});

test('the native side is only left alone when following the phone', () => {
  assert.equal(nativeOverride('system'), 'unspecified');
  assert.equal(nativeOverride('dark'), 'dark');
});

// WCAG contrast, so a dark value can't quietly fail readability.
function lum(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a: string, b: string) {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

for (const [name, p] of [['light', light], ['dark', dark]] as const) {
  test(`${name}: text colours read on the app background (4.5:1)`, () => {
    for (const ink of ['ink', 'inkSecondary', 'statusOpen', 'statusCrowded', 'statusClosed'] as const) {
      assert.ok(contrast(p[ink], p.surface) >= 4.5, `${ink} on surface is ${contrast(p[ink], p.surface).toFixed(2)}`);
    }
    assert.ok(contrast(p.onInk, p.ink) >= 4.5, 'button label on button');
  });
}

test('washes keep the light look exactly and lift the dark one', async () => {
  const { wash, inkWash } = await import('./palettes.ts');
  assert.equal(wash(light.surface, 0.72), 'rgba(247,246,243,0.72)');
  assert.equal(inkWash(light, 0.05), 'rgba(23,25,28,0.05)');
  assert.equal(inkWash(dark, 0.05), 'rgba(244,243,240,0.08)');
});
