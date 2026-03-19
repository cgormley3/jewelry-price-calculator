# Vault+ Stripe Paywall Setup

Follow these steps to enable the Vault+ subscription paywall.

## 0. Enable Identity Linking (Prevent User ID Mismatch)

When users sign in with Google (or email) after using the app as a guest, we link their identity to keep the same account and preserve their vault items. **Enable manual linking** so this works:

1. Supabase Dashboard → **Authentication** → **Providers**
2. Enable **Manual linking** (or set `GOTRUE_SECURITY_MANUAL_LINKING_ENABLED: true` when self-hosting)

Without this, signing in with Google or email can create a *different* user, so items and subscriptions end up under mismatched accounts.

## 1. Run the Database Migrations

In Supabase SQL Editor, run the migrations in order:

1. **Subscriptions:** Run the contents of `migration_add_subscriptions.sql` to create the subscriptions table.
2. **Profiles (optional):** Run the contents of `supabase/migrations/migration_add_profiles.sql` to enable profile branding (display name, company name, logo) in PDF reports and CSV exports.
3. **Profile logo column (if logo doesn't save):** Run `supabase/migrations/migration_add_profile_logo_url.sql` to ensure the `logo_url` column exists.
4. **Storage bucket for logos:** In Supabase Dashboard → Storage, create a bucket named `product-images` and make it **public** (or add a policy allowing authenticated users to upload/read). Profile logos are stored at `{user_id}/logo.png`.

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
ON CONFLICT (user_id) DO UPDATE SET status = 'active', current_period_end = EXCLUDED.current_period_end;
```

Replace `your-user-uuid-here` with the Supabase auth user ID. **Always use `ON CONFLICT`** to avoid duplicate rows.

## 8. Fixing Duplicate Subscriptions

If you see multiple subscription rows for the same user, run this in Supabase SQL Editor:

```sql
-- Remove duplicates: keep one per user_id (prefer Stripe-linked row, then most recent)
DELETE FROM subscriptions
WHERE id IN (
  SELECT id FROM (
    SELECT id,
      ROW_NUMBER() OVER (
        PARTITION BY user_id
        ORDER BY (CASE WHEN stripe_subscription_id IS NOT NULL THEN 0 ELSE 1 END), updated_at DESC NULLS LAST
      ) AS rn
    FROM subscriptions
  ) t
  WHERE t.rn > 1
);

-- Ensure UNIQUE constraint exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'subscriptions_user_id_key') THEN
    ALTER TABLE subscriptions ADD CONSTRAINT subscriptions_user_id_key UNIQUE (user_id);
  END IF;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
```

**Prevention:** The app uses `upsert` with `onConflict: 'user_id'` for all subscription writes. Manual inserts must use `ON CONFLICT (user_id) DO UPDATE`.

## 9. Items Not Showing After Upgrade?

If you have a subscription in the DB but still don't see items, check for **user_id mismatch** (e.g. items were added as anonymous user, then you signed up with email—different user IDs):

```sql
-- See which user_ids have inventory vs subscriptions
SELECT 'inventory' AS source, user_id FROM inventory
UNION ALL
SELECT 'subscriptions' AS source, user_id FROM subscriptions;
```

If inventory and subscriptions use different user_ids, either:
- Update the subscription row to the user_id that owns the inventory, or
- Migrate inventory to your current user_id:
```sql
UPDATE inventory SET user_id = 'your-current-user-uuid' WHERE user_id = 'old-anonymous-user-uuid';
```
