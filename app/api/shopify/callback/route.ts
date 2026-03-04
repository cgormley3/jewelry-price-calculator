import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

function getAppOrigin(): string {
  return process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

function parseAndVerifyState(
  state: string,
  clientSecret: string
): { shop: string; userId: string } | null {
  try {
    const [encoded, hmac] = state.split('.');
    if (!encoded || !hmac) return null;
    const payload = Buffer.from(encoded, 'base64url').toString('utf8');
    const expectedHmac = crypto.createHmac('sha256', clientSecret).update(payload).digest('hex');
    if (!crypto.timingSafeEqual(Buffer.from(hmac, 'hex'), Buffer.from(expectedHmac, 'hex'))) {
      return null;
    }
    const { shop, userId } = JSON.parse(payload);
    if (!shop || !userId) return null;
    return { shop, userId };
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const clientId = process.env.SHOPIFY_CLIENT_ID?.trim();
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';

  if (!clientId || !clientSecret || !supabaseUrl || !supabaseServiceKey) {
    const origin = getAppOrigin();
    return NextResponse.redirect(`${origin}?shopify_error=config`);
  }

  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const shop = searchParams.get('shop');
  const state = searchParams.get('state');

  const origin = getAppOrigin();
  const failRedirect = (reason: string) =>
    NextResponse.redirect(`${origin}?shopify_error=${encodeURIComponent(reason)}`);
  const successRedirect = () =>
    NextResponse.redirect(`${origin}?shopify_connected=1`);

  if (!code || !shop || !state) {
    return failRedirect('missing_params');
  }

  const parsed = parseAndVerifyState(state, clientSecret);
  if (!parsed) {
    return failRedirect('invalid_state');
  }
  if (parsed.shop !== shop) {
    return failRedirect('shop_mismatch');
  }

  try {
    const tokenRes = await fetch(`https://${shop}/admin/oauth/access_token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: clientId,
        client_secret: clientSecret,
        code,
      }),
    });

    if (!tokenRes.ok) {
      const errText = await tokenRes.text();
      console.error('Shopify token exchange failed:', tokenRes.status, errText);
      return failRedirect('token_exchange_failed');
    }

    const { access_token } = await tokenRes.json();
    if (!access_token) {
      return failRedirect('no_token');
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { error } = await supabase.from('shopify_connections').upsert(
      {
        user_id: parsed.userId,
        shop_domain: shop,
        access_token,
      },
      { onConflict: 'user_id,shop_domain' }
    );

    if (error) {
      console.error('Shopify save connection error:', error);
      return failRedirect('db_error');
    }

    return successRedirect();
  } catch (e: any) {
    console.error('Shopify callback error:', e);
    return failRedirect(e?.message || 'server_error');
  }
}
