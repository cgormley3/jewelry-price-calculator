import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';

  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json(
      { connected: false, shop: null, error: 'Supabase not configured' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { accessToken } = body;
    if (!accessToken) {
      return NextResponse.json(
        { connected: false, shop: null, error: 'Missing access token' },
        { status: 400 }
      );
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(accessToken);
    if (userError || !user?.id) {
      return NextResponse.json(
        { connected: false, shop: null, error: userError?.message || 'Invalid session' },
        { status: 401 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: connections, error } = await supabase
      .from('shopify_connections')
      .select('shop_domain')
      .eq('user_id', user.id)
      .limit(1);

    if (error) {
      // Table might not exist yet
      return NextResponse.json({ connected: false, shop: null });
    }

    const shop = connections?.[0]?.shop_domain || null;
    return NextResponse.json({
      connected: !!shop,
      shop,
    });
  } catch (e: any) {
    console.error('Shopify status error:', e);
    return NextResponse.json(
      { connected: false, shop: null, error: e?.message || 'Server error' },
      { status: 500 }
    );
  }
}
