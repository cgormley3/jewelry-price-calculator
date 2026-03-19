import * as cheerio from 'cheerio';

export const BULLION_BY_POST_URLS = {
  gold: 'https://www.bullionbypost.com/gold-price/gold-price-today/#show-chart',
  silver: 'https://www.bullionbypost.com/silver-price/silver-price-today/#show-chart',
  platinum: 'https://www.bullionbypost.com/platinum-price/platinum-price-today/#show-chart',
  palladium: 'https://www.bullionbypost.com/palladium-price/today/ounces/USD/#show-chart',
} as const;

const FETCH_OPTIONS: RequestInit = {
  method: 'GET',
  headers: {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.9',
  },
  cache: 'no-store',
};

const PRICE_RANGES: Record<string, [number, number]> = {
  gold: [2000, 15000],
  silver: [15, 150],
  platinum: [800, 2500],
  palladium: [800, 5000],
};

export function parsePriceFromHtml(html: string, metal: keyof typeof PRICE_RANGES): { price: number; pct: number | null } {
  const $ = cheerio.load(html);
  const text = $('body').text();
  const [minVal, maxVal] = PRICE_RANGES[metal];

  const priceMatch = text.match(/\$([\d,]+\.?\d*)/g);
  let price = 0;
  if (priceMatch) {
    for (const m of priceMatch) {
      const val = parseFloat(m.replace(/[$,]/g, ''));
      if (val >= minVal && val <= maxVal) {
        price = val;
        break;
      }
    }
  }

  const pctMatch = text.match(/\((-?\d+\.?\d*)%\)/);
  const pct = pctMatch ? parseFloat(pctMatch[1]) : null;

  return { price, pct: pct !== null && !isNaN(pct) ? pct : null };
}

async function fetchMetalPage(url: string): Promise<string> {
  const res = await fetch(url, FETCH_OPTIONS);
  if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  return res.text();
}

export type MetalPriceData = {
  gold: number;
  silver: number;
  platinum: number;
  palladium: number;
  gold_pct: number | null;
  silver_pct: number | null;
  platinum_pct: number | null;
  palladium_pct: number | null;
  updated_at: string;
};

export async function fetchPricesFromBullionByPost(): Promise<MetalPriceData> {
  const metals: (keyof typeof BULLION_BY_POST_URLS)[] = ['gold', 'silver', 'platinum', 'palladium'];
  const results = await Promise.allSettled(
    metals.map((m) => fetchMetalPage(BULLION_BY_POST_URLS[m]))
  );

  const priceData: MetalPriceData = {
    gold: 0,
    silver: 0,
    platinum: 0,
    palladium: 0,
    gold_pct: null,
    silver_pct: null,
    platinum_pct: null,
    palladium_pct: null,
    updated_at: new Date().toISOString(),
  };

  for (let i = 0; i < metals.length; i++) {
    const metal = metals[i];
    const result = results[i];
    if (result.status === 'fulfilled') {
      const { price, pct } = parsePriceFromHtml(result.value, metal);
      (priceData as any)[metal] = price;
      (priceData as any)[`${metal}_pct`] = pct;
    }
  }

  return priceData;
}
