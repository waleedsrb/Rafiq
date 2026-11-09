// Rafiq's own pop-ups, instead of the plain system alerts.
//
// Any screen can ask a question and wait for the answer:
//   if (await confirm({ title, body, yes, no, tone: 'danger' })) { ... }
//   const from = await choose({ title, options: [...], cancel })
//   await notify({ title, body, ok, tone: 'warning' })
//
// This file only keeps the queue (one pop-up at a time, the rest wait their turn).
// <DialogHost /> in the root layout draws whatever is at the front of the queue.
// No React Native imports here, so the queue logic can be tested on its own.

/**
 * How serious the message is. It picks the icon and the main button's color:
 * neutral = graphite info, success = green check,
 * warning and danger = clay (clay is only for "something needs you").
 */
export type DialogTone = 'neutral' | 'success' | 'warning' | 'danger';

export type DialogAction<T> = {
  label: string;
  value: T;
  /** primary = graphite (or clay when the tone is warning/danger), plain = text only. */
  style?: 'primary' | 'plain';
  /** Phosphor icon name, used in list layout. */
  icon?: string;
};

/**
 * Where the pop-up sits. One rule for the whole app (see placementOf):
 * sheet  = docked to the bottom edge, swipe down to close. The default.
 * center = a card in the middle, for a serious "are you sure?" you shouldn't flick away.
 */
export type DialogPlacement = 'sheet' | 'center';

export type DialogSpec<T> = {
  title: string;
  /** Leave out to follow the house rule (placementOf). */
  placement?: DialogPlacement;
  body?: string;
  tone?: DialogTone;
  /** 'buttons': stacked capsules (questions). 'list': rows with icons (pick one of several). */
  layout?: 'buttons' | 'list';
  actions: DialogAction<T>[];
  /** Label of the quiet button at the bottom. Leave out for a single-button message. */
  cancelLabel?: string;
  /** What the promise gives back when the person cancels, taps outside or presses Back. */
  cancelValue: T;
};

export type DialogEntry = {
  id: number;
  spec: DialogSpec<unknown>;
  resolve: (value: unknown) => void;
};

let queue: DialogEntry[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

// Is the pop-up still on screen? Answering a pop-up empties the queue at once, but on
// iOS the pop-up takes a moment to leave. Opening the camera, the photo library or a
// permission prompt during that moment makes iOS refuse it and the app looks frozen.
// The host tells us when the pop-up has really gone (see setDialogOnScreen).
let onScreen = false;
let closedWaiters: (() => void)[] = [];

function emit() {
  for (const l of listeners) l();
}

/** For the host: listen for changes (useSyncExternalStore). */
export function subscribeDialogs(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

// Where pop-ups are drawn. On iPhone a Modal can only open from the top-most window, so
// a pop-up asked for while a layer of our own is up (the trip card over the map) must be
// drawn inside that layer. Each such layer registers itself; the newest one draws.
// Layer 0 is the root host in the app layout.
let layers: number[] = [0];
let nextLayer = 1;
const layerListeners = new Set<() => void>();

/** For a full-screen layer with its own DialogHost: claim pop-ups while it is up. */
export function pushDialogLayer(): number {
  const id = nextLayer++;
  layers = [...layers, id];
  for (const l of layerListeners) l();
  return id;
}

/** For the same layer, when it goes away. */
export function popDialogLayer(id: number) {
  layers = layers.filter((x) => x !== id);
  for (const l of layerListeners) l();
}

/** The layer that draws pop-ups now. */
export function topDialogLayer(): number {
  return layers[layers.length - 1];
}

export function subscribeDialogLayers(listener: () => void) {
  layerListeners.add(listener);
  return () => {
    layerListeners.delete(listener);
  };
}

/** For the host: the pop-up to show now, or null. */
export function currentDialog(): DialogEntry | null {
  return queue[0] ?? null;
}

/**
 * The house rule: every pop-up is a bottom sheet, except a dangerous yes/no
 * (delete account, cancel a trip with passengers), which sits in the middle so
 * it can't be swiped away by accident and reads as a real stop.
 */
export function placementOf(spec: Pick<DialogSpec<unknown>, 'placement' | 'tone' | 'layout'>): DialogPlacement {
  if (spec.placement) return spec.placement;
  if (spec.tone === 'danger' && spec.layout !== 'list') return 'center';
  return 'sheet';
}

/** Show a pop-up and wait for the answer. */
export function showDialog<T>(spec: DialogSpec<T>): Promise<T> {
  return new Promise<T>((resolve) => {
    queue = [...queue, { id: nextId++, spec: spec as DialogSpec<unknown>, resolve: resolve as (v: unknown) => void }];
    emit();
  });
}

/** For the host: close the pop-up with this id and hand back the answer. */
export function answerDialog(id: number, value: unknown) {
  const entry = queue.find((e) => e.id === id);
  if (!entry) return; // already answered (e.g. a double tap)
  queue = queue.filter((e) => e.id !== id);
  emit();
  entry.resolve(value);
}

/** For the host: the pop-up layer has appeared (true) or fully gone away (false). */
export function setDialogOnScreen(shown: boolean) {
  onScreen = shown;
  if (!shown && queue.length === 0) {
    const waiters = closedWaiters;
    closedWaiters = [];
    for (const w of waiters) w();
  }
}

/**
 * Wait until no pop-up is on screen. Call it before opening anything native
 * (camera, photo library, share sheet) right after a pop-up answer.
 * `maxWaitMs` is a safety net in case the host never reports back.
 */
export function dialogsClosed(maxWaitMs = 1000): Promise<void> {
  if (!onScreen && queue.length === 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      closedWaiters = closedWaiters.filter((w) => w !== finish);
      resolve();
    };
    closedWaiters.push(finish);
    setTimeout(finish, maxWaitMs);
  });
}

/** Close the front pop-up as if the person cancelled. */
export function cancelDialog(id: number) {
  const entry = queue.find((e) => e.id === id);
  if (entry) answerDialog(id, entry.spec.cancelValue);
}

// ─── The three shapes screens actually use ───────────────────────────────────

/** A yes/no question, e.g. before something that can't be undone. Resolves true on yes. */
export function confirm(o: { title: string; body?: string; yes: string; no: string; tone?: DialogTone }) {
  return showDialog<boolean>({
    title: o.title,
    body: o.body,
    tone: o.tone ?? 'neutral',
    actions: [{ label: o.yes, value: true, style: 'primary' }],
    cancelLabel: o.no,
    cancelValue: false,
  });
}

/** Pick one of a few options, shown as rows. Resolves the chosen value, or null if cancelled. */
export function choose<T>(o: {
  title: string;
  body?: string;
  options: { label: string; value: T; icon?: string }[];
  cancel: string;
}) {
  return showDialog<T | null>({
    title: o.title,
    body: o.body,
    layout: 'list',
    actions: o.options.map((x) => ({ ...x, style: 'plain' as const })),
    cancelLabel: o.cancel,
    cancelValue: null,
  });
}

/** A message with one button, e.g. a warning the person should read. */
export function notify(o: { title: string; body?: string; ok: string; tone?: DialogTone }) {
  return showDialog<void>({
    title: o.title,
    body: o.body,
    tone: o.tone ?? 'neutral',
    actions: [{ label: o.ok, value: undefined, style: 'primary' }],
    cancelValue: undefined,
  });
}

/** Only for tests: forget everything. */
export function resetDialogs() {
  queue = [];
  nextId = 1;
  onScreen = false;
  closedWaiters = [];
}
