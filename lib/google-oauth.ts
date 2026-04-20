/**
 * Web client ID for Google Identity Services (Sign in with Google).
 *
 * Must be set via `NEXT_PUBLIC_GOOGLE_CLIENT_ID` in `.env.local` and Vercel (no hardcoded fallback),
 * so the Client ID always matches the OAuth client you configure in Google Cloud Console.
 * In Google → Credentials → that same client → Authorized JavaScript origins, add your app origin
 * (e.g. `https://vault.bouldermetalsmiths.com` and `http://localhost:3000`).
 *
 * Client secret belongs only in Supabase (Auth → Providers → Google), never here.
 */
export const GOOGLE_WEB_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim() ?? "";
