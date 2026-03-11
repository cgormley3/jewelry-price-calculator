import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

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
    const { accessToken, userId } = body;
    if (!accessToken) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 400 });
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

    const { data: sub } = await supabase.from('subscriptions').select('status, current_period_end').eq('user_id', resolvedUserId).single();
    const subscribed = !!(sub && sub.status === 'active' && sub.current_period_end && new Date(sub.current_period_end) > new Date());

    if (!subscribed) {
      const { count } = await supabase.from('inventory').select('*', { count: 'exact', head: true }).eq('user_id', resolvedUserId);
      return NextResponse.json(
        { error: 'Upgrade to Vault+ to access your vault', code: 'PAYWALL_VAULT', hasItems: (count ?? 0) > 0 },
        { status: 402 }
      );
    }

    const { data, error } = await supabase
      .from('inventory')
      .select('*')
      .eq('user_id', resolvedUserId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Fetch inventory error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(data || []);
  } catch (e: any) {
    console.error('Fetch inventory exception:', e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}
