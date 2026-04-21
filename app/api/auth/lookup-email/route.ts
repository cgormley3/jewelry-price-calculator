import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Returns whether an auth user exists for this email (password, magic link, OAuth, etc.).
 * Uses the service role — never expose the key client-side. Enables email-first UX without
 * guessing login vs sign-up in the UI.
 */
export async function POST(req: Request) {
  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const raw = typeof body.email === 'string' ? body.email.trim() : '';
  if (!raw || !EMAIL_RE.test(raw)) {
    return NextResponse.json({ error: 'Enter a valid email address.' }, { status: 400 });
  }
  const normalized = raw.toLowerCase();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!supabaseUrl || !serviceKey) {
    return NextResponse.json({ error: 'Email lookup is not configured.' }, { status: 503 });
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const perPage = 1000;
  let page = 1;
  for (;;) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) {
      console.error('lookup-email listUsers:', error.message);
      return NextResponse.json({ error: 'Could not look up this email. Try again.' }, { status: 500 });
    }
    const users = data?.users ?? [];
    const found = users.find((u) => (u.email || '').toLowerCase() === normalized);
    if (found) {
      let identities = found.identities ?? [];
      if (identities.length === 0 && found.id) {
        const { data: fullUser } = await admin.auth.admin.getUserById(found.id);
        identities = fullUser?.user?.identities ?? [];
      }
      const hasGoogleIdentity = identities.some(
        (i: { provider?: string }) => i.provider === 'google'
      );
      return NextResponse.json({ exists: true, hasGoogleIdentity });
    }
    if (users.length < perPage) {
      break;
    }
    page += 1;
    if (page > 50) {
      break;
    }
  }

  return NextResponse.json({ exists: false });
}
