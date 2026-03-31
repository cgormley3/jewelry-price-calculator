import { rowToCsvLine } from '@/lib/csvEscape';
import {
  buildBodyHtml,
  SHOPIFY_PRODUCT_VENDOR,
  vaultExportItemTitle,
  vaultSkuFromItemId,
} from '@/lib/shopifyProductExport';
import {
  formatPriceForExport,
  formatWholesalePctOfRetailExport,
  type PriceRoundingOption,
} from '@/lib/priceRounding';

/** Shopify Admin template columns plus Bear Vault wholesale % (may be ignored on import). */
const SHOPIFY_HEADER_LINE =
  'Title,URL handle,Description,Vendor,Product category,Type,Tags,Published on online store,Status,SKU,Barcode,Option1 name,Option1 value,Option1 Linked To,Option2 name,Option2 value,Option2 Linked To,Option3 name,Option3 value,Option3 Linked To,Price,Compare-at price,Cost per item,Charge tax,Tax code,Unit price total measure,Unit price total measure unit,Unit price base measure,Unit price base measure unit,Inventory tracker,Inventory quantity,Continue selling when out of stock,Weight value (grams),Weight unit for display,Requires shipping,Fulfillment service,Product image URL,Image position,Image alt text,Variant image URL,Gift card,SEO title,SEO description,Color (product.metafields.shopify.color-pattern),Google Shopping / Google product category,Google Shopping / Gender,Google Shopping / Age group,Google Shopping / Manufacturer part number (MPN),Google Shopping / Ad group name,Google Shopping / Ads labels,Google Shopping / Condition,Google Shopping / Custom product,Google Shopping / Custom label 0,Google Shopping / Custom label 1,Google Shopping / Custom label 2,Google Shopping / Custom label 3,Google Shopping / Custom label 4,Wholesale pct of retail';

export const SHOPIFY_PRODUCT_CSV_HEADERS = SHOPIFY_HEADER_LINE.split(',');

const COL: Record<string, number> = Object.fromEntries(
  SHOPIFY_PRODUCT_CSV_HEADERS.map((h, i) => [h, i])
) as Record<string, number>;

export type SiteProductCsvInventoryItem = {
  id: string;
  name?: string | null;
  tag?: string | null;
  image_url?: string | null;
  retail?: number | null;
  wholesale?: number | null;
  notes?: string | null;
  metals?: unknown[];
  stones?: unknown[];
  stock_qty?: unknown;
};

export type ShopifyProductCsvOptions = {
  includeDescription: boolean;
  includeImage: boolean;
  includeRetail: boolean;
  includeWholesale: boolean;
  /** Extra column: wholesale ÷ retail as %, from exported-rounded dollars (see formatWholesalePctOfRetailExport). */
  includeWholesalePctOfRetail: boolean;
  priceSource: 'saved' | 'live';
  /** Same rule as vault UI / inventory CSV (Profile price ends in). */
  priceRounding: PriceRoundingOption;
  itemLivePrices?: Record<string, { retail: number; wholesale: number }>;
  /** Stock quantity per item (vault). */
  getQuantity: (item: SiteProductCsvInventoryItem) => number;
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

function stripHtmlToPlain(html: string, maxLen: number): string {
  const t = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen - 1)}…`;
}

function itemRow(
  item: SiteProductCsvInventoryItem,
  handle: string,
  opts: ShopifyProductCsvOptions
): string[] {
  const n = SHOPIFY_PRODUCT_CSV_HEADERS.length;
  const row = Array<string>(n).fill('');

  const title = vaultExportItemTitle(item.name);
  const tag = item.tag || 'other';
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

  const descHtml = opts.includeDescription
    ? buildBodyHtml(item)
    : '<p>Handcrafted jewelry</p>';
  const imageUrl = (item.image_url || '').trim();
  const hasImage = opts.includeImage && imageUrl.startsWith('http');
  const qty = Math.max(0, Math.floor(Number(opts.getQuantity(item)) || 0));

  row[COL['Title']] = title;
  row[COL['URL handle']] = handle;
  row[COL['Description']] = descHtml;
  row[COL['Vendor']] = SHOPIFY_PRODUCT_VENDOR;
  row[COL['Type']] = tag;
  row[COL['Tags']] = tag;
  row[COL['Published on online store']] = 'TRUE';
  row[COL['Status']] = 'active';
  row[COL['SKU']] = sku;
  row[COL['Option1 name']] = 'Title';
  row[COL['Option1 value']] = 'Default Title';

  if (opts.includeRetail) {
    row[COL['Price']] = formatPriceForExport(retailNum, opts.priceRounding);
  }
  if (opts.includeWholesale && wholesaleNum > 0) {
    row[COL['Compare-at price']] = formatPriceForExport(
      wholesaleNum,
      opts.priceRounding
    );
  }

  if (opts.includeWholesalePctOfRetail) {
    const pct = formatWholesalePctOfRetailExport(
      retailNum,
      wholesaleNum,
      opts.priceRounding
    );
    if (pct) row[COL['Wholesale pct of retail']] = pct;
  }

  row[COL['Charge tax']] = 'TRUE';
  row[COL['Inventory tracker']] = 'shopify';
  row[COL['Inventory quantity']] = String(qty);
  row[COL['Continue selling when out of stock']] = 'DENY';
  row[COL['Requires shipping']] = 'TRUE';
  row[COL['Fulfillment service']] = 'manual';
  row[COL['Gift card']] = 'FALSE';

  if (hasImage) {
    row[COL['Product image URL']] = imageUrl;
    row[COL['Image position']] = '1';
    row[COL['Image alt text']] = title;
  }

  row[COL['SEO title']] = title.slice(0, 70);
  row[COL['SEO description']] = stripHtmlToPlain(descHtml, 320);

  return row;
}

export function buildShopifyProductCsv(
  items: SiteProductCsvInventoryItem[],
  opts: ShopifyProductCsvOptions
): string {
  const seenHandles = new Set<string>();
  const lines: string[] = [rowToCsvLine(SHOPIFY_PRODUCT_CSV_HEADERS)];

  for (const item of items) {
    const base = slugifyBase(item.name || '', item.id);
    const handle = allocateHandle(seenHandles, base);
    lines.push(rowToCsvLine(itemRow(item, handle, opts)));
  }

  return lines.join('\n');
}
