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
4. **Vault stock quantity:** Run `supabase/migrations/migration_add_inventory_stock_qty.sql` to add `stock_qty` (default `1`) on `inventory` so users can track multiples of the same piece in the vault.
5. **Storage bucket for logos:** In Supabase Dashboard → Storage, create a bucket named `product-images` and make it **public** (or add a policy allowing authenticated users to upload/read). Profile logos are stored at `{user_id}/logo.png`.

## 2. Create a Stripe Account and Product

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com) and create or sign in to your account.
2. Create a **Product** named "Vault+".
3. Add a **Price**:
   - Type: Recurring
   - Billing period: Yearly
   - Set your price (e.g. **$15/year** — must match in-app copy in `lib/vault-plus-copy.ts`)
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

After you change the Vault+ dollar amount in Stripe, the **Price id** changes. Update this env to the **new** `price_…` from Stripe → Products → Vault+ → Pricing (or **Sync from Stripe** will not find the subscription). You can list **multiple** ids separated by commas or spaces during a migration, e.g. `price_old,price_new`.

**Production:** Set `ADMIN_DIAGNOSTICS_SECRET` (long random string) if you need to call `/api/db-health` for ops; see [SECURITY.md](./SECURITY.md).

### Payment Link (optional, recommended for promo codes)

If you use a **Stripe Payment Link** instead of embedded Checkout from the API:

1. Add your link URL (same in `.env.local` and Vercel):

   ```
   NEXT_PUBLIC_STRIPE_VAULT_PLUS_PAYMENT_LINK=https://buy.stripe.com/xxxxx
   ```

2. When this variable is set, **Get Vault+** sends users to that link and appends:
   - `client_reference_id` = Supabase user id (required so the webhook can attach the subscription to the right user)
   - `prefilled_email` = signed-in user’s email when available

3. In the Payment Link settings, set the **after-payment redirect** to your site, e.g. `https://yourdomain.com?vaultplus=1` (matches the old checkout success URL).

4. Set **`STRIPE_VAULT_PLUS_PRICE_ID`** to the **same** Price id attached to that Payment Link (Stripe → Products → your Vault+ price). **Sync from Stripe** matches subscriptions against this id. If you change the product price in Stripe, update this env (or list `old_price,new_price`). If `NEXT_PUBLIC_STRIPE_VAULT_PLUS_PAYMENT_LINK` is unset, the app falls back to API checkout and still uses this env for the line item.

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
   - `customer.subscription.created` (helps when checkout metadata is missing)
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
4. Copy the **Signing secret** and add to your production env as `STRIPE_WEBHOOK_SECRET`.

### If a row exists in `subscriptions` but the app still shows “Upgrade”

Check in Supabase **Table Editor → subscriptions**:

1. **`user_id`** must equal the user’s id from **Authentication → Users** for the account they’re signed into (not another email/Google identity). Compare ids in the Supabase dashboard, or set `VAULT_DIAGNOSTICS_UI_ENABLED` to `true` in `app/page.tsx` to show the in-app Diagnose link again.
2. **`status`** must be `active`, `trialing`, or `past_due` (Stripe retry window). Values like `inactive`, `canceled`, or `unpaid` block access.
3. **`current_period_end`** can be **null** or briefly **in the past** in the database while **`status`** is still `active` / `trialing` / `past_due` — the app trusts **`status`** so webhook lag doesn’t lock people out. Use **Sync from Stripe** or webhooks to keep dates accurate for your own reporting.
4. **Duplicate rows** for the same user are avoided by a unique `user_id`; if you ever had duplicates, the app now uses the row with the latest `updated_at` (null `updated_at` sorts last so a freshly synced row wins).
5. If access still flips wrong after sync, in SQL run: `UPDATE subscriptions SET updated_at = NOW() WHERE updated_at IS NULL;`

### If the user paid in Stripe but the app still shows “Upgrade”

Usually the **`subscriptions`** row was never created (webhook not delivered, wrong URL/secret, or checkout without `client_reference_id` / user metadata).

1. **In the app:** Open Vault, tap **Sync from Stripe**. Sync looks up Stripe by your **login email**, and also uses **`stripe_customer_id` / `stripe_subscription_id`** already saved on your `subscriptions` row (e.g. from a webhook), so it can still work if checkout used a **different** email than your app login. If Stripe has **no** customer for your login and Supabase has **no** customer id yet, use the **same email** as on the Stripe receipt or update the customer’s email in Stripe Dashboard → Customers.
2. **Env:** Set **`STRIPE_VAULT_PLUS_PRICE_ID`** in production to every Vault+ price id you use (comma-separated) so sync can pick the right subscription when a customer has multiple products.
3. **Webhook:** Confirm the endpoint is `https://yourdomain.com/api/stripe/webhook` and **`STRIPE_WEBHOOK_SECRET`** matches the signing secret for that endpoint.

## 6. Test the Flow

1. Run the app locally: `npm run dev`
2. Sign in.
3. Try to save a vault item, log time, or use custom formulas. You should see the "Upgrade to Vault+" modal.
4. Click "Get Vault+". You should be redirected to Stripe Checkout.
5. Use test card `4242 4242 4242 4242` for payments.
6. After completing checkout, you should be redirected back with `?vaultplus=1`. The app runs **sync from Stripe** (with retries) then refetches; you should be able to save once the subscription row exists.

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
