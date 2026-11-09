// Share my trip: the page family opens from a link like share.html?t=<token>.
//
// Nobody signs in here. The token in the link is the key: shared_trip() returns the trip
// only for a valid token, and only until 2 hours after the trip ends. The page refreshes
// every 30 seconds while the car is on the road.

import { createClient } from '@supabase/supabase-js';

import { minutesAgo, placeName, tripStatus, type Lang, type SharedTrip } from './share-logic';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing', {
  auth: { persistSession: false },
});

const token = new URLSearchParams(location.search).get('t') ?? '';
const app = document.getElementById('app')!;
const langButton = document.getElementById('lang') as HTMLButtonElement;
let lang: Lang = new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'ar';

const T = {
  ar: {
    brand: 'رفيق',
    switch: 'English',
    title: (n: string) => `${n} يشاركك رحلته`,
    scheduled: 'لم تنطلق بعد',
    live: 'على الطريق الآن',
    finished: 'وصلت الرحلة',
    cancelled: 'أُلغيت الرحلة',
    route: 'الطريق',
    departs: 'موعد الانطلاق',
    driver: 'السائق',
    car: 'السيارة',
    plate: 'رقم اللوحة',
    lastSeen: (m: number) => (m < 1 ? 'آخر موقع: الآن' : `آخر موقع: قبل ${m} دقيقة`),
    noPosition: 'سيظهر موقع السيارة هنا بعد الانطلاق.',
    openMaps: 'افتح في الخرائط',
    gone: 'هذا الرابط غير صالح أو انتهت صلاحيته.',
    loading: 'جارٍ التحميل…',
  },
  en: {
    brand: 'Rafiq',
    switch: 'العربية',
    title: (n: string) => `${n} is sharing their trip with you`,
    scheduled: 'Not started yet',
    live: 'On the road now',
    finished: 'Arrived',
    cancelled: 'Trip cancelled',
    route: 'Route',
    departs: 'Departure',
    driver: 'Driver',
    car: 'Car',
    plate: 'Plate',
    lastSeen: (m: number) => (m < 1 ? 'Last seen: just now' : `Last seen: ${m} min ago`),
    noPosition: "The car's position shows here once the trip starts.",
    openMaps: 'Open in Maps',
    gone: 'This link is not valid, or it has expired.',
    loading: 'Loading…',
  },
} as const;

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

const row = (k: string, v: Node | string) => el('div', { class: 'row' }, el('span', { class: 'k', textContent: k }), el('span', { class: 'v' }, v));

let last: SharedTrip | null | undefined;

function render() {
  const s = T[lang];
  document.documentElement.lang = lang;
  document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr';
  document.getElementById('brand-name')!.textContent = s.brand;
  langButton.textContent = s.switch;
  if (last === undefined) return app.replaceChildren(el('p', { class: 'muted', textContent: s.loading }));
  if (last === null) return app.replaceChildren(el('p', { textContent: s.gone }));

  const trip = last;
  const status = tripStatus(trip);
  const statusClass = { scheduled: '', live: 'live', finished: 'done', cancelled: 'off' }[status];
  const time = new Date(trip.departs_at).toLocaleString(lang === 'ar' ? 'ar' : 'en-GB', {
    weekday: 'short', hour: '2-digit', minute: '2-digit',
  });
  const car = [trip.car_model, trip.car_color].filter(Boolean).join(' · ');

  const parts: Node[] = [
    el('h1', { textContent: s.title(trip.sharer_name) }),
    el('span', { class: `status ${statusClass}`, textContent: s[status] }),
    el(
      'div',
      { class: 'card' },
      row(s.route, `${placeName(trip, 'origin', lang)} ${lang === 'ar' ? '←' : '→'} ${placeName(trip, 'destination', lang)}`),
      row(s.departs, time),
      row(s.driver, trip.driver_name),
      car ? row(s.car, car) : null,
      trip.plate ? row(s.plate, el('span', { class: 'plate', textContent: trip.plate })) : null,
    ),
  ];

  if (trip.lat !== null && trip.lng !== null && trip.position_at) {
    const lat = Number(trip.lat);
    const lng = Number(trip.lng);
    const d = 0.01;
    const bbox = [lng - d, lat - d, lng + d, lat + d].join(',');
    parts.push(
      el('div', { class: 'map' }, el('iframe', {
        title: 'map',
        loading: 'lazy',
        src: `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`,
      })),
      el('p', { class: 'muted small', textContent: s.lastSeen(minutesAgo(trip.position_at, new Date())) }),
      el('a', { class: 'btn', href: `https://maps.google.com/?q=${lat},${lng}`, target: '_blank', rel: 'noopener', textContent: s.openMaps }),
    );
  } else if (status === 'scheduled' || status === 'live') {
    parts.push(el('p', { class: 'muted', textContent: s.noPosition }));
  }
  app.replaceChildren(...parts);
}

async function load() {
  if (!token) {
    last = null;
    return render();
  }
  const { data, error } = await supabase.rpc('shared_trip', { p_token: token });
  last = error ? (last ?? null) : (((data as SharedTrip[] | null) ?? [])[0] ?? null);
  render();
}

langButton.onclick = () => {
  lang = lang === 'ar' ? 'en' : 'ar';
  render();
};

render();
load();
setInterval(() => {
  if (last && tripStatus(last) !== 'finished' && tripStatus(last) !== 'cancelled') load();
}, 30_000);
