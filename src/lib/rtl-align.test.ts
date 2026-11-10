// Guards the Arabic layout rule in src/components/ui.tsx (useFont).
// Inside a `direction: 'rtl'` view, React Native reads textAlign 'right' as "end",
// so a hand-picked `rtl ? 'right' : 'left'` puts Arabic text on the LEFT.
// Text should leave textAlign unset; TextInputs use inputAlign().
import { strict as assert } from 'node:assert';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';

const SRC = join(import.meta.dirname, '..');
const SIDE_PICK = /\?\s*\(?'(right|left)'(\s+as const\))?\s*:\s*\(?'(left|right)'/;

function tsxFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return tsxFiles(path);
    return path.endsWith('.tsx') ? [path] : [];
  });
}

test('no screen picks left/right text alignment by language', () => {
  const offenders: string[] = [];
  for (const file of tsxFiles(SRC)) {
    readFileSync(file, 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (SIDE_PICK.test(line) && !line.includes('export const inputAlign')) {
          offenders.push(`${file.slice(SRC.length + 1)}:${i + 1}: ${line.trim()}`);
        }
      });
  }
  assert.deepEqual(offenders, [], 'Leave textAlign unset on Text, or use inputAlign() for a TextInput');
});

test('no row is reversed by hand inside an RTL screen', () => {
  const offenders = tsxFiles(SRC).filter((f) => /rtl \? 'row-reverse'/.test(readFileSync(f, 'utf8')));
  assert.deepEqual(offenders, []);
});
