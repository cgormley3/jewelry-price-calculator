import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function PATCH(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { accessToken, entryId, userId, inventory_id, duration_minutes, note } = body;
    if (!accessToken || !entryId) {
      return NextResponse.json({ error: 'Missing access token or entry ID' }, { status: 400 });
    }
    const dur = duration_minutes != null ? Number(duration_minutes) : null;
    if (dur !== null && (!Number.isFinite(dur) || dur <= 0)) {
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
    const payload: Record<string, unknown> = {};
    if (inventory_id !== undefined) payload.inventory_id = inventory_id || null;
    if (dur !== null) payload.duration_minutes = Math.round(dur);
    if (note !== undefined) payload.note = (note || '').trim() || null;
    if (Object.keys(payload).length === 0) {
      return NextResponse.json({ error: 'Nothing to update' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('time_entries')
      .update(payload)
      .eq('id', entryId)
      .eq('user_id', resolvedUserId)
      .select()
      .single();

    if (error) {
      console.error('Update time entry error:', error);
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(data);
  } catch (e: any) {
    console.error('Update time entry exception:', e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}
