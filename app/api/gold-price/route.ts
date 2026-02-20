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
      headers: { 'Cache-Control': 'no-cache' },
      cache: 'no-store'
    });

    if (!res.ok) {
      throw new Error(`Failed to fetch prices: ${res.status} ${res.statusText}`);
    }

    const text = await res.text();
    console.log("RAW CSV TEXT FROM GOOGLE:", text); // Check this in your terminal!

    const lines = text.split(/\r?\n/);

    const findPrice = (metalName: string) => {
      // Find the line that CONTAINS the name (case insensitive)
      const line = lines.find(l => l.toLowerCase().includes(metalName.toLowerCase()));
      if (!line) return 0;

      // Extract the price: Find the first number after the comma
      // This regex looks for digits, commas, and dots, ignoring quotes and $
      const match = line.match(/[\d,.]+/g);
      if (match && match.length > 0) {
        // We take the last match in the line (the price), 
        // cleaning out any thousands-separator commas
        const cleanValue = match[match.length - 1].replace(/,/g, '');
        return parseFloat(cleanValue) || 0;
      }
      return 0;
    };

    const priceData = {
      gold: findPrice('Gold'),
      silver: findPrice('Silver'),
      platinum: findPrice('Platinum'),
      palladium: findPrice('Palladium'),
      updated_at: new Date().toISOString() 
    };

    console.log("PARSED DATA TO DATABASE:", priceData);

    // Only try to save to Supabase if credentials are configured
    if (hasSupabaseConfig) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        const { error: dbError } = await supabase
          .from('metal_prices')
          .upsert({ id: 1, ...priceData });

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
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}