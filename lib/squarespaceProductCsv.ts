import { rowToCsvLine } from '@/lib/csvEscape';
import {
  buildBodyHtml,
  vaultExportItemTitle,
  vaultSkuFromItemId,
} from '@/lib/shopifyProductExport';
import type { SiteProductCsvInventoryItem } from '@/lib/shopifyProductCsv';
import {
  formatWholesalePctOfRetailExport,
  type PriceRoundingOption,
} from '@/lib/priceRounding';

export const SQUARESPACE_PRODUCT_CSV_HEADERS = [
  'Product ID [Non-Editable]',
  'Variant ID [Non-Editable]',
  'Product Type [Non-Editable]',
  'Product Page',
  'Product URL',
  'Title',
  'Description',
  'SKU',
  'Option Name 1',
  'Option Value 1',
  'Option Name 2',
  'Option Value 2',
  'Wholesale % of retail',
] as const;

export type SquarespaceProductCsvOptions = {
  includeDescription: boolean;
  includeWholesalePctOfRetail: boolean;
  priceSource: 'saved' | 'live';
  priceRounding: PriceRoundingOption;
  itemLivePrices?: Record<string, { retail: number; wholesale: number }>;
};

function slugifyBase(title: string, idFallback: string): string {
  const raw = (title || '').trim().toLowerCase();
  let s = raw.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!s) {
    s =
      (idFallback || 'item')
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 24) || 'item';
  }
  return s;
}

function allocateHandle(seen: Set<string>, base: string): string {
  let candidate = base;
  let n = 2;
  while (seen.has(candidate)) {
    candidate = `${base}-${n++}`;
  }
  seen.add(candidate);
  return candidate;
}

export function buildSquarespaceProductCsv(
  items: SiteProductCsvInventoryItem[],
  opts: SquarespaceProductCsvOptions
): string {
  const seen = new Set<string>();
  const lines: string[] = [
    rowToCsvLine([...SQUARESPACE_PRODUCT_CSV_HEADERS]),
  ];

  for (const item of items) {
    const title = vaultExportItemTitle(item.name);
    const handle = allocateHandle(seen, slugifyBase(item.name || '', item.id));
    const desc = opts.includeDescription
      ? buildBodyHtml(item)
      : '<p>Handcrafted jewelry</p>';
    const sku = vaultSkuFromItemId(item.id);

    const prices = opts.itemLivePrices?.[item.id];
    const retailNum =
      opts.priceSource === 'live' && prices
        ? Number(prices.retail ?? 0)
        : Number(item.retail ?? 0);
    const wholesaleNum =
      opts.priceSource === 'live' && prices
        ? Number(prices.wholesale ?? 0)
        : Number(item.wholesale ?? 0);

    const pctCol =
      opts.includeWholesalePctOfRetail
        ? formatWholesalePctOfRetailExport(
            retailNum,
            wholesaleNum,
            opts.priceRounding
          )
        : '';

    lines.push(
      rowToCsvLine([
        '',
        '',
        'PHYSICAL',
        '',
        handle,
        title,
        desc,
        sku,
        '',
        '',
        '',
        '',
        pctCol,
      ])
    );
  }

  return lines.join('\n');
}
