/// <reference types="node" />
import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

import {
  answerDialog,
  cancelDialog,
  choose,
  confirm,
  currentDialog,
  notify,
  placementOf,
  resetDialogs,
  subscribeDialogs,
} from './dialog.ts';

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

test('dialogsClosed waits until the host says the pop-up has left the screen', async () => {
  const { dialogsClosed, setDialogOnScreen } = await import('./dialog.ts');
  const pick = choose({ title: 'Photo', options: [{ label: 'Camera', value: 'camera' }], cancel: 'Cancel' });
  setDialogOnScreen(true);
  answerDialog(currentDialog()!.id, 'camera');
  assert.equal(await pick, 'camera');

  let closed = false;
  const wait = dialogsClosed(5000).then(() => (closed = true));
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(closed, false, 'still sliding away');
  setDialogOnScreen(false);
  await wait;
  assert.equal(closed, true);
});

test('dialogsClosed resolves at once when nothing is showing, and has a safety timeout', async () => {
  const { dialogsClosed, setDialogOnScreen } = await import('./dialog.ts');
  await dialogsClosed();
  setDialogOnScreen(true);
  const started = Date.now();
  await dialogsClosed(30);
  assert.ok(Date.now() - started >= 25);
});

test('one placement rule: sheets by default, a dangerous yes/no in the middle', () => {
  void confirm({ title: 'Cancel?', yes: 'Yes', no: 'Keep' });
  assert.equal(placementOf(currentDialog()!.spec), 'sheet');
  resetDialogs();
  void confirm({ title: 'Cancel?', yes: 'Yes', no: 'Keep', tone: 'warning' });
  assert.equal(placementOf(currentDialog()!.spec), 'sheet');
  resetDialogs();
  void confirm({ title: 'Delete?', yes: 'Delete', no: 'Keep', tone: 'danger' });
  assert.equal(placementOf(currentDialog()!.spec), 'center');
  resetDialogs();
  void choose({ title: 'Photo', options: [{ label: 'Camera', value: 'c' }], cancel: 'Cancel' });
  assert.equal(placementOf(currentDialog()!.spec), 'sheet');
  resetDialogs();
  void notify({ title: 'Heads up', ok: 'OK', tone: 'danger' });
  assert.equal(placementOf(currentDialog()!.spec), 'center');
  assert.equal(placementOf({ placement: 'sheet', tone: 'danger' }), 'sheet', 'a screen can still say where');
});
