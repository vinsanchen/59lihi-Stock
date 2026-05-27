import fetch from "node-fetch";

// The TW Tickers
const TW_TICKERS = [
  { ticker: "2330", name: "台積電" },
  { ticker: "2317", name: "鴻海" },
  { ticker: "2454", name: "聯發科" },
  { ticker: "2308", name: "台達電" },
  { ticker: "2382", name: "廣達" },
  { ticker: "3231", name: "緯創" },
  { ticker: "2357", name: "華碩" },
  { ticker: "3037", name: "欣興" },
  { ticker: "2379", name: "瑞昱" },
  { ticker: "2408", name: "南亞科" }
];

// The US Tickers
const US_TICKERS = [
  { ticker: "NVDA", name: "NVIDIA Corp" },
  { ticker: "AAPL", name: "Apple Inc." },
  { ticker: "MSFT", name: "Microsoft Corp" },
  { ticker: "TSLA", name: "Tesla Inc." },
  { ticker: "PLTR", name: "Palantir Tech" },
  { ticker: "LLY", name: "Eli Lilly & Co" },
  { ticker: "AVGO", name: "Broadcom Inc." },
  { ticker: "AMD", name: "Advanced Micro Devices" },
  { ticker: "META", name: "Meta Platforms" },
  { ticker: "AMZN", name: "Amazon.com Inc" }
];

let yahooRateLimitUntil = 0;
let stooqRateLimitUntil = 0;

// Replicate parsing and fetch functions
async function getYahooChartData(ticker: string, retries = 1, useQuery2 = true): Promise<any> {
  if (useQuery2 && Date.now() < yahooRateLimitUntil) {
    console.log(`[Yahoo Skipped] ${ticker} due to cooldown`);
    return null;
  }
  const subdomain = useQuery2 ? "query2" : "query1";
  const url = `https://${subdomain}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1y`;
  
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 6000);
  
  const userAgent = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": userAgent }
    });
    clearTimeout(id);
    
    if (!res.ok) {
      if (res.status === 429) {
        yahooRateLimitUntil = Date.now() + 10 * 1000;
        throw new Error("rate limit: Too many requests");
      }
      if (res.status === 403) {
        yahooRateLimitUntil = Date.now() + 10 * 1000;
        throw new Error("API blocked: Forbidden bypass access");
      }
      throw new Error(`status: HTTP ${res.status}`);
    }
    return await res.json();
  } catch (err: any) {
    clearTimeout(id);
    const now = Date.now();
    const isAlreadyLimit = now < yahooRateLimitUntil;
    
    console.log(`[Yahoo Error] ${ticker} on ${subdomain}: ${err.message}`);
    
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
  for (let i = 0; i < opens.length; i++) {
    const ts = timestamps[i];
    if (!ts) continue;
    const dateStr = new Date(ts * 1000).toISOString().split("T")[0];
    const o = opens[i];
    const h = highs[i];
    const l = lows[i];
    const c = closes[i];
    const v = volumes[i];
    if (o == null || h == null || l == null || c == null) continue;
    klines.push({ date: dateStr, open: o, high: h, low: l, close: c, volume: v });
  }
  return klines;
}

async function getFinMindChartData(ticker: string): Promise<any[]> {
  // Simulate FinMind
  const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${ticker}&start_date=2025-01-01`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) throw new Error("Status: " + res.status);
    const json: any = await res.json();
    if (json.status !== 200 || !json.data) throw new Error(json.msg || "Bad FinMind payload");
    
    return json.data.map((d: any) => ({
      date: d.date,
      open: d.open,
      high: d.max,
      low: d.min,
      close: d.close,
      volume: d.trading_volume
    }));
  } catch (err: any) {
    console.log(`[FinMind Fail] ${ticker}: ${err.message}`);
    throw err;
  }
}

async function getStooqChartData(ticker: string, isTW: boolean): Promise<any[]> {
  const symbol = ticker.startsWith("^") ? ticker.toLowerCase() : (isTW ? `${ticker}.tw` : `${ticker.toLowerCase()}.us`);
  const url = `https://stooq.com/q/d/l/?s=${symbol}&i=d`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      }
    });
    if (!res.ok) throw new Error("Status: " + res.status);
    const text = await res.text();
    // Simple mock validator for shape
    if (text.includes("Reject") || text.includes("cooldown") || text.includes("apikey")) {
      throw new Error("Reject header found");
    }
    return [{ date: "2026-05-26", open: 1, high: 1, low: 1, close: 1, volume: 1 }]; // mock
  } catch (err: any) {
    console.log(`[Stooq Fail] ${ticker}: ${err.message}`);
    throw err;
  }
}

async function fetchStockKLines(ticker: string, isTW: boolean, name: string): Promise<{ klines: any[]; isMock: boolean }> {
  if (isTW) {
    try {
      const klines = await getFinMindChartData(ticker);
      if (klines && klines.length >= 50) {
        return { klines, isMock: false };
      }
    } catch (err: any) {
      console.warn(`[TW FinMind Failover] ${ticker}`);
    }
  }

  // Option B: Yahoo
  const yTicker = isTW ? `${ticker}.TW` : ticker;
  if (Date.now() >= yahooRateLimitUntil) {
    try {
      const rawData = await getYahooChartData(yTicker);
      if (rawData) {
        const klines = parseYahooKLines(rawData);
        if (klines && klines.length >= 50) {
          return { klines, isMock: false };
        }
      }
    } catch (err: any) {
      console.warn(`[Yahoo Scraper Fail] ${yTicker}`);
    }
  }

  // Option C: Stooq
  try {
    const klines = await getStooqChartData(ticker, isTW);
    if (klines && klines.length >= 50) {
      return { klines, isMock: false };
    }
  } catch (e) {}

  return { klines: [], isMock: true };
}

async function runSimulator() {
  const allTickers = [
    ...TW_TICKERS.map(t => ({ ...t, isTW: true })),
    ...US_TICKERS.map(t => ({ ...t, isTW: false }))
  ];

  for (const item of allTickers) {
    console.log(`\n>>> Processing ${item.name} (${item.ticker})`);
    const { klines, isMock } = await fetchStockKLines(item.ticker, item.isTW, item.name);
    console.log(`<<< Done ${item.name} - Klines Count: ${klines.length} | IsMock: ${isMock}`);
    await new Promise(r => setTimeout(r, 150));
  }
}

runSimulator();
