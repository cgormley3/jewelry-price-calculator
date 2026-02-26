import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';

  const result: {
    configured: boolean;
    urlValid: boolean;
    anonKeyPresent: boolean;
    serviceKeyPresent: boolean;
    serviceKeyFormat: 'jwt' | 'sb_secret' | 'unknown';
    connectionTest: 'ok' | 'fail' | 'skipped';
    inventoryTableTest: 'ok' | 'fail' | 'skipped' | 'no_access';
    metalPricesTableTest: 'ok' | 'fail' | 'skipped';
    error?: string;
  } = {
    configured: !!(supabaseUrl && supabaseAnonKey),
    urlValid: supabaseUrl.startsWith('https://') && supabaseUrl.includes('.supabase.co'),
    anonKeyPresent: !!supabaseAnonKey,
    serviceKeyPresent: !!supabaseServiceKey,
    serviceKeyFormat: supabaseServiceKey.startsWith('eyJ') ? 'jwt' : supabaseServiceKey.startsWith('sb_secret_') ? 'sb_secret' : 'unknown',
    connectionTest: 'skipped',
    inventoryTableTest: 'skipped',
    metalPricesTableTest: 'skipped',
  };

  if (!result.configured || !result.urlValid) {
    return NextResponse.json(result);
  }

  try {
    // Test with service role (bypasses RLS) - for server-side diagnostics
    if (supabaseServiceKey) {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      result.connectionTest = 'ok';

      // Test metal_prices (used by gold-price API)
      try {
        const { error } = await supabase.from('metal_prices').select('id').limit(1);
        result.metalPricesTableTest = error ? 'fail' : 'ok';
      } catch {
        result.metalPricesTableTest = 'fail';
      }

      // Test inventory table
      try {
        const { data, error } = await supabase.from('inventory').select('id').limit(1);
        result.inventoryTableTest = error ? 'fail' : 'ok';
      } catch {
        result.inventoryTableTest = 'fail';
      }
    }
  } catch (err: any) {
    result.connectionTest = 'fail';
    result.error = err?.message || 'Connection failed';
  }

  return NextResponse.json(result);
}
