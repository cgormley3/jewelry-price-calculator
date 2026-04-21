/**
 * BOMA deployment branding. Override URLs via env when the production domain is known.
 */

export const ORG_NAME = 'Boulder Metalsmithing Association';
export const ORG_SHORT_NAME = 'BOMA';

/** Public site — [Boulder Metalsmithing Association](https://www.bouldermetalsmiths.com/) */
export const ORG_SITE_URL_DEFAULT = 'https://www.bouldermetalsmiths.com/';

/** Primary org link in header/footer. Override with `NEXT_PUBLIC_ORG_SITE_URL` if needed. */
export function orgSiteUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_ORG_SITE_URL?.trim();
  return fromEnv || ORG_SITE_URL_DEFAULT;
}

export const CREATOR_ATTRIBUTION_LABEL = 'Created by Claire Gormley / Bear Silver and Stone';
export const CREATOR_SITE_URL = 'https://bearsilverandstone.com';

const DEFAULT_PRIVACY_POLICY_URL = 'https://bouldermetalsmiths.com/privacy';

/** Footer link — returns null when hidden via env. Override with `NEXT_PUBLIC_PRIVACY_POLICY_URL`. */
export function privacyPolicyUrl(): string | null {
  const hide = process.env.NEXT_PUBLIC_HIDE_PRIVACY_FOOTER_LINK?.trim().toLowerCase();
  if (hide === '1' || hide === 'true' || hide === 'yes') return null;

  const fromEnv = process.env.NEXT_PUBLIC_PRIVACY_POLICY_URL?.trim();
  if (fromEnv === '') return null;

  return fromEnv || DEFAULT_PRIVACY_POLICY_URL;
}

/**
 * Wordmark for light backgrounds (dark ink on transparent).
 * Source: Boulder Metalsmithing Association stacked logo asset.
 * Bump `v` when replacing the file so browsers skip stale cache.
 */
export const BOMA_HEADER_LOGO_PATH = '/boma-logo-header.png?v=3';

/**
 * Wordmark for dark backgrounds (light ink on transparent), e.g. charcoal bars or dark modes.
 */
export const BOMA_LOGO_ON_DARK_PATH = '/boma-logo-on-dark.png?v=3';

/** Email auth and password-recovery redirects: env first, then current origin (client). */
export function authRedirectOrigin(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env) return env;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}

/** Matches main nav tab ids — embedded in email redirect URLs as `?tab=…` so post-login lands on the same area. */
const AUTH_EMAIL_REDIRECT_TAB_IDS = ['calculator', 'vault', 'compare', 'logic', 'formulas', 'time'] as const;
export type AuthEmailRedirectTabId = (typeof AUTH_EMAIL_REDIRECT_TAB_IDS)[number];

export function parseAuthEmailRedirectTab(tab: string | null | undefined): AuthEmailRedirectTabId | null {
  if (!tab) return null;
  return (AUTH_EMAIL_REDIRECT_TAB_IDS as readonly string[]).includes(tab) ? (tab as AuthEmailRedirectTabId) : null;
}

/**
 * Magic-link / sign-up / password-recovery `redirectTo` URLs. Omits `?tab=` when on Calculator (default).
 * Supabase dashboard → Redirect URLs should allow the production origin; `/**` matchers include query strings.
 */
export function buildAuthEmailRedirectUrl(options?: { origin?: string; tab?: string | null }): string {
  const originRaw =
    options?.origin?.trim() ||
    (typeof window !== 'undefined' ? window.location.origin : '') ||
    authRedirectOrigin().trim();
  const base = originRaw.replace(/\/$/, '');
  if (!base) return '/';
  const t = parseAuthEmailRedirectTab(options?.tab ?? null);
  const qs = t && t !== 'calculator' ? `?tab=${encodeURIComponent(t)}` : '';
  return `${base}/${qs}`;
}
