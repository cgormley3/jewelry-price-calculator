# Shopify Compliance Webhooks – Partner Dashboard Setup

Your app endpoint is ready at `/api/shopify/webhooks` with HMAC verification. You need to register it in Shopify.

---

## Option B: Partner Dashboard (step-by-step)

### 1. Open your app

1. Go to **[partners.shopify.com](https://partners.shopify.com)**
2. Sign in
3. Click **Apps** in the left sidebar
4. Click **The Vault**

### 2. Go to Configuration / Versions

5. Click **Configuration** (or **App setup** → **Configuration**)
6. Or open **Versions** and select your active version (or create a new one)

### 3. Find Event subscriptions / Webhooks

7. In the app configuration, look for one of:
   - **Event subscriptions**
   - **Webhooks**
   - **Subscriptions**

   (Place varies by Shopify UI version. It may be under an "Event subscriptions" tab or an expandable section.)

### 4. Add the compliance webhook

8. Click **Add subscription** or **Add webhook** (or equivalent)
9. Set:
   - **Delivery method:** HTTPS
   - **Endpoint URL:**
     ```
     https://vault.bearsilverandstone.com/api/shopify/webhooks
     ```
   - **Topics** or **Compliance topics:** select or add:
     - `customers/data_request`
     - `customers/redact`
     - `shop/redact`

   If there is a single "Compliance topics" field, add all three.  
   If you must add them separately, create three subscriptions with the same URL.

### 5. Save and release

10. Click **Save**
11. If you edited a version, click **Release** (or **Create version** → **Release**) so the changes go live

---

## If you don’t see Event subscriptions / Webhooks

Shopify may expect configuration via the app’s config file (`shopify.app.toml`) instead of the dashboard.

### Use Shopify CLI

From the project root:

```bash
npx shopify app config link
```

Choose your organization and **The Vault** when asked.

Then:

```bash
npx shopify app deploy
```

This deploys the config in `shopify.app.toml` (including the compliance webhook) to your app.

---

## Verify the endpoint

Your endpoint at `/api/shopify/webhooks`:

- Accepts `POST` requests
- Verifies the `X-Shopify-Hmac-SHA256` header
- Returns `401` if HMAC is invalid
- Handles `customers/data_request`, `customers/redact`, `shop/redact`
- Responds with `200` quickly (within 5 seconds)

---

## Testing

After registration:

1. **Partner Dashboard** → **The Vault** → **Webhooks** or **Insights** → **Delivery logs**
2. Use **Send test** or **Trigger webhook** if available
3. Or install the app in a development store and trigger a real event (e.g. uninstall for `shop/redact`)

---

## Summary

| Item | Value |
|------|-------|
| Endpoint URL | `https://vault.bearsilverandstone.com/api/shopify/webhooks` |
| Method | POST |
| Compliance topics | `customers/data_request`, `customers/redact`, `shop/redact` |
| HMAC header | `X-Shopify-Hmac-SHA256` |
| Response | 200 OK (must respond within 5 seconds) |
