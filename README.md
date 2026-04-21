Cloud-based inventory and pricing tool for professional jewelers. Real-time metal prices + database persistence.

## Deploying the vault subdomain (BOMA)

To put the app on **`vault.bouldermetalsmiths.com`** (DNS, Vercel, env vars, Supabase, Stripe, etc.), follow [docs/deployment-vault-domain.md](docs/deployment-vault-domain.md).

That doc also covers **redirecting** the legacy host `vault.bearsilverandstone.com` → canonical vault URL (see **§0** and `next.config.mjs`).
