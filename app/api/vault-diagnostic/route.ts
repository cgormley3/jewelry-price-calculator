import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// Helps diagnose why inventory isn't showing. Call with POST { accessToken }.
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

    const { data: allSubs } = await supabase.from('subscriptions').select('user_id, status').limit(10);

    let fix_suggestion: string | null = null;
    if (!subscribed && (myCount ?? 0) > 0 && allSubs?.length) {
      const subForOther = allSubs.find((s: any) => s.user_id !== user.id && String(s.status).toLowerCase() === 'active');
      if (subForOther) {
        fix_suggestion = `Subscription exists under a different account. Move it to yours (you have ${myCount} items). Run in Supabase SQL Editor:\n\nUPDATE subscriptions SET user_id = '${user.id}' WHERE user_id = '${subForOther.user_id}';`;
      } else {
        fix_suggestion = `You have ${myCount} items but no active subscription for your account. Add one in Supabase SQL Editor:\n\nINSERT INTO subscriptions (user_id, status, current_period_end)\nVALUES ('${user.id}', 'active', '2099-12-31 23:59:59+00')\nON CONFLICT (user_id) DO UPDATE SET status = 'active', current_period_end = '2099-12-31 23:59:59+00';`;
      }
    } else if (!subscribed && (myCount ?? 0) === 0) {
      const { data: otherUsers } = await supabase.from('inventory').select('user_id').limit(100);
      const userIdsWithItems = [...new Set((otherUsers || []).map((r: any) => r.user_id))];
      if (userIdsWithItems.length > 0) {
        fix_suggestion = `Items exist under a different account. Move them to yours. Run in Supabase SQL Editor:\n\nUPDATE inventory SET user_id = '${user.id}' WHERE user_id = '${userIdsWithItems[0]}';`;
      } else if (allSubs?.some((s: any) => s.user_id !== user.id)) {
        const subForOther = allSubs.find((s: any) => s.user_id !== user.id);
        fix_suggestion = `Subscription is under a different account. Move it to yours:\n\nUPDATE subscriptions SET user_id = '${user.id}' WHERE user_id = '${subForOther?.user_id}';`;
      }
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
  } catch (e: any) {
    console.error('Vault diagnostic error:', e);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
