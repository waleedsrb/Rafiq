// Settings for crash reporting (Sentry), kept free of React Native imports so tests can run them.
//
// The DSN only says where to send reports; it is public by design and ships inside the app.
export const APP_DSN =
  'https://75c38c572c731e7721bd1a4a1e97e312@o4512412496429056.ingest.de.sentry.io/4512412517335120';

export type CrashContext = {
  isDev: boolean; // running from `expo start` on a laptop
  build?: string; // git sha baked in by the publish workflow (EXPO_PUBLIC_BUILD)
  channel?: string | null; // EAS Update channel, e.g. "preview"
  updateId?: string | null; // which published update is running
};

export function crashOptions(ctx: CrashContext) {
  const build = (ctx.build ?? '').slice(0, 7) || 'dev';
  return {
    dsn: APP_DSN,
    // Local development errors are ours to see in the terminal, not in Sentry.
    enabled: !ctx.isDev,
    environment: ctx.isDev ? 'development' : ctx.channel || 'production',
    release: `rafiq@${build}`,
    dist: ctx.updateId ?? 'embedded',
    // Never attach IP addresses, cookies or request bodies. We add only the user id ourselves.
    sendDefaultPii: false,
    // Errors only for now; performance tracing costs quota we don't need yet.
    tracesSampleRate: 0,
  };
}

// The only thing about a person we send: their Supabase id, so a crash can be matched to a
// support message. Never names, phones or emails.
export function crashUser(userId: string | null | undefined) {
  return userId ? { id: userId } : null;
}
