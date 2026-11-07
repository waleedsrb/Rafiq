import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// These two values are safe to ship in the app: the anon key only allows what
// the database's Row Level Security policies allow (see supabase/migrations).
// Copy .env.example to .env.local and fill them in.
const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const anonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.warn('Supabase env vars missing: copy .env.example to .env.local');
}

export const supabase = createClient(url ?? 'http://localhost:54321', anonKey ?? 'missing', {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
