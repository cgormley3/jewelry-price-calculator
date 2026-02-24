import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  const hasSupabaseConfig = supabaseUrl && supabaseServiceKey && supabaseUrl.startsWith('http');

  const uniqueId = Math.random().toString(36).substring(7);
  const CSV_URL = `https://docs.google.com/spreadsheets/d/e/2PACX-1vRCIKyw7uQpytVE7GayB_rMY8qqMwSjat28AwLj9rSSD64OrZRqDSIuIcDIdAob_BK81rrempUgTO-H/pub?gid=1610736361&single=true&output=csv&cachebuster=${uniqueId}`;

  try {
    const res = await fetch(CSV_URL, { 
      method: 'GET',
      headers: { 
        'Cache-Control': 'no-cache',
        'User-Agent': 'Mozilla/5.0 (compatible; JewelryPriceCalc/1.0)'
      },
      cache: 'no-store'
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch prices: ${res.status} ${res.statusText}`);
    }

    let text = await res.text();
    text = text.replace(/^\uFEFF/, ''); // Strip UTF-8 BOM if present
    console.log("RAW CSV TEXT FROM GOOGLE:", text.substring(0, 500)); // Log first 500 chars for debugging

    const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);

    /** Extract first price-like number from a line. Handles: 2650.50, 2,650.50, 2 650.50, $2,650.50 */
    const extractPrice = (line: string): number => {
      const match = line.match(/(\d[\d\s,]*\.?\d*)/g);
      if (!match || match.length === 0) return 0;
      const cleanValue = match[0].replace(/[\s,]/g, '');
      return parseFloat(cleanValue) || 0;
    };

    /** Extract second number as % change (allows negative) */
    const extractChangePct = (line: string): number | null => {
      const match = line.match(/-?\d[\d\s,]*\.?\d*/g);
      if (!match || match.length < 2) return null;
      const pct = parseFloat(match[1].replace(/[\s,]/g, ''));
      return isNaN(pct) ? null : pct;
    };

    const findPrice = (metalName: string, altNames?: string[]) => {
      const names = [metalName, ...(altNames || [])];
      for (const name of names) {
        const line = lines.find(l => l.toLowerCase().includes(name.toLowerCase()));
        if (line) {
          const price = extractPrice(line);
          if (price > 0) return price;
        }
      }
      return 0;
    };

    const findChangePct = (metalName: string, altNames?: string[]) => {
      const names = [metalName, ...(altNames || [])];
      for (const name of names) {
        const line = lines.find(l => l.toLowerCase().includes(name.toLowerCase()));
        if (line) {
          const pct = extractChangePct(line);
          if (pct !== null) return pct;
        }
      }
      return null;
    };

    const priceData = {
      gold: findPrice('Gold', ['XAU', 'gold spot']),
      silver: findPrice('Silver', ['XAG', 'silver spot']),
      platinum: findPrice('Platinum', ['platinum spot', 'plat']),
      palladium: findPrice('Palladium', ['palladium spot', 'pall']),
      gold_pct: findChangePct('Gold', ['XAU']),
      silver_pct: findChangePct('Silver', ['XAG']),
      platinum_pct: findChangePct('Platinum'),
      palladium_pct: findChangePct('Palladium'),
      updated_at: new Date().toISOString()
    };

    console.log("PARSED DATA TO DATABASE:", priceData);

    // If CSV parse produced no valid prices, try Supabase fallback
    const hasValidPrices = (priceData.gold > 0 || priceData.silver > 0 || priceData.platinum > 0 || priceData.palladium > 0);
    if (!hasValidPrices && hasSupabaseConfig) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data, error } = await supabase.from('metal_prices').select('*').eq('id', 1).single();
        if (!error && data && (data.gold > 0 || data.silver > 0)) {
          return NextResponse.json({
            success: true,
            gold: data.gold || 0,
            silver: data.silver || 0,
            platinum: data.platinum || 0,
            palladium: data.palladium || 0,
            gold_pct: null,
            silver_pct: null,
            platinum_pct: null,
            palladium_pct: null,
            updated_at: data.updated_at || new Date().toISOString(),
            _fallback: true
          });
        }
      } catch (fbErr: any) {
        console.warn("Supabase fallback failed:", fbErr.message);
      }
    }

    // Only try to save to Supabase if credentials are configured (omit _pct until columns exist)
    if (hasSupabaseConfig) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { gold, silver, platinum, palladium, updated_at } = priceData;
        const { error: dbError } = await supabase
          .from('metal_prices')
          .upsert({ id: 1, gold, silver, platinum, palladium, updated_at });

        if (dbError) {
          console.warn("Failed to save prices to Supabase:", dbError.message);
          // Continue anyway - return the prices even if DB save fails
        }
      } catch (dbErr: any) {
        console.warn("Supabase error (non-fatal):", dbErr.message);
        // Continue anyway - return the prices even if DB save fails
      }
    } else {
      console.log("Supabase not configured - skipping database save");
    }

    return NextResponse.json({ success: true, ...priceData });

  } catch (err: any) {
    console.error("Price fetch error:", err.message);
    // Fallback: try to serve cached prices from Supabase (from previous successful fetches)
    if (hasSupabaseConfig) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { data, error } = await supabase.from('metal_prices').select('*').eq('id', 1).single();
        if (!error && data && (data.gold > 0 || data.silver > 0)) {
          return NextResponse.json({
            success: true,
            gold: data.gold || 0,
            silver: data.silver || 0,
            platinum: data.platinum || 0,
            palladium: data.palladium || 0,
            updated_at: data.updated_at || new Date().toISOString(),
            _fallback: true
          });
        }
      } catch (fbErr: any) {
        console.warn("Supabase fallback failed:", fbErr.message);
      }
    }
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}