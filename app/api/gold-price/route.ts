import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! 
  );

  const uniqueId = Math.random().toString(36).substring(7);
  const CSV_URL = `https://docs.google.com/spreadsheets/d/e/2PACX-1vRCIKyw7uQpytVE7GayB_rMY8qqMwSjat28AwLj9rSSD64OrZRqDSIuIcDIdAob_BK81rrempUgTO-H/pub?gid=1610736361&single=true&output=csv&cachebuster=${uniqueId}`;

  try {
    const res = await fetch(CSV_URL, { 
      method: 'GET',
      headers: {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0'
      },
      cache: 'no-store',
      next: { revalidate: 0 } 
    });
    const text = await res.text();
    
    // Split by newlines (handling potential \r\n from Google)
    const rows = text.split(/\r?\n/).map(row => row.split(','));

    const parsePrice = (rowIndex: number) => {
      const row = rows[rowIndex];
      if (!row || row.length < 2) return 0;
      
      // Target column index 1 (the second column) specifically
      // Clean only that specific cell of quotes, spaces, or currency symbols
      const cleanValue = row[1].replace(/[^0-9.]/g, '');
      
      return parseFloat(cleanValue) || 0;
    };

    const priceData = {
      gold: parsePrice(1),      // Row 2
      silver: parsePrice(2),    // Row 3
      platinum: parsePrice(3),  // Row 4
      palladium: parsePrice(4), // Row 5
      updated_at: new Date().toISOString() 
    };

    console.log("Saving to Tank:", priceData);

    const { error: dbError } = await supabase
      .from('metal_prices')
      .upsert({ id: 1, ...priceData });

    if (dbError) throw new Error(dbError.message);

    return NextResponse.json({ success: true, ...priceData });

  } catch (err: any) {
    console.error("Tank Error:", err.message);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}