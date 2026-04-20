/**
 * Single cache-bust version for favicon / PWA `icon.png` and the small header raster.
 * Bump when replacing assets so browsers pick up new files in one shot.
 */
export const APP_ICON_CACHE_VERSION = "9";

export function appIconPwaPath(): string {
  return `/icon.png?v=${APP_ICON_CACHE_VERSION}`;
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
