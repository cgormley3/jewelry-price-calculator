import { createClient } from '@supabase/supabase-js';

// Standard logic: This looks at your .env.local file automatically
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';

// Check if we have valid Supabase credentials
export const hasValidSupabaseCredentials = supabaseUrl && 
                                           supabaseAnonKey && 
                                           (supabaseUrl.startsWith('http://') || supabaseUrl.startsWith('https://')) &&
                                           supabaseUrl !== 'https://placeholder.supabase.co';

if (!hasValidSupabaseCredentials) {
  console.warn('⚠️  Supabase credentials not configured. Please add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local');
  console.warn('   You can find these in your Supabase project settings: https://app.supabase.com/project/_/settings/api');
  console.warn('   The app will start but Supabase features (auth, database) will not work until credentials are added.');
}

// Create client with valid URL format (even if placeholder) to prevent initialization errors
// Actual API calls will fail if credentials are invalid, but the app can start
export const supabase = createClient(
  hasValidSupabaseCredentials ? supabaseUrl : 'https://placeholder.supabase.co',
  hasValidSupabaseCredentials ? supabaseAnonKey : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBsYWNlaG9sZGVyIiwicm9sZSI6ImFub24iLCJpYXQiOjE2NDUxOTIwMDAsImV4cCI6MTk2MDc2ODAwMH0.placeholder'
);