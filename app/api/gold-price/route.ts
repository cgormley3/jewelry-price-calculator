import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY! // Use the Secret Key you found
  );

  // Added timestamp to break the Google export cache
  const timestamp = Date.now();
  const CSV_URL = `https://docs.google.com/spreadsheets/d/e/2PACX-1vRCIKyw7uQpytVE7GayB_rMY8qqMwSjat28AwLj9rSSD64OrZRqDSIuIcDIdAob_BK81rrempUgTO-H/pub?gid=1610736361&single=true&output=csv&t=${timestamp}`;

  try {
    const res = await fetch(CSV_URL, { cache: 'no-store' });
    const text = await res.text();
    
    // Split text into rows and then into columns
    const rows = text.split('\n').map(row => row.split(','));

    const parsePrice = (rowIndex: number) => {
      const row = rows[rowIndex];
      if (!row) return 0;
      
      // We join the row back together in case Google added extra commas inside quotes
      const fullRowText = row.join(''); 
      // This regex removes everything except numbers and the decimal point
      const cleanValue = fullRowText.replace(/[^0-9.]/g, '');
      
      return parseFloat(cleanValue) || 0;
    };

    const priceData = {
      gold: parsePrice(1),      // Row 2: Gold
      silver: parsePrice(2),    // Row 3: Silver
      platinum: parsePrice(3),  // Row 4: Platinum
      palladium: parsePrice(4), // Row 5: Palladium
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