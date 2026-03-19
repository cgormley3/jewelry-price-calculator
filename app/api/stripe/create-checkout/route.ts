import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

export const dynamic = 'force-dynamic';

const stripeSecret = process.env.STRIPE_SECRET_KEY?.trim();
const rawPriceEnv = process.env.STRIPE_VAULT_PLUS_PRICE_ID?.trim() || '';
/** First id when env lists several (comma-separated) for sync migration. */
const priceId = rawPriceEnv.split(/[\s,]+/).map((s) => s.trim()).find(Boolean);

export async function POST(request: Request) {
  if (!stripeSecret || !priceId) {
    return NextResponse.json({ error: 'Stripe not configured' }, { status: 500 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    const body = await request.json();
    const { accessToken, userId, successUrl, cancelUrl } = body;
    if (!accessToken) {
      return NextResponse.json({ error: 'Missing access token' }, { status: 400 });
    }

    const supabaseAuth = createClient(supabaseUrl, supabaseAnonKey);
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser(accessToken);
    if (userError || !user?.id) {
      return NextResponse.json({ error: userError?.message || 'Invalid or expired session' }, { status: 401 });
    }
    const resolvedUserId = user.id;
    if (userId && userId !== resolvedUserId) {
      return NextResponse.json({ error: 'Session mismatch' }, { status: 403 });
    }

    const stripe = new Stripe(stripeSecret);
    const origin = request.headers.get('origin') || request.url.split('/api')[0] || 'http://localhost:3000';
    const success = successUrl || `${origin}?vaultplus=1`;
    const cancel = cancelUrl || origin;

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const { data: subRows } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', resolvedUserId)
      .order('updated_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false, nullsFirst: false })
      .limit(1);

    let customerId = subRows?.[0]?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        metadata: { supabase_user_id: resolvedUserId },
        email: (user as any).email || undefined,
      });
      customerId = customer.id;
      await supabase.from('subscriptions').upsert(
        { user_id: resolvedUserId, stripe_customer_id: customerId, status: 'inactive' },
        { onConflict: 'user_id' }
      );
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: resolvedUserId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: success,
      cancel_url: cancel,
      subscription_data: { metadata: { supabase_user_id: resolvedUserId } },
      metadata: { supabase_user_id: resolvedUserId },
    });

    if (!session.url) {
      return NextResponse.json({ error: 'Could not create checkout session' }, { status: 500 });
    }
    return NextResponse.json({ url: session.url });
  } catch (e: any) {
    console.error('Stripe checkout error:', e);
    return NextResponse.json({ error: e?.message || 'Checkout failed' }, { status: 500 });
  }
}
