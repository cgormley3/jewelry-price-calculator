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
    const { accessToken, userId, inventory_id, duration_minutes, note } = body;
    if (!accessToken) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 400 });
    }
    const dur = Number(duration_minutes);
    if (!Number.isFinite(dur) || dur <= 0) {
      return NextResponse.json({ error: 'Invalid duration_minutes' }, { status: 400 });
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
    const { data, error } = await supabase
      .from('time_entries')
      .insert({
        user_id: resolvedUserId,
        inventory_id: inventory_id || null,
        duration_minutes: dur,
        note: (note || '').trim() || null,
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
