import { createClient } from '@supabase/supabase-js';

// Standard logic: This looks at your .env.local file automatically
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';

// Check if we have valid Supabase credentials
export const hasValidSupabaseCredentials = supabaseUrl && 
                                           supabaseAnonKey && 
                                           (supabaseUrl.startsWith('http://') || supabaseUrl.startsWith('https://')) &&
                                           supabaseUrl !== 'https://placeholder.supabase.co';

// Custom fetch: adds timeout and handles "Failed to fetch" (network errors) more gracefully
const SUPABASE_FETCH_TIMEOUT = 15000;
function supabaseFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), SUPABASE_FETCH_TIMEOUT);
  return fetch(input, {
    ...init,
    signal: controller.signal
  }).then(
    (res) => {
      clearTimeout(timeoutId);
      return res;
    },
    (err) => {
      clearTimeout(timeoutId);
      if (err?.name === 'AbortError') {
        throw new Error('Supabase request timed out. Check your network connection.');
      }
      if (err?.message === 'Failed to fetch' || err?.name === 'TypeError') {
        throw new Error('Cannot reach Supabase. You may be offline or the service is unavailable.');
      }
      throw err;
    }
  );
}

if (!hasValidSupabaseCredentials) {
  console.warn('⚠️  Supabase credentials not configured. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local');
  console.warn('   You can find these in your Supabase project settings: https://app.supabase.com/project/_/settings/api');
  console.warn('   The app will start but Supabase features (auth, database) will not work until credentials are added.');
}

// Create client with valid URL format (even if placeholder) to prevent initialization errors
export const supabase = createClient(
  hasValidSupabaseCredentials ? supabaseUrl : 'https://placeholder.supabase.co',
  hasValidSupabaseCredentials ? supabaseAnonKey : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTIwMDAsImV4cCI6MTk2MDc2ODAwMH0.placeholder',
  { global: { fetch: supabaseFetch } }
);