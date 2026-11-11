// Guard rail for dark mode: every colour comes from the palettes in src/theme, so it
// can switch between light and dark. A hex or rgba() typed straight into a screen
// would stay the same in both looks and quietly break dark mode.
//
// A few things copy the real world and must NOT change with the look; they are
// listed below with the reason.

import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { test } from 'node:test';

const ROOT = join(import.meta.dirname, '..');

const FIXED: Record<string, string> = {
  'lib/plate-svg.ts': 'license plates copy the real West Bank and Israeli plates',
  'components/plate.tsx': 'license plate face',
  'components/ps-plate.tsx': 'license plate ink',
  'components/ps-plate-data.ts': 'license plate drawing',
  'lib/avatar-art.ts': 'generated avatar swatches (a picture, like a photo)',
  'app/car.tsx': 'real car paint colours to pick from',
  'app/welcome.tsx': 'the graphite story card, the same in both looks',
  'components/route-map.tsx': 'Google map styles (GRAPHITE for light, NIGHT for dark)',
};

const RAW = /(['"`])#[0-9A-Fa-f]{3,8}\1|rgba?\(/;

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.tsx?$/.test(name) && !name.includes('.test.') ? [path] : [];
  });
}

test('no raw colours outside the palettes', () => {
  const found: string[] = [];
  for (const path of files(ROOT)) {
    const rel = relative(ROOT, path).split('\\').join('/');
    if (rel.startsWith('theme/') || FIXED[rel]) continue;
    readFileSync(path, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (RAW.test(line) && !line.trim().startsWith('//')) found.push(`src/${rel}:${i + 1}  ${line.trim()}`);
      });
  }
  assert.deepEqual(found, [], `Use a colour from src/theme/palettes.ts (c.ink, c.fill, wash(), ...) so it follows dark mode:\n${found.join('\n')}`);
});
