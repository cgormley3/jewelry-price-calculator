import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import backupPrices from '@/prices.json';

export async function GET() {
  const tickers = {
    gold: 'https://www.google.com/finance/quote/GCW00:COMEX',
    silver: 'https://www.google.com/finance/quote/SIW00:COMEX',
    platinum: 'https://www.google.com/finance/quote/PLW00:NYMEX',
    palladium: 'https://www.google.com/finance/quote/PAW00:NYMEX'
  };

  const fetchGooglePrice = async (url: string) => {
    try {
      const res = await fetch(url, { cache: 'no-store', headers: { 'User-Agent': 'Mozilla/5.0' } });
      const html = await res.text();
      const $ = cheerio.load(html);
      const priceText = $('.YMlKec.fxKbKc').first().text().replace(/[^0-9.]/g, '');
      const price = parseFloat(priceText);
      return isNaN(price) ? null : price;
    } catch { return null; }
  };

  const fetchRioGrandePrices = async () => {
    try {
      const res = await fetch('https://www.riogrande.com/metal-market-prices/', {
        cache: 'no-store',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
      });
      const html = await res.text();
      const $ = cheerio.load(html);
      const text = $('body').text();

      const findPrice = (regex: RegExp) => {
        const match = text.match(regex);
        if (!match) return null;
        const price = parseFloat(match[1].replace(/,/g, ''));
        return isNaN(price) ? null : price;
      };

      return {
        gold: findPrice(/Gold\s*\$?([\d,]+\.\d{2})/i),
        silver: findPrice(/Silver\s*\$?([\d,]+\.\d{2})/i),
        platinum: findPrice(/Platinum\s*\$?([\d,]+\.\d{2})/i),
        palladium: findPrice(/Palladium\s*\$?([\d,]+\.\d{2})/i),
      };
    } catch { return null; }
  };

  try {
    const [gGold, gSilver, gPlat, gPall] = await Promise.all([
      fetchGooglePrice(tickers.gold),
      fetchGooglePrice(tickers.silver),
      fetchGooglePrice(tickers.platinum),
      fetchGooglePrice(tickers.palladium)
    ]);

    // 1. Google Finance Path
    if (gGold !== null) {
      return NextResponse.json({
        gold: gGold,
        silver: gSilver ?? backupPrices.silver,
        platinum: gPlat ?? backupPrices.platinum,
        palladium: gPall ?? backupPrices.palladium,
        lastUpdated: new Date().toISOString()
        // source omitted
      });
    }

    // 2. Rio Grande Path
    const rioPrices = await fetchRioGrandePrices();
    if (rioPrices && rioPrices.gold !== null) {
      return NextResponse.json({
        gold: rioPrices.gold,
        silver: rioPrices.silver ?? backupPrices.silver,
        platinum: rioPrices.platinum ?? backupPrices.platinum,
        palladium: rioPrices.palladium ?? backupPrices.palladium,
        lastUpdated: new Date().toISOString()
        // source omitted
      });
    }

    // 3. GitHub JSON Fallback
    // We destructure to remove 'source' from backupPrices if it exists there
    const { source: _, ...cleanBackup } = backupPrices;
    return NextResponse.json({
      ...cleanBackup,
      lastUpdated: new Date().toISOString()
    });

  } catch (error) {
    const { source: _, ...cleanBackup } = backupPrices;
    return NextResponse.json(cleanBackup);
  }
}