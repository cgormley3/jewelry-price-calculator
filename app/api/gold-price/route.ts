import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function GET() {
  try {
    // We scrape Google Finance's public pages for Gold and Silver
    // Gold Ticker: GCW00:COMEX | Silver Ticker: SIW00:COMEX
    const goldUrl = 'https://www.google.com/finance/quote/GCW00:COMEX';
    const silverUrl = 'https://www.google.com/finance/quote/SIW00:COMEX';

    const fetchPrice = async (url: string) => {
      const res = await fetch(url, {
        cache: 'no-store',
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.0 Mobile/15E148 Safari/604.1'
        }
      });
      const html = await res.text();
      const $ = cheerio.load(html);
      // This is the specific class Google uses for the "Last Price"
      const priceText = $('.YMlKec.fxKbKc').first().text().replace(/[^0-9.]/g, '');
      return parseFloat(priceText);
    };

    const gold = await fetchPrice(goldUrl);
    const silver = await fetchPrice(silverUrl);

    if (gold > 0) {
      return NextResponse.json({
        gold,
        silver,
        platinum: 965.00, // Google Finance doesn't always show spot Plat/Pall easily
        palladium: 1020.00,
        lastUpdated: new Date().toISOString()
      });
    }

    throw new Error("Google blocked the request or selector changed");

  } catch (error) {
    return NextResponse.json({ error: "Stealth Scraping Failed" }, { status: 500 });
  }
}