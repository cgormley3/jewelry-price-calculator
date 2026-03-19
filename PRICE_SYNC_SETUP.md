# Price Sync Setup (BullionByPost → DB)

Metal spot prices are scraped from BullionByPost every minute and stored in Supabase. The `/api/gold-price` endpoint reads from the database only, avoiding repeated requests to BullionByPost.

## 1. Run the Migration

In Supabase SQL Editor, run `supabase/migrations/migration_add_metal_prices_pct.sql` to add the `gold_pct`, `silver_pct`, `platinum_pct`, and `palladium_pct` columns to `metal_prices`.

## 2. Vercel Cron (Pro/Enterprise)

The `vercel.json` cron runs every minute (`* * * * *`). **Per-minute scheduling requires a Vercel Pro or Enterprise plan.** On Hobby, crons are limited to once per day.

## 3. Alternative: External Cron (Hobby Plan)

If you're on Vercel Hobby, use an external service (e.g. cron-job.org, UptimeRobot) to ping the update endpoint every minute:

```
GET https://your-app.vercel.app/api/cron/update-prices
Authorization: Bearer YOUR_CRON_SECRET
```

Set `CRON_SECRET` in Vercel Environment Variables and use the same value in the external cron's Authorization header.

## 4. Initial Seed

On first deploy, the database may be empty until the first cron run. To seed immediately, call the cron endpoint once (with `CRON_SECRET` if configured):

```bash
curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-app.vercel.app/api/cron/update-prices
```

Or wait up to one minute for the first scheduled run.
