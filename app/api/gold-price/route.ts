import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

/**
 * Spot prices for the app: read-only from Supabase (`metal_prices` row id=1).
 * Google Sheets should push updates to Supabase on a schedule (e.g. Apps Script every minute).
 */
export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  const hasSupabaseConfig = Boolean(
    supabaseUrl && supabaseServiceKey && supabaseUrl.startsWith('http')
  );

  if (!hasSupabaseConfig) {
    console.error('gold-price: missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return NextResponse.json(
      {
        success: false,
        gold: 0,
        silver: 0,
        platinum: 0,
        palladium: 0,
        gold_pct: null,
        silver_pct: null,
        platinum_pct: null,
        palladium_pct: null,
        updated_at: new Date().toISOString(),
        _error: true,
      },
      { status: 503, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data, error } = await supabase.from('metal_prices').select('*').eq('id', 1).maybeSingle();

    if (error) {
      console.error('gold-price Supabase error:', error.message);
      return NextResponse.json(
        {
          success: false,
          gold: 0,
          silver: 0,
          platinum: 0,
          palladium: 0,
          gold_pct: null,
          silver_pct: null,
          platinum_pct: null,
          palladium_pct: null,
          updated_at: new Date().toISOString(),
          _error: true,
        },
        { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    if (!data) {
      return NextResponse.json(
        {
          success: true,
          gold: 0,
          silver: 0,
          platinum: 0,
          palladium: 0,
          updated_at: null,
          gold_pct: null,
          silver_pct: null,
          platinum_pct: null,
          palladium_pct: null,
          _empty: true,
        },
        { headers: { 'Cache-Control': 'no-store, max-age=0' } }
      );
    }

    const row = data as Record<string, unknown>;

    return NextResponse.json(
      {
        success: true,
        gold: Number(row.gold) || 0,
        silver: Number(row.silver) || 0,
        platinum: Number(row.platinum) || 0,
        palladium: Number(row.palladium) || 0,
        gold_pct: row.gold_pct != null ? Number(row.gold_pct) : null,
        silver_pct: row.silver_pct != null ? Number(row.silver_pct) : null,
        platinum_pct: row.platinum_pct != null ? Number(row.platinum_pct) : null,
        palladium_pct: row.palladium_pct != null ? Number(row.palladium_pct) : null,
        updated_at:
          typeof row.updated_at === 'string'
            ? row.updated_at
            : row.updated_at != null
              ? String(row.updated_at)
              : null,
      },
      { headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('gold-price:', message);
    return NextResponse.json(
      {
        success: false,
        gold: 0,
        silver: 0,
        platinum: 0,
        palladium: 0,
        gold_pct: null,
        silver_pct: null,
        platinum_pct: null,
        palladium_pct: null,
        updated_at: new Date().toISOString(),
        _error: true,
      },
      { status: 200, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  }
}
