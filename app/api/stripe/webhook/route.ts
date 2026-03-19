import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import Stripe from 'stripe';

export const dynamic = 'force-dynamic';

const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();

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

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = (session.metadata?.supabase_user_id || session.client_reference_id) as string;
      const subId = session.subscription as string;
      const c = session.customer;
      const stripeCustomerId = typeof c === 'string' ? c : c && typeof c === 'object' && 'id' in c ? String((c as { id: string }).id) : null;
      if (!userId || !subId) {
        console.warn('checkout.session.completed missing userId or subscriptionId');
        return NextResponse.json({ received: true });
      }

      const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!.trim());
      const sub = await stripe.subscriptions.retrieve(subId);
      const periodEnd = new Date(((sub as any).current_period_end || 0) * 1000).toISOString();

      const row: Record<string, unknown> = {
        user_id: userId,
        stripe_subscription_id: subId,
        status: 'active',
        current_period_end: periodEnd,
        updated_at: new Date().toISOString(),
      };
      if (stripeCustomerId) {
        row.stripe_customer_id = stripeCustomerId;
      }

      await supabase.from('subscriptions').upsert(row, { onConflict: 'user_id' });
    } else if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
      const sub = event.data.object as any;
      const { data: row } = await supabase.from('subscriptions').select('user_id').eq('stripe_subscription_id', sub.id).single();
      if (!row?.user_id) return NextResponse.json({ received: true });

      const status = sub.status === 'active' ? 'active' : 'canceled';
      const periodEnd = sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null;

      await supabase.from('subscriptions').update({
        status,
        current_period_end: periodEnd,
        updated_at: new Date().toISOString(),
      }).eq('user_id', row.user_id);
    }

    return NextResponse.json({ received: true });
  } catch (e: any) {
    console.error('Webhook error:', e);
    return NextResponse.json({ error: e?.message || 'Webhook failed' }, { status: 500 });
  }
}
