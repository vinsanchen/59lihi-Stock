import fetch from "node-fetch";

let yahooRateLimitUntil = 0;
let stooqRateLimitUntil = 0;

async function getYahooChartData(ticker: string, retries = 1, useQuery2 = true): Promise<any> {
  if (useQuery2 && Date.now() < yahooRateLimitUntil) {
    console.log(`[Yahoo Skipped] ${ticker} because of rate limit`);
    return null;
  }
  const subdomain = useQuery2 ? "query2" : "query1";
  const url = `https://${subdomain}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1y`;
  console.log(`[Yahoo Headers check] Fetching: ${url}`);
  
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 6000);
  
  const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": userAgent
      }
    });
    clearTimeout(id);
    
    console.log(`[Yahoo Status] ${ticker} Status: ${res.status}`);
    if (!res.ok) {
      if (res.status === 429) {
        yahooRateLimitUntil = Date.now() + 10 * 1000;
        throw new Error("rate limit: Too many requests for Yahoo Finance");
      }
      if (res.status === 403) {
        yahooRateLimitUntil = Date.now() + 10 * 1000;
        throw new Error("API blocked: Forbidden bypass access");
      }
      throw new Error(`parsing error or server status: HTTP ${res.status}`);
    }
    
    const json: any = await res.json();
    return json;
  } catch (err: any) {
    clearTimeout(id);
    const now = Date.now();
    const isAlreadyLimit = now < yahooRateLimitUntil;
    
    console.log(`[Yahoo Error] ${ticker} fell into catch with error: ${err.message}`);
    
    if (useQuery2) {
      await new Promise(r => setTimeout(r, 100));
      return getYahooChartData(ticker, retries, false);
    }
    return null;
  }
}

function parseYahooKLines(json: any): any[] {
  const result = json?.chart?.result?.[0];
  if (!result) return [];
  const timestamps = result.timestamp || [];
  const quote = result.indicators?.quote?.[0] || {};
  const opens = quote.open || [];
  const highs = quote.high || [];
  const lows = quote.low || [];
  const closes = quote.close || [];
  const volumes = quote.volume || [];
  
  const klines: any[] = [];
  for (let i = 0; i < timestamps.length; i++) {
    const ts = timestamps[i];
    const dateStr = new Date(ts * 1000).toISOString().split("T")[0];
    const o = opens[i];
    const h = highs[i];
    const l = lows[i];
    const c = closes[i];
    const v = volumes[i];
    
    if (o === null || h === null || l === null || c === null || v === null ||
        o === undefined || h === undefined || l === undefined || c === undefined || v === undefined) {
      continue;
    }
    
    klines.push({ date: dateStr, open: o, high: h, low: l, close: c, volume: v });
  }
  return klines;
}

async function testFetch() {
  const ticker = "AMD";
  const rawData = await getYahooChartData(ticker);
  if (rawData) {
    const klines = parseYahooKLines(rawData);
    console.log(`Parsed ${klines.length} klines for AMD`);
    if (klines.length > 0) {
      const last = klines[klines.length - 1];
      console.log(`Last Close: $${last.close} on ${last.date}`);
    }
  } else {
    console.log("Yahoo returned null rawData");
  }
}

testFetch();
