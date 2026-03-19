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
    const { accessToken, userId, formulaId } = body;
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

    // Unstar all formulas for this user
    const { error: unstarError } = await supabase
      .from('formulas')
      .update({ is_starred: false })
      .eq('user_id', resolvedUserId);

    if (unstarError) {
      console.error('Unstar formulas error:', unstarError);
      return NextResponse.json({ error: unstarError.message }, { status: 400 });
    }

    // If formulaId provided, star that formula; otherwise just unstar all
    if (formulaId) {
      const { data, error } = await supabase
        .from('formulas')
        .update({ is_starred: true })
        .eq('id', formulaId)
        .eq('user_id', resolvedUserId)
        .select()
        .single();

      if (error) {
        console.error('Star formula error:', error);
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json(data);
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('Star formula exception:', e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}
