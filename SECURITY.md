# Security & production checklist

## Environment variables (Vercel / hosting)

| Variable | Notes |
|----------|--------|
| `SUPABASE_SERVICE_ROLE_KEY` | **Server only.** Never expose to the browser or client bundles. |
| `STRIPE_SECRET_KEY` | Server only. Use **live** keys only in production. |
| `STRIPE_WEBHOOK_SECRET` | Verify webhook signatures (already implemented). |
| `ADMIN_DIAGNOSTICS_SECRET` | Optional. If set in **production**, required for `/api/db-health` (see below). |
| `NEXT_PUBLIC_*` | Public by design — only non-secret values. |

## Admin diagnostics (`/api/db-health`)

This route reports database connectivity and is meant for **operators**, not end users.

- **Production:** Set `ADMIN_DIAGNOSTICS_SECRET` to a long random string in Vercel. Call the route with header:
  - `x-admin-diagnostics-secret: <same value>`
- **Production without** `ADMIN_DIAGNOSTICS_SECRET`: the route returns **404** (disabled).
- **Local development:** Works without the header when `ADMIN_DIAGNOSTICS_SECRET` is unset.

Example (curl):

```bash
curl -sS "https://your-domain.com/api/db-health" \
  -H "x-admin-diagnostics-secret: YOUR_SECRET"
```

## Vault diagnostic (`/api/vault-diagnostic`)

Authenticated users can run this to debug **their own** vault/paywall. It does **not** enumerate other accounts or return other users’ IDs.

## Profile API

Use **POST** `/api/profile` with JSON `{ "accessToken": "..." }`. Do not pass tokens in query strings (they can appear in logs and Referer headers).

## Supabase

- **RLS:** Keep row-level security on `inventory` and other user tables (`auth.uid() = user_id`).
- **Storage:** Restrict `product-images` so users can only read/write objects under their own prefix (e.g. `{user_id}/`).
- Rotate keys if they were ever committed or leaked.

## Stripe

- Webhook endpoint must use the **signing secret** from the Dashboard.
- Use Payment Link / Checkout success URLs on **HTTPS** only.

## Build (Next.js 16 + jsPDF)

Production builds use **`next build --webpack`** (see `package.json`). Turbopack’s default resolution can pick jsPDF’s Node entry and fail on `fflate`/workers; webpack uses the browser bundle as expected.

## Ongoing

- Run `npm audit` before releases.
- Review new API routes for authorization (service role bypasses RLS — always filter by `user_id`).

## Fix applied: inventory updates

`POST /api/save-item` updates now require `.eq('user_id', user.id)` so one user cannot update another’s item by ID when using the service role.
