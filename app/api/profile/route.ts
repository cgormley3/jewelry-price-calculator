import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

async function getProfileForUser(accessToken: string) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  if (!supabaseUrl || !supabaseServiceKey) {
    return { error: 'Supabase not configured', status: 500 as const };
  }
  const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
  const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(accessToken);
  if (userError || !user?.id) {
    return { error: userError?.message || 'Invalid or expired session', status: 401 as const };
  }
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, company_name, logo_url')
    .eq('user_id', user.id)
    .single();
  if (error && error.code !== 'PGRST116') {
    return { error: error.message, status: 400 as const };
  }
  return { data: data || { display_name: null, company_name: null, logo_url: null } };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const accessToken = searchParams.get('accessToken');
    if (!accessToken) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 400 });
    }
    const result = await getProfileForUser(accessToken);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: result.status });
    }
    return NextResponse.json(result.data);
  } catch (e: any) {
    console.error('Profile GET error:', e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const { accessToken, userId, display_name, company_name, logo_url } = body;
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

    if (display_name !== undefined || company_name !== undefined || logo_url !== undefined) {
      const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (display_name !== undefined) updates.display_name = display_name;
      if (company_name !== undefined) updates.company_name = company_name;
      if (logo_url !== undefined) updates.logo_url = logo_url;

      const { data, error } = await supabase
        .from('profiles')
        .upsert({ user_id: resolvedUserId, ...updates }, { onConflict: 'user_id' })
        .select()
        .single();

      if (error) {
        console.error('Profile update error:', error.code, error.message, error.details);
        return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
      }
      return NextResponse.json(data);
    }

    const { data, error } = await supabase
      .from('profiles')
      .select('display_name, company_name, logo_url')
      .eq('user_id', resolvedUserId)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Profile fetch error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(data || { display_name: null, company_name: null, logo_url: null });
  } catch (e: any) {
    console.error('Profile API error:', e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}
