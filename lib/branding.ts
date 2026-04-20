/**
 * BOMA deployment branding. Override URLs via env when the production domain is known.
 */

export const ORG_NAME = 'Boulder Metalsmithing Association';
export const ORG_SHORT_NAME = 'BOMA';

/** Primary org link in header/footer; leave unset until BOMA’s public site URL is final. */
export function orgSiteUrl(): string {
  return process.env.NEXT_PUBLIC_ORG_SITE_URL?.trim() ?? '';
}

export const CREATOR_ATTRIBUTION_LABEL = 'Created by Claire Gormley / Bear Silver and Stone';
export const CREATOR_SITE_URL = 'https://bearsilverandstone.com';

export function privacyPolicyUrl(): string {
  return (
    process.env.NEXT_PUBLIC_PRIVACY_POLICY_URL?.trim() ??
    'https://bearsilverandstone.com/policies/privacy-policy'
  );
}

/** Wordmark for app header/footer (see `public/boma-logo-header.png`). */
export const BOMA_HEADER_LOGO_PATH = '/boma-logo-header.png';

/** Email auth and password-recovery redirects: env first, then current origin (client). */
export function authRedirectOrigin(): string {
  const env = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (env) return env;
  if (typeof window !== 'undefined') return window.location.origin;
  return '';
}
