import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

// Required: Next.js must not parse the body so we can verify HMAC on raw bytes
export const runtime = 'nodejs';

function verifyHmac(rawBody: string, hmacHeader: string | null, secret: string): boolean {
  if (!hmacHeader || !secret) return false;
  try {
    const computed = crypto
      .createHmac('sha256', secret)
      .update(rawBody, 'utf8')
      .digest('base64');
    return crypto.timingSafeEqual(
      Buffer.from(computed, 'base64'),
      Buffer.from(hmacHeader, 'base64')
    );
  } catch {
    return false;
  }
}

export async function POST(request: Request) {
  const clientSecret = process.env.SHOPIFY_CLIENT_SECRET?.trim();
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';

  if (!clientSecret || !supabaseUrl || !supabaseServiceKey) {
    return new NextResponse(null, { status: 500 });
  }

  // Get raw body for HMAC - must use text() before any JSON parsing
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const hmacHeader = request.headers.get('x-shopify-hmac-sha256');
  if (!verifyHmac(rawBody, hmacHeader, clientSecret)) {
    return new NextResponse(null, { status: 401 });
  }

  let payload: { shop_id?: number; shop_domain?: string; [key: string]: unknown };
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new NextResponse(null, { status: 400 });
  }

  const topic = request.headers.get('x-shopify-topic') || '';
  const shopDomain = payload.shop_domain as string | undefined;

  // Process based on topic - respond 200 quickly, do heavy work async if needed
  switch (topic) {
    case 'customers/data_request':
      // We don't store Shopify customer data; we store jeweler inventory.
      // Acknowledge receipt. Store owner handles the request.
      break;

    case 'customers/redact':
      // We don't store Shopify customer data. Acknowledge.
      break;

    case 'shop/redact':
      // Store uninstalled - delete our connection data for this shop
      if (shopDomain) {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);
        await supabase
          .from('shopify_connections')
          .delete()
          .eq('shop_domain', shopDomain);
      }
      break;

    default:
      break;
  }

  return new NextResponse(null, { status: 200 });
}
