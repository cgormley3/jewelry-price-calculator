/**
 * Pushes gold/silver/platinum/palladium into Supabase `metal_prices` (row id = 1).
 *
 * Project Settings → Script properties:
 *   SUPABASE_URL           https://YOUR_PROJECT.supabase.co
 *   SUPABASE_SERVICE_KEY   service_role JWT (name is the key; value is the secret)
 *
 * Trigger: Time-driven → syncMetalPricesToSupabase (e.g. every minute).
 * Manual test: run syncMetalPricesToSupabase. refreshGoldPrices only punches the sheet when PRICE_SOURCE is SHEET; if PRICE_SOURCE is YAHOO_JSON, refreshGoldPrices forwards to sync.
 *
 * ---------------------------------------------------------------------------
 * PRICE_SOURCE
 * ---------------------------------------------------------------------------
 * YAHOO_JSON — UrlFetchApp reads Yahoo Finance chart JSON (no spreadsheet).
 *   Fills gold_pct…palladium_pct = today’s session % vs prior close (Yahoo meta / chart).
 *   Use a standalone Apps Script project (script.google.com) OR a bound script;
 *   SpreadsheetApp is not used. Google Finance does not offer a stable public
 *   JSON quote URL; these Yahoo symbols are the usual COMEX-style proxies:
 *   GC=F, SI=F, PL=F, PA=F.
 *
 * SHEET — Bound script only. Refreshes ImportXML in the sheet-metal range, waits,
 *   reads the same range, then PATCHes Supabase (no mismatch between punch and read).
 */
var PRICE_SOURCE = 'YAHOO_JSON';

/**
 * Yahoo Finance chart symbols — one per Supabase column (explicit keys = no order bugs).
 * If platinum looks like silver (~20–40), Yahoo may be returning the wrong contract; try
 * platinum: 'PL00.CMX' or check Executions log for "symbol mismatch".
 */
var YAHOO_BY_METAL = {
  gold: 'GC=F',
  silver: 'SI=F',
  platinum: 'PL=F',
  palladium: 'PA=F',
};
/** Tried in order if gold is still 0 (GC=F often fails when throttled or outside RTH). */
var YAHOO_GOLD_FALLBACKS = ['XAUUSD=X', 'MGC=F'];
var YAHOO_FETCH_SLEEP_MS = 350;
/**
 * Yahoo COMEX Pt vs Pd labels sometimes disagree with what people expect.
 * If platinum spot shows in Supabase palladium column, set true (default on).
 */
var SWAP_PLATINUM_PALLADIUM_YAHOO = true;
/** If true, log each Yahoo fetch to Executions. */
var YAHOO_LOG_EACH_PRICE = false;
/** If true, log Supabase URL (sanitized), HTTP status, and payload after each write. */
var LOG_SUPABASE = true;
/** If true, log each metal’s resolved price before writing to Supabase (Executions panel). */
var LOG_METAL_PRICES = true;

var SHEET_NAME = '';
/**
 * SHEET mode ONLY: four cells forming one column block (e.g. B1:B4).
 * If row 1 is a title/header and prices start on row 2, use B2:B5.
 */
var SHEET_METAL_RANGE = 'B1:B4';
/**
 * Rows 0–3 within that block: which row supplies gold, silver, platinum, palladium.
 * Default [0,1,2,3] = top row gold, next silver, then platinum, then palladium.
 * If your sheet is gold, silver, palladium, platinum (Pd before Pt), use [0,1,3,2].
 * If silver & platinum rows are swapped, try [0,2,1,3].
 */
var SHEET_METAL_ROW_OFFSETS = [0, 1, 2, 3];
var DELAY_MS_AFTER_REFRESH = 8000;

/** Sheet mode: ImportXML punch only. Yahoo mode: full fetch + Supabase (same as syncMetalPricesToSupabase). */
function refreshGoldPrices() {
  if (PRICE_SOURCE !== 'SHEET') {
    console.log(
      'refreshGoldPrices: PRICE_SOURCE is ' +
        PRICE_SOURCE +
        ' — running syncMetalPricesToSupabase (Yahoo → Supabase). For sheet-only punch, set PRICE_SOURCE to SHEET.'
    );
    syncMetalPricesToSupabase();
    return;
  }
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    console.warn('refreshGoldPrices skipped: could not acquire lock');
    return;
  }
  try {
    refreshImportXmlInSheet_();
  } finally {
    lock.releaseLock();
  }
}

function syncMetalPricesToSupabase() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    console.warn('syncMetalPricesToSupabase skipped: could not acquire lock in 30s (another run still going?)');
    return;
  }
  try {
    var props = PropertiesService.getScriptProperties();
    var base = (props.getProperty('SUPABASE_URL') || '').replace(/\/$/, '');
    var key = props.getProperty('SUPABASE_SERVICE_KEY') || '';
    if (!base || !key) {
      throw new Error('Set SUPABASE_URL and SUPABASE_SERVICE_KEY in Script properties');
    }

    var gold = 0;
    var silver = 0;
    var platinum = 0;
    var palladium = 0;
    var gold_pct = null;
    var silver_pct = null;
    var platinum_pct = null;
    var palladium_pct = null;

    if (PRICE_SOURCE === 'YAHOO_JSON') {
      var y = fetchPricesFromYahooJson_();
      gold = y.gold;
      silver = y.silver;
      platinum = y.platinum;
      palladium = y.palladium;
      gold_pct = y.gold_pct;
      silver_pct = y.silver_pct;
      platinum_pct = y.platinum_pct;
      palladium_pct = y.palladium_pct;
    } else if (PRICE_SOURCE === 'SHEET') {
      refreshImportXmlInSheet_();
      if (DELAY_MS_AFTER_REFRESH > 0) {
        Utilities.sleep(DELAY_MS_AFTER_REFRESH);
      }
      var sheet = getPriceSheet_();
      var values = sheet.getRange(SHEET_METAL_RANGE).getValues();
      var pr = applySheetMetalRowOffsets_(values);
      gold = pr.gold;
      silver = pr.silver;
      platinum = pr.platinum;
      palladium = pr.palladium;
    } else {
      throw new Error('Unknown PRICE_SOURCE: ' + PRICE_SOURCE);
    }

    if (PRICE_SOURCE === 'SHEET' && gold === 0 && (silver > 50 || platinum > 50 || palladium > 50)) {
      console.warn(
        'Gold is 0 but other columns have prices — often row 1 is a header. Set SHEET_METAL_RANGE to B2:B5 (or C2:C5, etc.) so gold is the first cell.'
      );
    }

    logMetalPricesDebug_(gold, silver, platinum, palladium, gold_pct, silver_pct, platinum_pct, palladium_pct);

    patchSupabaseMetalPrices_(
      base,
      key,
      gold,
      silver,
      platinum,
      palladium,
      gold_pct,
      silver_pct,
      platinum_pct,
      palladium_pct
    );
  } finally {
    lock.releaseLock();
  }
}

function patchSupabaseMetalPrices_(base, key, gold, silver, platinum, palladium, gold_pct, silver_pct, platinum_pct, palladium_pct) {
  var updatedAt = new Date().toISOString();
  /** POST + merge-duplicates inserts or updates row id=1. Plain PATCH with id=eq.1 updates 0 rows if the row does not exist and still returns 2xx. */
  var url = base + '/rest/v1/metal_prices';
  var payload = {
    id: 1,
    gold: gold,
    silver: silver,
    platinum: platinum,
    palladium: palladium,
    updated_at: updatedAt,
  };
  if (gold_pct != null) payload.gold_pct = gold_pct;
  if (silver_pct != null) payload.silver_pct = silver_pct;
  if (platinum_pct != null) payload.platinum_pct = platinum_pct;
  if (palladium_pct != null) payload.palladium_pct = palladium_pct;

  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    muteHttpExceptions: true,
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      Prefer: 'return=representation,resolution=merge-duplicates',
    },
    payload: JSON.stringify(payload),
  });

  var code = res.getResponseCode();
  var body = res.getContentText();
  if (code < 200 || code >= 300) {
    throw new Error('Supabase POST upsert ' + code + ': ' + body.slice(0, 800));
  }
  if (LOG_SUPABASE) {
    console.log(
      'Supabase OK HTTP ' +
        code +
        ' | g,s,pt,pd=' +
        [gold, silver, platinum, palladium].join(',') +
        ' | pct=' +
        [gold_pct, silver_pct, platinum_pct, palladium_pct].join(',') +
        ' | row=' +
        body.slice(0, 400)
    );
  }
}

function fetchPricesFromYahooJson_() {
  var M = YAHOO_BY_METAL;
  if (!M || !M.gold || !M.silver || !M.platinum || !M.palladium) {
    throw new Error('YAHOO_BY_METAL must define gold, silver, platinum, palladium');
  }

  var gq = yahooQuote_(M.gold, 'gold');
  var gold = gq.price;
  var gold_pct = gq.changePct;
  if (gold === 0 && YAHOO_GOLD_FALLBACKS && YAHOO_GOLD_FALLBACKS.length) {
    for (var gi = 0; gi < YAHOO_GOLD_FALLBACKS.length; gi++) {
      Utilities.sleep(YAHOO_FETCH_SLEEP_MS);
      gq = yahooQuote_(YAHOO_GOLD_FALLBACKS[gi], 'gold-fallback');
      gold = gq.price;
      gold_pct = gq.changePct;
      if (gold > 0) break;
    }
  }
  Utilities.sleep(YAHOO_FETCH_SLEEP_MS);

  var sq = yahooQuote_(M.silver, 'silver');
  var silver = sq.price;
  var silver_pct = sq.changePct;
  Utilities.sleep(YAHOO_FETCH_SLEEP_MS);

  var plQ = yahooQuote_(M.platinum, 'platinum-PL');
  Utilities.sleep(YAHOO_FETCH_SLEEP_MS);
  var paQ = yahooQuote_(M.palladium, 'palladium-PA');

  var platinum;
  var palladium;
  var platinum_pct;
  var palladium_pct;
  if (SWAP_PLATINUM_PALLADIUM_YAHOO) {
    platinum = paQ.price;
    platinum_pct = paQ.changePct;
    palladium = plQ.price;
    palladium_pct = plQ.changePct;
  } else {
    platinum = plQ.price;
    platinum_pct = plQ.changePct;
    palladium = paQ.price;
    palladium_pct = paQ.changePct;
  }

  return {
    gold: gold,
    silver: silver,
    platinum: platinum,
    palladium: palladium,
    gold_pct: gold_pct,
    silver_pct: silver_pct,
    platinum_pct: platinum_pct,
    palladium_pct: palladium_pct,
  };
}

function yahooQuote_(symbol, debugLabel) {
  var enc = encodeURIComponent(symbol);
  var url =
    'https://query1.finance.yahoo.com/v8/finance/chart/' +
    enc +
    '?range=2d&interval=5m&includePrePost=false';
  var res = UrlFetchApp.fetch(url, {
    muteHttpExceptions: true,
    followRedirects: true,
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      Accept: 'application/json',
    },
  });
  var code = res.getResponseCode();
  if (code !== 200) {
    console.warn((debugLabel || symbol) + ' HTTP ' + code + ' ' + symbol);
    return { price: 0, changePct: null };
  }
  try {
    var data = JSON.parse(res.getContentText());
    var r = data.chart && data.chart.result && data.chart.result[0];
    if (!r) return { price: 0, changePct: null };
    var p = extractYahooQuotePrice_(r);
    var pct = extractYahooTodayChangePct_(r, p);
    if (YAHOO_LOG_EACH_PRICE) {
      console.log((debugLabel || symbol) + ' ' + symbol + ' → price=' + p + ' todayPct=' + pct);
    }
    return { price: p, changePct: pct };
  } catch (e) {
    console.warn((debugLabel || symbol) + ' JSON: ' + e + ' ' + symbol);
    return { price: 0, changePct: null };
  }
}

/** Reads meta + indicator closes so GC=F works outside regular session when possible */
function extractYahooQuotePrice_(r) {
  var m = r.meta || {};
  var p = numOnly_(m.regularMarketPrice);
  if (p > 0) return p;
  p = numOnly_(m.previousClose);
  if (p > 0) return p;
  p = numOnly_(m.chartPreviousClose);
  if (p > 0) return p;
  if (r.indicators && r.indicators.quote && r.indicators.quote[0]) {
    var closes = r.indicators.quote[0].close || [];
    for (var i = closes.length - 1; i >= 0; i--) {
      p = numOnly_(closes[i]);
      if (p > 0) return p;
    }
  }
  return 0;
}

/**
 * Today’s % — align with Yahoo Finance headline (1D): regularMarketChange ÷ previousClose × 100
 * (same as “(+6.95%)”). Avoid using (price − chartPreviousClose) first; that baseline often != UI.
 */
function extractYahooTodayChangePct_(r, price) {
  var m = r.meta || {};
  var prev =
    numForPrevClose_(m.regularMarketPreviousClose) ||
    numForPrevClose_(m.previousClose) ||
    numForPrevClose_(m.chartPreviousClose);
  var chg = m.regularMarketChange;
  if (prev > 0 && chg != null && !isNaN(Number(chg))) {
    return roundPct_((Number(chg) / prev) * 100);
  }

  var rm = m.regularMarketChangePercent;
  if (rm != null && !isNaN(Number(rm))) {
    return normalizeYahooChangePercentRaw_(Number(rm), chg, prev);
  }

  if (!price || price <= 0) return null;
  if (prev > 0) {
    return roundPct_(((price - prev) / prev) * 100);
  }
  if (r.indicators && r.indicators.quote && r.indicators.quote[0]) {
    var closes = r.indicators.quote[0].close || [];
    var iLast = -1;
    var last = 0;
    for (var i = closes.length - 1; i >= 0; i--) {
      var c = closes[i];
      if (c != null && !isNaN(c) && Number(c) > 0) {
        last = Number(c);
        iLast = i;
        break;
      }
    }
    if (iLast > 0) {
      for (var j = iLast - 1; j >= 0; j--) {
        var cj = closes[j];
        if (cj != null && !isNaN(cj) && Number(cj) > 0) {
          var p2 = Number(cj);
          if (p2 > 0) return roundPct_(((last - p2) / p2) * 100);
          break;
        }
      }
    }
  }
  return null;
}

/**
 * Yahoo may send regularMarketChangePercent as percent points (6.95) or decimal (0.0695).
 * When change/previousClose exists, prefer the interpretation closest to implied %.
 */
function normalizeYahooChangePercentRaw_(raw, chg, prev) {
  if (raw == null || isNaN(raw)) return null;
  var implied = null;
  if (prev > 0 && chg != null && !isNaN(Number(chg))) {
    implied = (Number(chg) / prev) * 100;
  }
  var asPoints = raw;
  var asFromDecimal = raw * 100;
  if (implied != null && Number.isFinite(implied)) {
    var errPts = Math.abs(asPoints - implied);
    var errDec = Math.abs(asFromDecimal - implied);
    if (errDec < errPts && errDec < Math.max(0.08, Math.abs(implied) * 0.02)) {
      return roundPct_(asFromDecimal);
    }
    if (errPts <= errDec || errPts < Math.max(0.08, Math.abs(implied) * 0.02)) {
      return roundPct_(asPoints);
    }
    return roundPct_(implied);
  }
  if (Math.abs(raw) < 1 && Math.abs(raw) > 1e-8) {
    return roundPct_(raw * 100);
  }
  return roundPct_(raw);
}

function numForPrevClose_(v) {
  if (v == null || v === '') return 0;
  var n = Number(v);
  return isNaN(n) || n <= 0 ? 0 : n;
}

function roundPct_(x) {
  if (x == null || isNaN(x)) return null;
  return Math.round(x * 1000000) / 1000000;
}

function numOnly_(v) {
  if (v == null || v === '') return 0;
  var n = Number(v);
  return isNaN(n) || n <= 0 ? 0 : n;
}

function getPriceSheet_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) {
    throw new Error('No spreadsheet — bind this script to a Sheet or set PRICE_SOURCE to YAHOO_JSON');
  }
  var sheet = SHEET_NAME ? ss.getSheetByName(SHEET_NAME) : ss.getSheets()[0];
  if (!sheet) {
    throw new Error(
      SHEET_NAME ? 'Sheet not found: ' + SHEET_NAME + ' (check tab name spelling)' : 'No sheets in workbook'
    );
  }
  return sheet;
}

function refreshImportXmlInSheet_() {
  var sheet = getPriceSheet_();
  var range = sheet.getRange(SHEET_METAL_RANGE);
  var formulas = range.getFormulas();
  if (formulas.flat().join('') === '') {
    console.error('No formulas in ' + SHEET_METAL_RANGE + ' — or set SHEET_METAL_RANGE (e.g. B2:B5 if row 1 is a header).');
    return;
  }
  range.clearContent();
  range.setFormulas(formulas);
}

function num_(v) {
  if (v === '' || v == null) return 0;
  var n = Number(v);
  return isNaN(n) ? 0 : n;
}

/** Runs before Supabase write. View in Apps Script → Executions. */
function logMetalPricesDebug_(gold, silver, platinum, palladium, gold_pct, silver_pct, platinum_pct, palladium_pct) {
  if (!LOG_METAL_PRICES) {
    return;
  }
  var fmt = function (n) {
    return n === 0 || n == null ? String(n) : Number(n).toFixed(4).replace(/\.?0+$/, '');
  };
  var fmtPct = function (p) {
    if (p == null) return 'n/a';
    return Number(p).toFixed(3) + '%';
  };
  var ts = new Date().toISOString();
  console.log('=== metal_prices debug ' + ts + ' source=' + PRICE_SOURCE + ' ===');
  console.log('  Gold      : ' + fmt(gold) + '  (today ' + fmtPct(gold_pct) + ')');
  console.log('  Silver    : ' + fmt(silver) + '  (today ' + fmtPct(silver_pct) + ')');
  console.log('  Platinum  : ' + fmt(platinum) + '  (today ' + fmtPct(platinum_pct) + ')');
  console.log('  Palladium : ' + fmt(palladium) + '  (today ' + fmtPct(palladium_pct) + ')');
  console.log('  (today % = vs Yahoo prior close / session, not a rolling 24h window.)');
}

/** Map four sheet rows to gold, silver, platinum, palladium using SHEET_METAL_ROW_OFFSETS. */
function applySheetMetalRowOffsets_(values) {
  var o = SHEET_METAL_ROW_OFFSETS;
  if (!o || o.length !== 4) {
    throw new Error('SHEET_METAL_ROW_OFFSETS must be exactly 4 indices (0–3)');
  }
  var seen = {};
  for (var i = 0; i < 4; i++) {
    if (o[i] < 0 || o[i] > 3 || seen[o[i]]) {
      throw new Error('SHEET_METAL_ROW_OFFSETS must be a permutation of 0,1,2,3');
    }
    seen[o[i]] = true;
  }
  return {
    gold: num_(values[o[0]] && values[o[0]][0]),
    silver: num_(values[o[1]] && values[o[1]][0]),
    platinum: num_(values[o[2]] && values[o[2]][0]),
    palladium: num_(values[o[3]] && values[o[3]][0]),
  };
}
