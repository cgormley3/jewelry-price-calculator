# Vault+ Stripe Paywall Setup

Follow these steps to enable the Vault+ subscription paywall.

## 1. Run the Database Migration

In Supabase SQL Editor, run the contents of `migration_add_subscriptions.sql`:

```sql
-- Creates subscriptions table for tracking Stripe subscriptions
```

## 2. Create a Stripe Account and Product

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com) and create or sign in to your account.
2. Create a **Product** named "Vault+".
3. Add a **Price**:
   - Type: Recurring
   - Billing period: Yearly
   - Set your price (e.g. $X/year)
4. Copy the **Price ID** (starts with `price_`).

## 3. Get Your Stripe Keys

1. In Stripe Dashboard, go to **Developers → API keys**.
2. Copy:
   - **Publishable key** (pk_test_... or pk_live_...)
   - **Secret key** (sk_test_... or sk_live_...)

## 4. Add Environment Variables

Add to `.env.local` (and your production env, e.g. Vercel):

```
STRIPE_SECRET_KEY=sk_test_xxxxx
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
STRIPE_VAULT_PLUS_PRICE_ID=price_xxxxx
```

## 5. Set Up the Stripe Webhook

### For local development

1. Install Stripe CLI: `brew install stripe/stripe-cli/stripe`
2. Login: `stripe login`
3. Forward webhooks: `stripe listen --forward-to localhost:3000/api/stripe/webhook`
4. Copy the **webhook signing secret** (whsec_...) and add to `.env.local` as `STRIPE_WEBHOOK_SECRET`

### For production

1. In Stripe Dashboard: **Developers → Webhooks → Add endpoint**.
2. Endpoint URL: `https://yourdomain.com/api/stripe/webhook`
3. Events to listen for:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy the **Signing secret** and add to your production env as `STRIPE_WEBHOOK_SECRET`.

## 6. Test the Flow

1. Run the app locally: `npm run dev`
2. Sign in.
3. Try to save a vault item, log time, or use custom formulas. You should see the "Upgrade to Vault+" modal.
4. Click "Get Vault+". You should be redirected to Stripe Checkout.
5. Use test card `4242 4242 4242 4242` for payments.
6. After completing checkout, you should be redirected back with `?vaultplus=1`. The app will refetch and you should now be able to save.

## 7. Bypassing the Paywall (Optional)

For development or to give specific users access without Stripe, you can manually insert a row in the `subscriptions` table:

```sql
INSERT INTO subscriptions (user_id, status, current_period_end)
VALUES ('your-user-uuid-here', 'active', '2099-12-31 23:59:59+00')
ON CONFLICT (user_id) DO UPDATE SET status = 'active', current_period_end = '2099-12-31 23:59:59+00';
```

Replace `your-user-uuid-here` with the Supabase auth user ID.
