// Rafiq Admin: review ID checks, and keep the West Bank's checkpoints right, in a browser.
//
// This page is safe to host publicly: it only holds the anon key, and the database decides
// everything. Only people listed in public.admins can read other people's requests, see the
// photos (private bucket, 10-minute signed links), or call review_verification().

import { setCrashUser } from './crash';
import { createClient, type Session } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing');

const SLOTS = { passenger: ['ID card'], driver: ['ID card', 'Driving licence', 'Car and plate'] } as const;
type Kind = keyof typeof SLOTS;

type Request = {
  id: string;
  user_id: string;
  kind: Kind;
  photos: string[];
  submitted_at: string;
  profiles: { full_name?: string; gender: string | null; avatar_path: string | null } | null;
};

const app = document.getElementById('app')!;
const signOutButton = document.getElementById('sign-out') as HTMLButtonElement;
signOutButton.onclick = () => supabase.auth.signOut();

// Tiny helper to build elements. Text always goes in as textContent, never as HTML,
// so a name like "<script>" can't run anything.
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> & { class?: string } = {},
  ...children: (Node | string | null)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  const { class: cls, ...rest } = props;
  if (cls) node.className = cls;
  Object.assign(node, rest);
  for (const c of children) if (c !== null) node.append(c);
  return node;
}

function show(...nodes: Node[]) {
  app.replaceChildren(...nodes);
}

// ─── Sign in (same phone + SMS code as the app) ─────────────────────────────
function signInView(error?: string) {
  const phone = el('input', { type: 'tel', placeholder: '+970 59 123 4567', autocomplete: 'tel', required: true });
  const msg = el('p', { class: 'small error', textContent: error ?? '' });
  const send = el('button', { class: 'btn', type: 'submit', textContent: 'Send code' });
  const form = el(
    'form',
    { class: 'stack narrow' },
    el('h1', { textContent: 'Sign in' }),
    el('p', { class: 'muted', textContent: 'Use the phone number of your Rafiq account. Only admins can see the review queue.' }),
    el('label', {}, 'Phone number', phone),
    send,
    msg,
  );
  form.onsubmit = async (e) => {
    e.preventDefault();
    send.disabled = true;
    const number = phone.value.replace(/[\s-]/g, '');
    const { error: err } = await supabase.auth.signInWithOtp({ phone: number });
    send.disabled = false;
    if (err) return (msg.textContent = err.message);
    codeView(number);
  };
  show(form);
  phone.focus();
}

function codeView(phone: string) {
  const code = el('input', { inputMode: 'numeric', autocomplete: 'one-time-code', maxLength: 6, placeholder: '123456' });
  const msg = el('p', { class: 'small error' });
  const verify = el('button', { class: 'btn', type: 'submit', textContent: 'Sign in' });
  const back = el('button', { class: 'link', type: 'button', textContent: 'Use another number' });
  back.onclick = () => signInView();
  const form = el(
    'form',
    { class: 'stack narrow' },
    el('h1', { textContent: 'Enter the code' }),
    el('p', { class: 'muted', textContent: `We sent a 6-digit code to ${phone}.` }),
    el('label', {}, 'Code', code),
    verify,
    back,
    msg,
  );
  form.onsubmit = async (e) => {
    e.preventDefault();
    verify.disabled = true;
    const { error } = await supabase.auth.verifyOtp({ phone, token: code.value.trim(), type: 'sms' });
    verify.disabled = false;
    if (error) msg.textContent = error.message;
    // On success, onAuthStateChange below takes over.
  };
  show(form);
  code.focus();
}

// ─── Pages: ID checks, checkpoints, disputed seats ───────────────────────────
type Page = 'checks' | 'checkpoints' | 'disputed';
const page = (): Page => (location.hash === '#checkpoints' ? 'checkpoints' : location.hash === '#disputed' ? 'disputed' : 'checks');
window.addEventListener('hashchange', () => currentUser && open());

function nav() {
  const link = (to: Page, label: string) =>
    el('a', { href: to === 'checks' ? '#' : `#${to}`, class: `navlink${page() === to ? ' on' : ''}`, textContent: label });
  return el('nav', { class: 'nav' }, link('checks', 'ID checks'), link('checkpoints', 'Checkpoints'), link('disputed', 'Disputed seats'));
}

async function open() {
  show(el('p', { class: 'muted', textContent: 'Loading…' }));
  const { data: isAdmin } = await supabase.rpc('is_admin');
  if (isAdmin !== true) {
    return show(
      el(
        'div',
        { class: 'stack narrow' },
        el('h1', { textContent: 'Admins only' }),
        el('p', { class: 'muted', textContent: 'This account is not an admin. Ask the owner to add you to the admins table.' }),
      ),
    );
  }
  return page() === 'checkpoints' ? checkpointsView() : page() === 'disputed' ? disputedView() : queueView();
}

// ─── Disputed seats ─────────────────────────────────────────────────────────
// A trip that never started in the app, where the driver and a rider said opposite things
// (see supabase/migrations/20261111150000_unstarted_trips.sql). These count for nobody.
type Disputed = {
  booking_id: string;
  trip_id: string;
  departs_at: string;
  origin: string;
  destination: string;
  driver_id: string;
  passenger_id: string;
  driver_says: string | null;
  rider_says: string | null;
  ticked_in: boolean;
  started: boolean;
  decided_at: string;
};
const DRIVER_SAYS: Record<string, string> = {
  started: 'Started the trip',
  checkpoint_closed: 'A checkpoint was closed',
  nobody_came: 'Nobody came',
  couldnt_go: "I couldn't go",
};
const RIDER_SAYS: Record<string, string> = {
  in_car: "I'm in the car",
  rode: 'I rode',
  driver_absent: "The driver didn't come",
  didnt_go: "I didn't go",
};

async function disputedView() {
  show(el('p', { class: 'muted', textContent: 'Loading…' }));
  const { data, error } = await supabase.rpc('admin_disputed_seats');
  if (error) return show(nav(), el('p', { class: 'error', textContent: error.message }));
  const rows = (data ?? []) as Disputed[];
  const ids = [...new Set(rows.flatMap((r) => [r.driver_id, r.passenger_id]))];
  const { data: names } = ids.length ? await supabase.rpc('admin_full_names', { p_ids: ids }) : { data: [] };
  const fullName = new Map(((names ?? []) as { id: string; full_name: string }[]).map((n) => [n.id, n.full_name]));
  const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

  show(
    nav(),
    el('h1', { textContent: 'Disputed seats' }),
    el('p', { class: 'muted small', textContent: 'The driver and the rider answered differently. Nobody\'s score changed. Newest first.' }),
    rows.length
      ? el(
          'div',
          {},
          ...rows.map((r) =>
            el(
              'section',
              { class: 'cp' },
              el('div', { class: 'cp-head' }, el('strong', { textContent: `${r.origin} → ${r.destination}` }), el('span', { class: 'muted small', textContent: when(r.departs_at) })),
              el('p', {}, `Driver ${fullName.get(r.driver_id) ?? 'Unknown'}: `, el('strong', { textContent: DRIVER_SAYS[r.driver_says ?? ''] ?? (r.ticked_in ? 'Ticked them as in the car' : 'Said nothing') })),
              el('p', {}, `Rider ${fullName.get(r.passenger_id) ?? 'Unknown'}: `, el('strong', { textContent: RIDER_SAYS[r.rider_says ?? ''] ?? 'Said nothing' })),
              el('p', { class: 'muted small', textContent: `Decided ${when(r.decided_at)} · booking ${r.booking_id}` }),
            ),
          ),
        )
      : el('p', { class: 'empty', textContent: 'No disputed seats.' }),
  );
}

// ─── The queue ──────────────────────────────────────────────────────────────
async function queueView() {
  show(el('p', { class: 'muted', textContent: 'Loading…' }));

  const { data, error } = await supabase
    .from('verifications')
    .select('id, user_id, kind, photos, submitted_at, profiles!verifications_user_id_fkey(gender, avatar_path)')
    .eq('status', 'pending')
    .order('submitted_at'); // oldest first: first come, first served
  if (error) return show(el('p', { class: 'error', textContent: error.message }));
  const rows = (data ?? []) as unknown as Request[];
  // Other people only ever see "Dana H."; admins get the full name to compare with the ID.
  if (rows.length) {
    const { data: names } = await supabase.rpc('admin_full_names', { p_ids: rows.map((r) => r.user_id) });
    const fullName = new Map(((names ?? []) as { id: string; full_name: string }[]).map((n) => [n.id, n.full_name]));
    for (const r of rows) if (r.profiles) r.profiles.full_name = fullName.get(r.user_id) ?? 'Unknown';
  }

  const paths = rows.flatMap((r) => r.photos);
  const signed = paths.length ? ((await supabase.storage.from('verification').createSignedUrls(paths, 600)).data ?? []) : [];
  const urlFor = new Map(signed.map((s) => [s.path ?? '', s.signedUrl ?? '']));
  // Profile photos, if they added one: shown beside the ID so you can check it is the same person.
  const avatarPaths = rows.flatMap((r) => (r.profiles?.avatar_path ? [r.profiles.avatar_path] : []));
  const avatars = avatarPaths.length ? ((await supabase.storage.from('avatars').createSignedUrls(avatarPaths, 600)).data ?? []) : [];
  for (const a of avatars) urlFor.set(a.path ?? '', a.signedUrl ?? '');

  const refresh = el('button', { class: 'link', textContent: 'Refresh' });
  refresh.onclick = () => queueView();

  show(
    nav(),
    el('h1', { textContent: 'Checks to review' }),
    el('p', { class: 'muted small' }, `${rows.length} waiting · oldest first · `, refresh),
    rows.length
      ? el('div', {}, ...rows.map((r) => requestCard(r, urlFor)))
      : el('p', { class: 'empty', textContent: 'Nothing waiting for review.' }),
  );
}

function requestCard(r: Request, urlFor: Map<string, string>) {
  const name = r.profiles?.full_name ?? 'Unknown';
  const when = new Date(r.submitted_at).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
  const msg = el('p', { class: 'small error' });

  const photos = el(
    'div',
    { class: 'photos' },
    ...(r.profiles?.avatar_path
      ? [
          el(
            'a',
            { class: 'photo', href: urlFor.get(r.profiles.avatar_path) ?? '', target: '_blank', rel: 'noopener' },
            el('img', { src: urlFor.get(r.profiles.avatar_path) ?? '', alt: 'Profile photo' }),
            'Profile photo (same person as the ID?)',
          ),
        ]
      : []),
    ...r.photos.map((path, i) => {
      const src = urlFor.get(path) ?? '';
      // Opens full size in a new tab so you can zoom in on small print.
      return el('a', { class: 'photo', href: src, target: '_blank', rel: 'noopener' }, el('img', { src, alt: SLOTS[r.kind][i] ?? '' }), SLOTS[r.kind][i] ?? '');
    }),
  );

  // Gender as shown on the ID. It decides who may use women-only trips, so it is
  // confirmed here, pre-filled with what the person chose at sign-up.
  const gender = el('select', { title: 'Gender on the ID' });
  for (const [value, label] of [['', 'Gender on ID…'], ['f', 'Female'], ['m', 'Male']]) {
    gender.append(el('option', { value, textContent: label }));
  }
  gender.value = r.profiles?.gender ?? '';
  const approve = el('button', { class: 'btn', textContent: 'Approve', disabled: !gender.value });
  gender.onchange = () => (approve.disabled = !gender.value);
  const reason = el('input', { placeholder: 'Reason they will see, e.g. The ID photo is blurry', maxLength: 200 });
  const reject = el('button', { class: 'btn secondary', textContent: 'Reject', disabled: true });
  reason.oninput = () => (reject.disabled = reason.value.trim().length < 2);

  async function decide(ok: boolean) {
    approve.disabled = reject.disabled = true;
    const { error } = await supabase.rpc('review_verification', {
      p_id: r.id,
      p_approve: ok,
      p_reason: ok ? null : reason.value.trim(),
      p_gender: ok ? gender.value : null,
    });
    if (error) {
      msg.textContent = error.message;
      approve.disabled = !gender.value;
      reject.disabled = reason.value.trim().length < 2;
      return;
    }
    card.remove();
    if (!app.querySelector('.request')) queueView();
  }
  approve.onclick = () => decide(true);
  reject.onclick = () => decide(false);

  const card = el(
    'section',
    { class: 'request' },
    el(
      'div',
      { class: 'who' },
      el('div', { class: 'avatar', textContent: name.charAt(0) }),
      el('div', { class: 'grow' }, el('div', { class: 'name', textContent: name }), el('div', { class: 'muted small', textContent: when })),
      el('span', { class: `tag ${r.kind}`, textContent: r.kind === 'driver' ? 'Driver' : 'Passenger' }),
    ),
    photos,
    el('div', { class: 'actions' }, gender, approve, reason, reject),
    msg,
  );
  return card;
}

// ─── Checkpoints ────────────────────────────────────────────────────────────
// Every checkpoint the app knows: fix a name or a place, add a missing one, hide one that is
// gone. Hidden ones keep their reports but leave the app's lists, maps and suggestions.

type Checkpoint = {
  id: string;
  name_ar: string;
  name_en: string;
  kind: string;
  lat: number | null;
  lng: number | null;
  governorate: string | null;
  source: string;
  hidden_at: string | null;
};
const KINDS = ['checkpoint', 'partial', 'gate', 'roadblock', 'earthmound', 'crossing'];
const GOVERNORATES = [
  'Jenin Governorate', 'Tubas Governorate', 'Tulkarm Governorate', 'Nablus Governorate', 'Qalqilya Governorate',
  'Salfit Governorate', 'Ramallah and al-Bireh Governorate', 'Jericho Governorate', 'Jerusalem Periphery Governorate',
  'Bethlehem Governorate', 'Hebron Governorate',
];
const ERRORS: Record<string, string> = {
  admins_only: 'Only admins can change checkpoints.',
  name_needed: 'Give it an Arabic and an English name.',
  place_outside: 'That place is outside the West Bank. Check the latitude and longitude (lat ≈ 31.3–32.6, lng ≈ 34.9–35.6).',
  not_found: 'That checkpoint is gone. Refresh the page.',
};
const nice = (m: string) => Object.entries(ERRORS).find(([k]) => m.includes(k))?.[1] ?? m;

async function checkpointsView(filter = '') {
  const { data, error } = await supabase
    .from('checkpoints')
    .select('id, name_ar, name_en, kind, lat, lng, governorate, source, hidden_at')
    .order('name_en');
  if (error) return show(nav(), el('p', { class: 'error', textContent: error.message }));
  const rows = (data ?? []) as Checkpoint[];

  const search = el('input', { type: 'search', placeholder: 'Find by name…', value: filter });
  const list = el('div', {});
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    const shown = rows.filter((r) => !q || r.name_en.toLowerCase().includes(q) || r.name_ar.includes(q));
    list.replaceChildren(...shown.map((r) => checkpointRow(r)));
  };
  search.oninput = draw;
  draw();

  const hidden = rows.filter((r) => r.hidden_at).length;
  show(
    nav(),
    el('h1', { textContent: 'Checkpoints' }),
    el('p', { class: 'muted small', textContent: `${rows.length - hidden} shown in the app · ${hidden} hidden · from OpenStreetMap, hand-placed and added here` }),
    addForm(),
    el('div', { class: 'toolbar' }, search),
    list,
  );
}

/** The fields one checkpoint needs, filled in from `r` (empty for a new one). */
function fields(r?: Checkpoint) {
  const ar = el('input', { value: r?.name_ar ?? '', placeholder: 'الاسم بالعربية', dir: 'rtl', maxLength: 80 });
  const en = el('input', { value: r?.name_en ?? '', placeholder: 'English name', maxLength: 80 });
  const kind = el('select', { title: 'Kind' });
  for (const k of KINDS) kind.append(el('option', { value: k, textContent: k }));
  kind.value = r?.kind ?? 'checkpoint';
  const gov = el('select', { title: 'Governorate' });
  gov.append(el('option', { value: '', textContent: 'Governorate…' }));
  for (const g of GOVERNORATES) gov.append(el('option', { value: g, textContent: g.replace(/ Governorate$/, '') }));
  gov.value = r?.governorate ?? '';
  const lat = el('input', { value: r?.lat != null ? String(r.lat) : '', placeholder: 'Latitude 32.1167', inputMode: 'decimal', class: 'num' });
  const lng = el('input', { value: r?.lng != null ? String(r.lng) : '', placeholder: 'Longitude 35.2566', inputMode: 'decimal', class: 'num' });
  // Paste "32.1167, 35.2566" (as a map app copies it) into either box: it fills both.
  const paste = (e: ClipboardEvent) => {
    const m = e.clipboardData?.getData('text').match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
    if (!m) return;
    e.preventDefault();
    lat.value = m[1];
    lng.value = m[2];
  };
  lat.onpaste = lng.onpaste = paste;
  const values = () => ({
    p_name_ar: ar.value.trim(),
    p_name_en: en.value.trim(),
    p_kind: kind.value,
    p_lat: Number(lat.value),
    p_lng: Number(lng.value),
    p_governorate: gov.value || null,
  });
  return { nodes: [ar, en, kind, gov, lat, lng], values, lat, lng };
}

function mapLink(lat: number | null, lng: number | null) {
  if (lat == null || lng == null) return el('span', { class: 'muted small', textContent: 'no place' });
  return el('a', {
    class: 'small',
    href: `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=16/${lat}/${lng}`,
    target: '_blank',
    rel: 'noopener',
    textContent: 'See on map',
  });
}

function addForm() {
  const f = fields();
  const msg = el('p', { class: 'small error' });
  const add = el('button', { class: 'btn', type: 'submit', textContent: 'Add checkpoint' });
  const form = el(
    'form',
    { class: 'cp-add' },
    el('h2', { textContent: 'Add a missing checkpoint' }),
    el('div', { class: 'cp-fields' }, ...f.nodes),
    el('div', { class: 'actions' }, add, el('span', { class: 'muted small', textContent: 'Tip: paste “lat, lng” into either place box.' })),
    msg,
  );
  form.onsubmit = async (e) => {
    e.preventDefault();
    add.disabled = true;
    msg.textContent = '';
    const { error } = await supabase.rpc('admin_save_checkpoint', { p_id: null, ...f.values() });
    add.disabled = false;
    if (error) return (msg.textContent = nice(error.message));
    checkpointsView();
  };
  return form;
}

function checkpointRow(r: Checkpoint) {
  const f = fields(r);
  const msg = el('span', { class: 'small' });
  const save = el('button', { class: 'btn', textContent: 'Save' });
  const hide = el('button', { class: 'btn secondary', textContent: r.hidden_at ? 'Show in app' : 'Hide' });
  save.onclick = async () => {
    save.disabled = true;
    msg.className = 'small';
    msg.textContent = 'Saving…';
    const { error } = await supabase.rpc('admin_save_checkpoint', { p_id: r.id, ...f.values() });
    save.disabled = false;
    msg.className = error ? 'small error' : 'small muted';
    msg.textContent = error ? nice(error.message) : 'Saved';
  };
  hide.onclick = async () => {
    const hiding = !r.hidden_at;
    if (hiding && !confirm(`Hide ${r.name_en}? It leaves the app's lists and maps. Its reports are kept.`)) return;
    hide.disabled = true;
    const { error } = await supabase.rpc('admin_hide_checkpoint', { p_id: r.id, p_hidden: hiding });
    hide.disabled = false;
    if (error) return (msg.textContent = nice(error.message));
    r.hidden_at = hiding ? new Date().toISOString() : null;
    card.classList.toggle('hidden-cp', hiding);
    hide.textContent = hiding ? 'Show in app' : 'Hide';
  };
  const card = el(
    'section',
    { class: `cp${r.hidden_at ? ' hidden-cp' : ''}` },
    el('div', { class: 'cp-head' }, el('span', { class: 'tag', textContent: r.source }), el('code', { class: 'muted small', textContent: r.id }), mapLink(r.lat, r.lng)),
    el('div', { class: 'cp-fields' }, ...f.nodes),
    el('div', { class: 'actions' }, save, hide, msg),
  );
  return card;
}

// ─── Start ──────────────────────────────────────────────────────────────────
function render(session: Session | null) {
  signOutButton.hidden = !session;
  if (session) open();
  else signInView(!url || !anonKey ? 'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (copy .env.example to .env.local).' : undefined);
}

// Re-render only when the signed-in person changes (token refreshes also fire events,
// and re-rendering then would wipe a half-typed reason).
let currentUser: string | null | undefined;
supabase.auth.onAuthStateChange((_event, session) => {
  const user = session?.user.id ?? null;
  if (user === currentUser) return;
  currentUser = user;
  setCrashUser(user);
  render(session);
});
