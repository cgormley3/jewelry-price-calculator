# Deploying at `vault.bouldermetalsmiths.com`

This checklist starts at **DNS + hosting** (step 1). Supabase, Google OAuth, Turnstile, and Stripe are configured in **their dashboards**, not only in this repo.

## 1. DNS (your DNS provider)

1. Log in where **bouldermetalsmiths.com** DNS is managed (registrar, Cloudflare, etc.).
2. Add a record for the **vault** hostname:
   - **Type:** `CNAME` (common) **or** `A` if your host requires it  
   - **Name / host:** `vault`  
   - **Target / value:** Whatever your host specifies for custom domains.  
     - **Vercel:** typically `cname.vercel-dns.com.` (see Vercel → Project → Settings → Domains for the exact CNAME target).  
     - **Netlify:** they show a dedicated load balancer hostname.  
3. **TTL:** default (often 300s–1h) is fine.  
4. Wait for propagation (minutes to 48h). Verify with `dig vault.bouldermetalsmiths.com` or an online DNS checker.

**Note:** The **apex** `bouldermetalsmiths.com` can stay where it is (e.g. Square Online). Only the **subdomain** `vault` points to your app host.

## 2. Hosting (Vercel example)

1. Deploy this Next.js app to **Vercel** (Git connect or `vercel` CLI) if it is not already deployed.
2. Open **Project → Settings → Domains**.
3. Add domain: **`vault.bouldermetalsmiths.com`**.
4. Vercel will show **DNS instructions** if the CNAME does not match yet. After DNS propagates, **SSL** is issued automatically (Let’s Encrypt).

## 3. Production environment variables (Vercel → Settings → Environment Variables)

Set at least:

| Variable | Example value |
|----------|-----------------|
| `NEXT_PUBLIC_APP_URL` | `https://vault.bouldermetalsmiths.com` |

Use this **Production** environment; redeploy after saving so the app picks it up.

Optional:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_PRIVACY_POLICY_URL` | Footer privacy link if not using default |
| `NEXT_PUBLIC_ORG_SITE_URL` | Override main org marketing site URL |

See [`.env.example`](../.env.example) for other keys (Supabase, Stripe, etc.).

## 4. Supabase Auth

**Dashboard → Authentication → URL configuration**

- Add redirect URLs including:  
  `https://vault.bouldermetalsmiths.com/**`  
- Set **Site URL** to your canonical app URL (often `https://vault.bouldermetalsmiths.com`) so email confirmation and password reset land on the vault host.

## 5. Google Sign-In

**Google Cloud Console → APIs & Credentials → OAuth 2.0 Client ID**

- **Authorized JavaScript origins:** add `https://vault.bouldermetalsmiths.com`
- **Authorized redirect URIs:** must include whatever Supabase documents for your Google provider (Supabase callback URLs).

## 6. Cloudflare Turnstile (if `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set)

In the Turnstile site settings, add **`vault.bouldermetalsmiths.com`** as an allowed domain.

## 7. Stripe (Vault+)

- **Payment Link / Checkout success URL:** e.g. `https://vault.bouldermetalsmiths.com?vaultplus=1` (matches app query handling).
- **Stripe Dashboard → Webhooks:** endpoint should be  
  `https://vault.bouldermetalsmiths.com/api/stripe/webhook`  
  when production uses this domain.
- **Customer Portal** return URL: point to the vault domain if you use the portal.

## 8. Shopify app (only if you use Shopify integration)

After deploying with the new domain:

- Partner Dashboard → your app → App setup: allow  
  `https://vault.bouldermetalsmiths.com/api/shopify/callback`  
- This repo’s [`shopify.app.toml`](../shopify.app.toml) should list the same URLs; run `shopify app deploy` or update the dashboard to match.
- Webhook URL in Shopify (if configured):  
  `https://vault.bouldermetalsmiths.com/api/shopify/webhooks`

## 9. Smoke tests

- Load `https://vault.bouldermetalsmiths.com`
- Email/password sign-in and **password reset**
- **Google** sign-in
- **Vault+** checkout return with `?vaultplus=1`
- Optional: **Shopify** connect flow

---

You must complete **steps 1–2** (DNS + Vercel domain + `NEXT_PUBLIC_APP_URL`) before the rest; dashboard steps (4–8) align OAuth and payments with the new hostname.
