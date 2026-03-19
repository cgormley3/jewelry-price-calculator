import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { fetchPricesFromBullionByPost } from '@/lib/bullionbypost';

export const dynamic = 'force-dynamic';
export const revalidate = 0;
export const maxDuration = 30;

function toResponse(priceData: { gold: number; silver: number; platinum: number; palladium: number; gold_pct?: number | null; silver_pct?: number | null; platinum_pct?: number | null; palladium_pct?: number | null; updated_at: string }) {
  return NextResponse.json(
    {
      success: true,
      gold: priceData.gold || 0,
      silver: priceData.silver || 0,
      platinum: priceData.platinum || 0,
      palladium: priceData.palladium || 0,
      gold_pct: priceData.gold_pct ?? null,
      silver_pct: priceData.silver_pct ?? null,
      platinum_pct: priceData.platinum_pct ?? null,
      palladium_pct: priceData.palladium_pct ?? null,
      updated_at: priceData.updated_at,
    },
    { headers: { 'Cache-Control': 'no-store, max-age=0' } }
  );
}

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  if (!supabaseUrl || !supabaseServiceKey) {
    return toResponse({ gold: 0, silver: 0, platinum: 0, palladium: 0, updated_at: new Date().toISOString() });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await supabase.from('metal_prices').select('*').eq('id', 1).single();

    const dbGold = Number(data?.gold) || 0;
    const hasValidData = !error && data && dbGold > 0 && (Number(data.silver) > 0 || Number(data.platinum) > 0 || Number(data.palladium) > 0);
    if (hasValidData) {
      return toResponse({
        gold: dbGold,
        silver: Number(data!.silver) || 0,
        platinum: Number(data!.platinum) || 0,
        palladium: Number(data!.palladium) || 0,
        gold_pct: (data as any).gold_pct != null ? Number((data as any).gold_pct) : null,
        silver_pct: (data as any).silver_pct != null ? Number((data as any).silver_pct) : null,
        platinum_pct: (data as any).platinum_pct != null ? Number((data as any).platinum_pct) : null,
        palladium_pct: (data as any).palladium_pct != null ? Number((data as any).palladium_pct) : null,
        updated_at: data!.updated_at || new Date().toISOString(),
      });
    }

    // DB empty, or gold missing (e.g. from failed scrape): scrape to seed/repair, then return
    try {
      const priceData = await fetchPricesFromBullionByPost();
      const hasValidPrices = priceData.gold > 0 || priceData.silver > 0 || priceData.platinum > 0 || priceData.palladium > 0;

      if (hasValidPrices) {
        try {
          await supabase.from('metal_prices').upsert({
            id: 1,
            gold: priceData.gold,
            silver: priceData.silver,
            platinum: priceData.platinum,
            palladium: priceData.palladium,
            updated_at: priceData.updated_at,
          });
        } catch (_) {
          /* save failed but we still return the data */
        }
        return toResponse(priceData);
      }
    } catch (scrapeErr: any) {
      console.warn('Gold-price seed scrape failed:', scrapeErr?.message);
    }

    return toResponse({ gold: 0, silver: 0, platinum: 0, palladium: 0, updated_at: new Date().toISOString() });
  } catch (err: any) {
    console.error('Gold-price fetch error:', err?.message);
    return toResponse({ gold: 0, silver: 0, platinum: 0, palladium: 0, updated_at: new Date().toISOString() });
  }
}
