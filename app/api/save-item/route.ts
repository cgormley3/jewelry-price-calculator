import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { newItem, itemId } = body;

    if (!newItem?.name) {
      return NextResponse.json({ error: 'Missing name' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (itemId) {
      const updatePayload: Record<string, unknown> = {
        name: newItem.name,
        metals: newItem.metals ?? [],
        stones: newItem.stones ?? [],
        wholesale: newItem.wholesale ?? 0,
        retail: newItem.retail ?? 0,
        materials_at_making: newItem.materials_at_making ?? 0,
        labor_at_making: newItem.labor_at_making ?? 0,
        other_costs_at_making: newItem.other_costs_at_making ?? 0,
        stone_cost: newItem.stone_cost ?? 0,
        stone_markup: newItem.stone_markup ?? 1.5,
        overhead_cost: newItem.overhead_cost ?? 0,
        overhead_type: newItem.overhead_type ?? 'flat',
        strategy: newItem.strategy ?? 'A',
        multiplier: newItem.multiplier ?? 2.5,
        markup_b: newItem.markup_b ?? 1.8,
        custom_formula: newItem.custom_formula ?? null,
        hours: newItem.hours ?? 0,
        status: newItem.status ?? 'active',
      };

      const { data, error } = await supabase
        .from('inventory')
        .update(updatePayload)
        .eq('id', itemId)
        .select()
        .single();

      if (error) {
        console.error('Update item error:', error);
        return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
      }
      return NextResponse.json(data);
    }

    if (!newItem?.user_id) {
      return NextResponse.json({ error: 'Missing user_id for new item' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('inventory')
      .insert([newItem])
      .select()
      .single();

    if (error) {
      console.error('Save item error:', error);
      return NextResponse.json({ error: error.message, code: error.code }, { status: 400 });
    }
    return NextResponse.json(data);
  } catch (e: any) {
    console.error('Save item exception:', e);
    return NextResponse.json({ error: e?.message || 'Server error' }, { status: 500 });
  }
}
