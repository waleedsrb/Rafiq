import assert from 'node:assert/strict';
import { test } from 'node:test';

import { MOTIFS, SWATCHES, avatarArt, hashSeed } from './avatar-art.ts';

test('the same id always gets the same avatar', () => {
  const id = '7493831f-8353-4072-89a3-eb5eef6f4d9f';
  assert.deepEqual(avatarArt(id), avatarArt(id));
  assert.equal(hashSeed(id), hashSeed(id));
});

test('ids spread over the colours and motifs', () => {
  const swatches = new Set<string>();
  const motifs = new Set<unknown>();
  for (let i = 0; i < 400; i++) {
    const a = avatarArt(`person-${i}`);
    swatches.add(a.swatch.bg);
    motifs.add(a.motif);
  }
  assert.equal(swatches.size, SWATCHES.length);
  assert.equal(motifs.size, MOTIFS.length);
});

test('landscapes are never upside down', () => {
  for (let i = 0; i < 400; i++) {
    const a = avatarArt(`p${i}`);
    if (a.motif === MOTIFS[0] || a.motif === MOTIFS[1]) assert.equal(a.rotate, 0);
  }
});
