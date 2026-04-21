/**
 * Cache-bust version for the header raster (`icon-header-192.png`). Main favicon / Apple touch icons use
 * `app/icon.png` + `app/apple-icon.png` (served as `/icon.png`, `/apple-icon.png`) so Next can refresh tags on deploy.
 */
export const APP_ICON_CACHE_VERSION = "10";

/** Same URL the root metadata/icon routes use (`app/icon.png`). */
export function appIconPwaPath(): string {
  return "/icon.png";
}

/**
 * ~192px raster for in-app header/footer.
 * Version is baked into [`app/layout.tsx`] / `appIconPwaPath()`; use this path for `next/image`
 * (Next.js does not allow arbitrary query strings on local Image `src` without `localPatterns`).
 */
export function appIconHeaderPathForImage(): string {
  return "/icon-header-192.png";
}

/** Absolute public URL including cache-bust query (PDFs, print, share previews). */
export function appIconHeaderPath(): string {
  return `/icon-header-192.png?v=${APP_ICON_CACHE_VERSION}`;
}
