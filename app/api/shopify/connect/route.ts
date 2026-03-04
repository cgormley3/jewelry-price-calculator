import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const SCOPES = 'write_products,read_products';

function getRedirectUri(): string {
  // Prefer stable domain (Vercel custom domain) over deployment-specific VERCEL_URL
  const base = process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null) ||
    'http://localhost:3000';
  const url = base.startsWith('http') ? base : `https://${base}`;
  return `${url.replace(/\/$/, '')}/api/shopify/callback`;
}

function createState(shop: string, userId: string, secret: string): string {
  const payload = JSON.stringify({ shop, userId });
  const encoded = Buffer.from(payload, 'utf8').toString('base64url');
  const hmac = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return `${encoded}.${hmac}`;
}

export async function POST(request: Request) {
  const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';

  if (!clientId || !clientSecret || !supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: 'Shopify or Supabase not configured' },
      { status: 500 }
    );
  }

  try {
    const body = await request.json();
    const { accessToken, shop: rawShop } = body;
    if (!accessToken || !rawShop) {
      return NextResponse.json(
        { error: 'Missing accessToken or shop' },
        { status: 400 }
      );
    }

    // Normalize shop to "mystore.myshopify.com"
    // Handles: "mystore", "mystore.myshopify.com", "mystore.com" (custom domain → use as store name)
    let shop = String(rawShop).toLowerCase().trim();
    if (shop.endsWith('.myshopify.com')) {
      // Already correct
    } else {
      let storeName = shop.replace(/\.myshopify\.com$/i, '');
      // If user entered "store.com" or "store.net", strip TLD to get store name
      storeName = storeName.replace(/\.(com|net|org|io|co|store)$/i, '');
      shop = `${storeName}.myshopify.com`;
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(accessToken);
    if (userError || !user?.id) {
      return NextResponse.json(
        { error: userError?.message || 'Invalid or expired session' },
        { status: 401 }
      );
    }

    const state = createState(shop, user.id, clientSecret);
    const redirectUri = getRedirectUri();
    const authUrl = new URL(`https://${shop}/admin/oauth/authorize`);
    authUrl.searchParams.set('client_id', clientId);
    authUrl.searchParams.set('scope', SCOPES);
    authUrl.searchParams.set('redirect_uri', redirectUri);
    authUrl.searchParams.set('state', state);

    return NextResponse.json({ redirectUrl: authUrl.toString() });
  } catch (e: any) {
    console.error('Shopify connect error:', e);
    return NextResponse.json(
      { error: e?.message || 'Server error' },
      { status: 500 }
    );
  }
}
