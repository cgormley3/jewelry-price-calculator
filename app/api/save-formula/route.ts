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
    const { accessToken, userId, formula } = body;
    if (!accessToken) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 400 });
    }
    if (!formula?.name || !formula?.formula_base || !formula?.formula_wholesale || !formula?.formula_retail) {
      return NextResponse.json({ error: 'Missing formula name or formula fields' }, { status: 400 });
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
    const row = {
      user_id: resolvedUserId,
      name: formula.name.trim(),
      formula_base: formula.formula_base,
      formula_wholesale: formula.formula_wholesale,
      formula_retail: formula.formula_retail,
    };

    if (formula.id) {
      const { data, error } = await supabase
        .from('formulas')
        .update(row)
        .eq('id', formula.id)
        .eq('user_id', resolvedUserId)
        .select()
        .single();

      if (error) {
        console.error('Update formula error:', error);
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json(data);
    } else {
      const { data, error } = await supabase
        .from('formulas')
        .insert([row])
        .select()
        .single();

      if (error) {
        console.error('Insert formula error:', error);
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json(data);
    }
  } catch (e: any) {
    console.error('Save formula exception:', e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}
