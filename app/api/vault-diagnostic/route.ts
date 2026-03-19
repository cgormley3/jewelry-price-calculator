import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

/**
 * Helps users debug paywall / empty vault for their own account only.
 * Does not query or expose other users' IDs (public-safe).
 */
export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { accessToken } = body;
    if (!accessToken) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 400 });
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(accessToken);
    if (userError || !user?.id) {
      return NextResponse.json({ error: userError?.message || 'Invalid session' }, { status: 401 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: sub } = await supabase.from('subscriptions').select('status, current_period_end').eq('user_id', user.id).single();
    const periodValid = !sub?.current_period_end || new Date(sub.current_period_end) > new Date();
    const subscribed = !!(sub && String(sub.status).toLowerCase() === 'active' && periodValid);

    const { count: myCount } = await supabase.from('inventory').select('*', { count: 'exact', head: true }).eq('user_id', user.id);

    let fix_suggestion: string | null = null;
    if (!subscribed && (myCount ?? 0) > 0) {
      fix_suggestion =
        `You have ${myCount} item(s) on this account but no active Vault+ subscription. After paying, wait a minute and tap Refresh. If it persists, in Supabase SQL Editor check the subscriptions row for YOUR user id only:\n\n` +
        `SELECT * FROM subscriptions WHERE user_id = '${user.id}';\n\n` +
        `To activate for this account (admin only):\n` +
        `INSERT INTO subscriptions (user_id, status, current_period_end)\n` +
        `VALUES ('${user.id}', 'active', '2099-12-31 23:59:59+00')\n` +
        `ON CONFLICT (user_id) DO UPDATE SET status = 'active', current_period_end = EXCLUDED.current_period_end;`;
    } else if (!subscribed && (myCount ?? 0) === 0) {
      fix_suggestion =
        'No items for this login. If you had a vault before, you may be signed in with a different email or Google vs password — try the same method you used when you created items.';
    }

    return NextResponse.json({
      your_user_id: user.id,
      your_email: user.email,
      is_anonymous: user.is_anonymous,
      subscribed,
      subscription_status: sub?.status ?? null,
      inventory_count_for_you: myCount ?? 0,
      fix_suggestion,
    });
  } catch {
    return NextResponse.json({ error: 'Diagnostic failed' }, { status: 500 });
  }
}
