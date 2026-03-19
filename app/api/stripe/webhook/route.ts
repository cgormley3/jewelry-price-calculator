import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';
import { getSubscriptionCurrentPeriodEndUnix } from '@/lib/stripe-subscription-period-end';

export const dynamic = 'force-dynamic';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

async function resolveSupabaseUserIdFromStripe(
  stripe: Stripe,
  session: Stripe.Checkout.Session
): Promise<string | null> {
  let userId = (session.metadata?.supabase_user_id || session.client_reference_id || '') as string;
  if (userId?.trim()) return userId.trim();

  const cid =
    typeof session.customer === 'string'
      ? session.customer
      : session.customer && typeof session.customer === 'object' && 'id' in session.customer
        ? (session.customer as { id: string }).id
        : null;
  if (!cid) return null;

  try {
    const cust = await stripe.customers.retrieve(cid);
    if (typeof cust === 'string' || cust.deleted) return null;
    const fromMeta = cust.metadata?.supabase_user_id?.trim();
    return fromMeta || null;
  } catch {
    return null;
  }
}

function subscriptionRowFromStripeSub(
  userId: string,
  sub: Stripe.Subscription,
  stripeCustomerId: string | null
): Record<string, unknown> {
  const endUnix = getSubscriptionCurrentPeriodEndUnix(sub);
  const periodEnd = endUnix
    ? new Date(endUnix * 1000).toISOString()
    : new Date().toISOString();
  const st = sub.status;
  const status =
    st === 'active' || st === 'trialing' ? st : st === 'canceled' ? 'canceled' : 'inactive';
  const row: Record<string, unknown> = {
    user_id: userId,
    stripe_subscription_id: sub.id,
    status,
    current_period_end: periodEnd,
    updated_at: new Date().toISOString(),
  };
  if (stripeCustomerId) row.stripe_customer_id = stripeCustomerId;
  return row;
}

export async function POST(request: Request) {
  if (!webhookSecret) {
    console.error('STRIPE_WEBHOOK_SECRET not configured');
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 500 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || '';
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || '';
  if (!supabaseUrl || !supabaseServiceKey) {
    return NextResponse.json({ error: 'Supabase not configured' }, { status: 500 });
  }

  try {
    const body = await request.text();
    const sig = request.headers.get('stripe-signature');
    if (!sig) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
    }

    let event: Stripe.Event;
    try {
      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!.trim());
      event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
    } catch (err: any) {
      console.error('Webhook signature verification failed:', err?.message);
      return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!.trim());

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const mode = session.mode;
      if (mode !== 'subscription') {
        return NextResponse.json({ received: true });
      }

      const subRef = session.subscription;
      const subId =
        typeof subRef === 'string' ? subRef : subRef && typeof subRef === 'object' && 'id' in subRef ? (subRef as { id: string }).id : null;
      if (!subId) {
        console.warn('checkout.session.completed subscription mode but no subscription id');
        return NextResponse.json({ received: true });
      }

      const userId = await resolveSupabaseUserIdFromStripe(stripe, session);
      if (!userId) {
        console.warn('checkout.session.completed missing supabase user id (metadata, client_reference_id, customer.metadata)');
        return NextResponse.json({ received: true });
      }

      const sub = await stripe.subscriptions.retrieve(subId);
      const c = session.customer;
      const stripeCustomerId =
        typeof c === 'string' ? c : c && typeof c === 'object' && 'id' in c ? String((c as { id: string }).id) : null;

      const row = subscriptionRowFromStripeSub(userId, sub, stripeCustomerId);
      await supabase.from('subscriptions').upsert(row, { onConflict: 'user_id' });
    } else if (event.type === 'customer.subscription.created') {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer?.id;
      let userId = (sub.metadata?.supabase_user_id || '').trim();
      if (!userId && customerId) {
        try {
          const cust = await stripe.customers.retrieve(customerId);
          if (typeof cust !== 'string' && !cust.deleted) {
            userId = (cust.metadata?.supabase_user_id || '').trim();
          }
        } catch { /* ignore */ }
      }
      if (!userId || !sub.id) return NextResponse.json({ received: true });

      const row = subscriptionRowFromStripeSub(userId, sub, customerId || null);
      await supabase.from('subscriptions').upsert(row, { onConflict: 'user_id' });
    } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as Stripe.Subscription;
      const { data: row } = await supabase.from('subscriptions').select('user_id').eq('stripe_subscription_id', sub.id).single();
      if (!row?.user_id) return NextResponse.json({ received: true });

      const st = sub.status;
      const status =
        st === 'active' || st === 'trialing' ? st : st === 'canceled' ? 'canceled' : 'inactive';
      const peUnix = getSubscriptionCurrentPeriodEndUnix(sub);
      const periodEnd = peUnix ? new Date(peUnix * 1000).toISOString() : null;

      await supabase
        .from('subscriptions')
        .update({
          status,
          current_period_end: periodEnd,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', row.user_id);
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    console.error('Webhook error:', e);
    return NextResponse.json({ error: e?.message || 'Webhook failed' }, { status: 500 });
  }
}
