/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { pickVariant } from './lookup.ts';

const v = { ar_m: 'جاهز؟', ar_f: 'جاهزة؟', en: 'Ready?' };

test('picks the language and gender variant', () => {
  assert.equal(pickVariant(v, 'ready', 'en'), 'Ready?');
  assert.equal(pickVariant(v, 'ready', 'ar', 'm'), 'جاهز؟');
  assert.equal(pickVariant(v, 'ready', 'ar', 'f'), 'جاهزة؟');
  assert.equal(pickVariant({ ar_m: 'رفيق', en: 'Rafiq' }, 'appName', 'ar', 'f'), 'رفيق');
});

test('an unknown key falls back to the key instead of crashing', () => {
  assert.equal(pickVariant(undefined, 'osm-n246843686', 'en'), 'osm-n246843686');
});
