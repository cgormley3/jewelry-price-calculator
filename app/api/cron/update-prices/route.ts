import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchPricesFromBullionByPost } from '@/lib/bullionbypost';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 60;

function isAuthorized(request: Request): boolean {
  const userAgent = request.headers.get('user-agent') || '';
  if (userAgent.includes('vercel-cron')) return true;
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET?.trim();
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  return false;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    const priceData = await fetchPricesFromBullionByPost();
    const hasValidPrices =
      priceData.gold > 0 || priceData.silver > 0 || priceData.platinum > 0 || priceData.palladium > 0;

    if (!hasValidPrices) {
      console.warn('BullionByPost: no valid prices parsed');
      return NextResponse.json({ ok: false, error: 'No valid prices' }, { status: 200 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { error } = await supabase.from('metal_prices').upsert({
      id: 1,
      gold: priceData.gold,
      silver: priceData.silver,
      platinum: priceData.platinum,
      palladium: priceData.palladium,
      gold_pct: priceData.gold_pct,
      silver_pct: priceData.silver_pct,
      platinum_pct: priceData.platinum_pct,
      palladium_pct: priceData.palladium_pct,
      updated_at: priceData.updated_at,
    });

    if (error) {
      console.error('Failed to save metal_prices:', error.message);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    console.log('Prices updated:', { gold: priceData.gold, silver: priceData.silver });
    return NextResponse.json({ ok: true, updated_at: priceData.updated_at });
  } catch (err: any) {
    console.error('Cron update-prices error:', err?.message);
    return NextResponse.json({ ok: false, error: err?.message }, { status: 500 });
  }
}
