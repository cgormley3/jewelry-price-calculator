/** Matches vault “Price ends in” preference (localStorage `price_rounding`). */
export type PriceRoundingOption = 'none' | 1 | 5 | 10 | 25;

export function roundPriceForDisplay(
  num: number,
  priceRounding: PriceRoundingOption
): number {
  if (priceRounding === 'none' || num === 0) return num;
  return Math.ceil(num / priceRounding) * priceRounding;
}

/** Two decimal places for CSV / Shopify / PDF-style exports. */
export function formatPriceForExport(
  num: number,
  priceRounding: PriceRoundingOption
): string {
  return roundPriceForDisplay(num, priceRounding).toFixed(2);
}

export function parsePriceRoundingFromExportOptions(
  raw: unknown
): PriceRoundingOption {
  if (raw === 'none') return 'none';
  const n = Number(raw);
  if (n === 1 || n === 5 || n === 10 || n === 25) return n;
  return 1;
}

/**
 * Wholesale as % of retail for site CSVs: uses the **same rounded USD** as Price/Compare-at
 * (`roundPriceForDisplay` for both), then percent = (wholesale¢ / retail¢) × 100 so the ratio
 * matches exported dollars without an extra layer of %-rounding.
 */
export function formatWholesalePctOfRetailExport(
  retailNum: number,
  wholesaleNum: number,
  priceRounding: PriceRoundingOption
): string {
  const r = roundPriceForDisplay(Number(retailNum), priceRounding);
  const w = roundPriceForDisplay(Number(wholesaleNum), priceRounding);
  if (r <= 0 || w <= 0) return '';
  const rc = Math.round(r * 100);
  const wc = Math.round(w * 100);
  if (rc <= 0) return '';
  const pct = (wc * 100) / rc;
  if (!Number.isFinite(pct)) return '';
  let s = pct.toFixed(10);
  s = s.replace(/0+$/, '');
  if (s.endsWith('.')) s = s.slice(0, -1);
  return s;
}
