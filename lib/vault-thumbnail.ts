/**
 * iOS “Add to Home Screen” / WebKit often invalidates decoded `<img>` bitmaps after backgrounding
 * while leaving the same URL cached as failed. Append a query so the browser requests again.
 */
export function vaultThumbnailSrc(url: string, visibilityEpoch: number, errorRetry: number): string {
  const u = url.trim();
  if (!u.startsWith("http")) return u;
  const parts: string[] = [];
  if (visibilityEpoch > 0) parts.push(`vv=${visibilityEpoch}`);
  if (errorRetry > 0) parts.push(`vr=${errorRetry}`);
  if (parts.length === 0) return u;
  const sep = u.includes("?") ? "&" : "?";
  return `${u}${sep}${parts.join("&")}`;
}
