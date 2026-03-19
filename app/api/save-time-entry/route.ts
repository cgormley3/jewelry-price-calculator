import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isVaultPlusSubscriptionActive } from '@/lib/is-vault-plus-active';
import { VAULT_PLUS_PRICE_PHRASE } from '@/lib/vault-plus-copy';
import { fetchLatestSubscriptionForUser } from '@/lib/supabase-subscription-fetch';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { accessToken, userId, inventory_id, duration_minutes, note, logged_on } = body;
    if (!accessToken) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 400 });
    }
    const dur = Number(duration_minutes);
    if (!Number.isFinite(dur) || dur <= 0) {
      return NextResponse.json({ error: 'Invalid duration_minutes' }, { status: 400 });
    }

    let loggedOnDate: string | null = null;
    if (logged_on != null && String(logged_on).trim() !== '') {
      const s = String(logged_on).trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) {
        return NextResponse.json({ error: 'logged_on must be YYYY-MM-DD' }, { status: 400 });
      }
      loggedOnDate = s;
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(accessToken);
    if (userError || !user?.id) {
      return NextResponse.json({ error: userError?.message || 'Invalid or expired session' }, { status: 401 });
    }
    const resolvedUserId = user.id;
    if (userId && userId !== resolvedUserId) {
      return NextResponse.json({ error: 'Session mismatch' }, { status: 403 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const sub = await fetchLatestSubscriptionForUser(supabase, resolvedUserId);
    const subscribed = isVaultPlusSubscriptionActive(sub);
    if (!subscribed) {
      return NextResponse.json({ error: `Upgrade to Vault+ (${VAULT_PLUS_PRICE_PHRASE}) to log time`, code: 'PAYWALL_TIME' }, { status: 402 });
    }

    const { data, error } = await supabase
      .from('time_entries')
      .insert({
        user_id: resolvedUserId,
        inventory_id: inventory_id || null,
        duration_minutes: dur,
        note: (note || '').trim() || null,
        ...(loggedOnDate ? { logged_on: loggedOnDate } : {}),
      })
      .select()
      .single();

    if (error) {
      console.error('Save time entry error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(data);
  } catch (e: any) {
    console.error('Save time entry exception:', e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}
