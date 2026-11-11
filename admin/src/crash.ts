// Crash reporting for the admin site and the Share my trip page (Sentry project rafiq-admin).
// Import this first in each page's entry file.
//
// The DSN only says where to send reports; it is public by design.
// Share links carry a secret token (?t=...), so every URL is sent without its query string.
import * as Sentry from '@sentry/browser';

const DSN =
  'https://1ffc48b4b07d0c97ba39c44bba00e1cf@o4512412496429056.ingest.de.sentry.io/4512412517400656';

export function withoutQuery(url: string | undefined): string | undefined {
  return url?.split(/[?#]/)[0];
}

Sentry.init({
  dsn: DSN,
  enabled: import.meta.env.PROD,
  environment: import.meta.env.MODE,
  tracesSampleRate: 0,
  // Collect as little as possible: no IPs/user details beyond the id we set, no cookies,
  // headers, request bodies or query strings (share links carry a token).
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
  },
  beforeSend(event) {
    if (event.request) {
      event.request.url = withoutQuery(event.request.url);
      delete event.request.query_string;
    }
    return event;
  },
  beforeBreadcrumb(crumb) {
    for (const key of ['url', 'from', 'to'] as const) {
      const value = crumb.data?.[key];
      if (typeof value === 'string') crumb.data![key] = withoutQuery(value);
    }
    return crumb;
  },
});

export const setCrashUser = (id: string | null | undefined) => Sentry.setUser(id ? { id } : null);
