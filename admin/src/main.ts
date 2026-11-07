// Rafiq Admin: review ID checks in a browser.
//
// This page is safe to host publicly: it only holds the anon key, and the database decides
// everything. Only people listed in public.admins can read other people's requests, see the
// photos (private bucket, 10-minute signed links), or call review_verification().

import { createClient, type Session } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing');

const SLOTS = { passenger: ['ID card'], driver: ['ID card', 'Driving licence', 'Car and plate'] } as const;
type Kind = keyof typeof SLOTS;

type Request = {
  id: string;
  kind: Kind;
  photos: string[];
  submitted_at: string;
  profiles: { full_name: string; gender: string | null } | null;
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

// ─── The queue ──────────────────────────────────────────────────────────────
async function queueView() {
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

  const { data, error } = await supabase
    .from('verifications')
    .select('id, kind, photos, submitted_at, profiles!verifications_user_id_fkey(full_name, gender)')
    .eq('status', 'pending')
    .order('submitted_at'); // oldest first: first come, first served
  if (error) return show(el('p', { class: 'error', textContent: error.message }));
  const rows = (data ?? []) as unknown as Request[];

  const paths = rows.flatMap((r) => r.photos);
  const signed = paths.length ? ((await supabase.storage.from('verification').createSignedUrls(paths, 600)).data ?? []) : [];
  const urlFor = new Map(signed.map((s) => [s.path ?? '', s.signedUrl ?? '']));

  const refresh = el('button', { class: 'link', textContent: 'Refresh' });
  refresh.onclick = () => queueView();

  show(
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
    ...r.photos.map((path, i) => {
      const src = urlFor.get(path) ?? '';
      // Opens full size in a new tab so you can zoom in on small print.
      return el('a', { class: 'photo', href: src, target: '_blank', rel: 'noopener' }, el('img', { src, alt: SLOTS[r.kind][i] ?? '' }), SLOTS[r.kind][i] ?? '');
    }),
  );

  const approve = el('button', { class: 'btn', textContent: 'Approve' });
  const reason = el('input', { placeholder: 'Reason they will see, e.g. The ID photo is blurry', maxLength: 200 });
  const reject = el('button', { class: 'btn secondary', textContent: 'Reject', disabled: true });
  reason.oninput = () => (reject.disabled = reason.value.trim().length < 2);

  async function decide(ok: boolean) {
    approve.disabled = reject.disabled = true;
    const { error } = await supabase.rpc('review_verification', { p_id: r.id, p_approve: ok, p_reason: ok ? null : reason.value.trim() });
    if (error) {
      msg.textContent = error.message;
      approve.disabled = false;
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
    el('div', { class: 'actions' }, approve, reason, reject),
    msg,
  );
  return card;
}

// ─── Start ──────────────────────────────────────────────────────────────────
function render(session: Session | null) {
  signOutButton.hidden = !session;
  if (session) queueView();
  else signInView(!url || !anonKey ? 'Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (copy .env.example to .env.local).' : undefined);
}

// Re-render only when the signed-in person changes (token refreshes also fire events,
// and re-rendering then would wipe a half-typed reason).
let currentUser: string | null | undefined;
supabase.auth.onAuthStateChange((_event, session) => {
  const user = session?.user.id ?? null;
  if (user === currentUser) return;
  currentUser = user;
  render(session);
});
