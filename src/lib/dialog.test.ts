/// <reference types="node" />
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import { answerDialog, cancelDialog, choose, confirm, currentDialog, notify, resetDialogs, subscribeDialogs } from './dialog.ts';

beforeEach(() => resetDialogs());

test('a yes/no question resolves true on yes and false on cancel', async () => {
  const yes = confirm({ title: 'Cancel?', yes: 'Yes', no: 'Keep' });
  answerDialog(currentDialog()!.id, true);
  assert.equal(await yes, true);

  const no = confirm({ title: 'Cancel?', yes: 'Yes', no: 'Keep' });
  cancelDialog(currentDialog()!.id);
  assert.equal(await no, false);
  assert.equal(currentDialog(), null);
});

test('pop-ups wait their turn, one at a time', async () => {
  const first = notify({ title: 'One', ok: 'OK' });
  const second = choose({ title: 'Two', options: [{ label: 'A', value: 'a' }], cancel: 'Cancel' });
  assert.equal(currentDialog()!.spec.title, 'One');
  answerDialog(currentDialog()!.id, undefined);
  await first;
  assert.equal(currentDialog()!.spec.title, 'Two');
  answerDialog(currentDialog()!.id, 'a');
  assert.equal(await second, 'a');
});

test('cancelling a choice gives null; a double tap only answers once', async () => {
  const pick = choose({ title: 'From', options: [{ label: 'Camera', value: 'camera' }], cancel: 'Cancel' });
  const id = currentDialog()!.id;
  cancelDialog(id);
  answerDialog(id, 'camera'); // too late, ignored
  assert.equal(await pick, null);
});

test('the host is told when the queue changes', () => {
  let calls = 0;
  const stop = subscribeDialogs(() => calls++);
  void notify({ title: 'Hi', ok: 'OK' });
  answerDialog(currentDialog()!.id, undefined);
  stop();
  void notify({ title: 'Again', ok: 'OK' });
  assert.equal(calls, 2);
});
