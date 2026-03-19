import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isVaultPlusSubscriptionActive } from '@/lib/is-vault-plus-active';
import { VAULT_PLUS_PRICE_PHRASE } from '@/lib/vault-plus-copy';
import { fetchLatestSubscriptionForUser } from '@/lib/supabase-subscription-fetch';

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
    const { newItem, itemId, accessToken } = body;

    if (!newItem?.name) {
      return NextResponse.json({ error: 'Missing name' }, { status: 400 });
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    if (!accessToken) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 400 });
    }
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(accessToken);
    if (userError || !user?.id) {
      return NextResponse.json({ error: userError?.message || 'Invalid or expired session' }, { status: 401 });
    }
    if (newItem.user_id && newItem.user_id !== user.id) {
      return NextResponse.json({ error: 'Session mismatch' }, { status: 403 });
    }
    const sub = await fetchLatestSubscriptionForUser(supabase, user.id);
    const subscribed = isVaultPlusSubscriptionActive(sub);
    if (!subscribed) {
      return NextResponse.json({ error: `Upgrade to Vault+ (${VAULT_PLUS_PRICE_PHRASE}) to save items`, code: 'PAYWALL_VAULT' }, { status: 402 });
    }

    const normalizeStockQty = (v: unknown): number => {
      const n = Math.floor(Number(v));
      if (!Number.isFinite(n) || n < 1) return 1;
      return Math.min(999999, n);
    };

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
        stock_qty: normalizeStockQty(newItem.stock_qty),
      };

      const { data, error } = await supabase
        .from('inventory')
        .update(updatePayload)
        .eq('id', itemId)
        .eq('user_id', user.id)
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

    const rowToInsert = {
      ...newItem,
      stock_qty: normalizeStockQty(newItem.stock_qty),
    };

    const { data, error } = await supabase
      .from('inventory')
      .insert([rowToInsert])
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
