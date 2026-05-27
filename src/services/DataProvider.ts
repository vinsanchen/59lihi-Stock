/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StockAnalysis, KLine, TrendTemplateResult, SEPAScoreResult, SepaWeights } from "../types";

export const DEFAULT_WEIGHTS: SepaWeights = {
  trendTemplate: 40,
  rsStrength: 20,
  vcpPattern: 20,
  volumeDryUp: 10,
  riskReward: 10,
};

// Generates an array of business days going back count days from 2026-05-27
function generateBusinessDays(endDateStr: string, count: number): string[] {
  const dates: string[] = [];
  let curr = new Date(endDateStr);
  while (dates.length < count) {
    const day = curr.getDay();
    if (day !== 0 && day !== 6) { // 0 is Sunday, 6 is Saturday
      dates.push(curr.toISOString().split("T")[0]);
    }
    curr.setDate(curr.getDate() - 1);
  }
  return dates.reverse();
}

/**
 * High-fidelity Stock Data Generator
 */
export function generateStockHistory(
  ticker: string,
  name: string,
  marketType: string,
  country: "TW" | "US",
  basePrice: number,
  profile: "vcp-tight" | "breakout" | "flat-base" | "overextended" | "downtrend" | "forming-vcp",
  rsRanking: number
): StockAnalysis {
  const totalDays = 260; // Enough to calculate 200MA cleanly for a 50-day window
  const dateArr = generateBusinessDays("2026-05-27", totalDays);
  const klines: KLine[] = [];

  let price = basePrice;
  let seed = ticker.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
  
  // Custom deterministic pseudo-random number generator to have consistent charts
  function random() {
    const x = Math.sin(seed++) * 10000;
    return x - Math.floor(x);
  }

  // Define patterns for cumulative price generations
  let trendFactor = 0;
  if (profile === "downtrend") trendFactor = -0.0012;
  else if (profile === "overextended") trendFactor = 0.0035;
  else if (profile === "breakout") trendFactor = 0.0018;
  else trendFactor = 0.0008; // modest uptrend

  // Volatility baseline
  let baseVol = profile === "vcp-tight" || profile === "forming-vcp" ? 0.02 : 0.025;

  for (let i = 0; i < totalDays; i++) {
    const progress = i / totalDays;
    let priceMultiplier = 1 + trendFactor + (random() - 0.49) * baseVol;

    // Apply specific structures depending on progress and profiles
    if (profile === "vcp-tight") {
      // Create Volatility Contraction Pattern (VCP) across 260 days
      // Contraction 1: Days 120 - 180 (depth of ~22%)
      // Contraction 2: Days 180 - 230 (depth of ~11%)
      // Contraction 3: Days 230 - 255 (depth of ~3.5%)
      // Last 5 days: tight pivot action
      if (i >= 120 && i < 180) {
        const ph = (i - 120) / 60;
        const cycle = Math.sin(ph * Math.PI * 1.5); // full dip and recovery
        priceMultiplier = 1 + (cycle * -0.004) + (random() - 0.5) * 0.015;
      } else if (i >= 180 && i < 230) {
        const ph = (i - 180) / 50;
        const cycle = Math.sin(ph * Math.PI * 1.5);
        priceMultiplier = 1 + (cycle * -0.002) + (random() - 0.5) * 0.009;
      } else if (i >= 230 && i < 255) {
        const ph = (i - 230) / 25;
        const cycle = Math.sin(ph * Math.PI * 1.5);
        priceMultiplier = 1 + (cycle * -0.0006) + (random() - 0.5) * 0.004;
      } else if (i >= 255) {
        // tight consolidation close to pivot
        priceMultiplier = 1 + (random() - 0.5) * 0.002;
      }
    } else if (profile === "forming-vcp") {
      // Volume starts drying up, but still in second contraction
      if (i >= 150 && i < 220) {
        const ph = (i - 150) / 70;
        const cycle = Math.sin(ph * Math.PI * 1.5);
        priceMultiplier = 1 + (cycle * -0.004) + (random() - 0.5) * 0.018;
      } else if (i >= 220) {
        // dip currently occurring, hasn't tightened fully
        const ph = (i - 220) / 40;
        const cycle = Math.sin(ph * Math.PI * 0.8) * -0.05; // going down, not recovered yet
        priceMultiplier = 1 + cycle + (random() - 0.5) * 0.012;
      }
    } else if (profile === "breakout") {
      // VCP tight until day 250, then explosive 10% breakout in the last 10 days
      if (i >= 150 && i < 220) {
        const ph = (i - 150) / 70;
        const cycle = Math.sin(ph * Math.PI * 1.5);
        priceMultiplier = 1 + (cycle * -0.003) + (random() - 0.5) * 0.012;
      } else if (i >= 220 && i < 250) {
        const ph = (i - 220) / 30;
        const cycle = Math.sin(ph * Math.PI * 1.5);
        priceMultiplier = 1 + (cycle * -0.001) + (random() - 0.5) * 0.005;
      } else if (i >= 250) {
        // breakout rally
        const age = i - 250;
        priceMultiplier = 1.018 + (random() - 0.45) * 0.008;
      }
    } else if (profile === "flat-base") {
      // Price stays within a very tight 5% box between 160 -> 245, then nudges up slightly
      if (i >= 160 && i < 245) {
        const baseLevel = basePrice * 1.1;
        price = baseLevel + (random() - 0.5) * (baseLevel * 0.04);
        priceMultiplier = 1;
      } else if (i >= 245) {
        priceMultiplier = 1.002 + (random() - 0.48) * 0.006;
      }
    } else if (profile === "overextended") {
      // Parabolic growth in the final 80 days
      if (i >= 180) {
        priceMultiplier = 1.0051 + (random() - 0.47) * 0.022;
      }
    } else if (profile === "downtrend") {
      // Drifts down constantly
      priceMultiplier = 0.9982 + (random() - 0.52) * 0.022;
    }

    price = price * priceMultiplier;

    // Daily volume calculation
    const isUpDay = priceMultiplier >= 1;
    let dailyVol = 100000 + Math.floor(random() * 500000);
    if (country === "TW") {
      dailyVol *= 35; // Scale Taiwan stock volume to show realistic millions-of-shares range
    }
    
    // Volume characteristics
    if (profile === "vcp-tight") {
      // Volume dries up in contraction sessions
      if (i >= 120 && i < 180) dailyVol *= 0.8;
      else if (i >= 180 && i < 230) dailyVol *= 0.6;
      else if (i >= 230) dailyVol *= 0.35 + (isUpDay ? 0.2 : 0); // dry-up on down days, slightly up on up days
    } else if (profile === "breakout" && i >= 250) {
      // 2.5x volume on breakout days
      dailyVol *= 2.6 + random() * 1.5;
    } else if (profile === "downtrend") {
      // High volume on down days, very light on reflex rebounds
      dailyVol *= isUpDay ? 0.6 : 1.4;
    } else if (profile === "overextended") {
      // Huge volume throughout
      dailyVol *= 1.8;
    }

    // Make high and low bound realistic
    const spread = (0.01 + random() * 0.02) * price;
    const high = price + spread * (random() * 0.6 + 0.2);
    const low = price - spread * (random() * 0.6 + 0.2);
    const open = low + random() * (high - low);

    klines.push({
      date: dateArr[i],
      open: Math.round(open * 100) / 100,
      high: Math.round(high * 100) / 100,
      low: Math.round(low * 100) / 100,
      close: Math.round(price * 100) / 100,
      volume: Math.round(dailyVol),
    });
  }

  // Crop to last 250 days for actual calculations
  const workingKlines = klines.slice(10); // Discard first 10 for indicator padding

  // Calculate Moving Averages programmatically
  // Note: we can use the whole 260 array to ensure MA calculations are accurate up to the 250th day
  for (let idx = 10; idx < totalDays; idx++) {
    // 50MA
    const start50 = Math.max(0, idx - 49);
    const count50 = idx - start50 + 1;
    let sum50 = 0;
    for (let j = start50; j <= idx; j++) sum50 += klines[j].close;
    klines[idx].ma50 = Math.round((sum50 / count50) * 100) / 100;

    // 150MA
    const start150 = Math.max(0, idx - 149);
    const count150 = idx - start150 + 1;
    let sum150 = 0;
    for (let j = start150; j <= idx; j++) sum150 += klines[j].close;
    klines[idx].ma150 = Math.round((sum150 / count150) * 100) / 100;

    // 200MA
    const start200 = Math.max(0, idx - 199);
    const count200 = idx - start200 + 1;
    let sum200 = 0;
    for (let j = start200; j <= idx; j++) sum200 += klines[j].close;
    klines[idx].ma200 = Math.round((sum200 / count200) * 100) / 100;
  }

  const finalKlines = klines.slice( totalDays - 250 ); // Exactly 250 trading bars

  // Calculate 52-week statistics from final 250 trading days
  let high52Week = -Infinity;
  let low52Week = Infinity;
  let totalVolume = 0;

  for (const bar of finalKlines) {
    if (bar.high > high52Week) high52Week = bar.high;
    if (bar.low < low52Week) low52Week = bar.low;
    totalVolume += bar.volume;
  }

  const lastClose = finalKlines[finalKlines.length - 1].close;
  const yesterdayClose = finalKlines[finalKlines.length - 2].close;
  const changePercent = ((lastClose - yesterdayClose) / yesterdayClose) * 100;
  const volume = finalKlines[finalKlines.length - 1].volume;

  // 20-day average volume
  let sumVol20 = 0;
  for (let j = finalKlines.length - 20; j < finalKlines.length; j++) {
    sumVol20 += finalKlines[j].volume;
  }
  const avgVolume20 = Math.round(sumVol20 / 20);

  // Check 200MA rising condition: over the last 20 trading days, is 200MA generally drifting up?
  // We compare the MA200 on day (end) with day (end - 20).
  const ma200End = finalKlines[finalKlines.length - 1].ma200 || 0;
  let ma200Rising20Days = true;
  for (let k = finalKlines.length - 20; k < finalKlines.length; k++) {
    const prevMA200 = finalKlines[k - 1]?.ma200 || 0;
    const currMA200 = finalKlines[k]?.ma200 || 0;
    // Over 20 days, it is generally ascending. We can allow minor flat sessions, but trend must be positive
    if (currMA200 < prevMA200 * 0.999 && k % 5 === 0) {
      ma200Rising20Days = false;
    }
  }
  if (ma200End <= (finalKlines[finalKlines.length - 21]?.ma200 || 0)) {
    ma200Rising20Days = false;
  }

  // 1. 收盤價 > 50日均線
  const ma50Value = finalKlines[finalKlines.length - 1].ma50 || 0;
  const closeAbove50MA = lastClose > ma50Value;

  // 2. 50日均線 > 150日均線
  const ma150Value = finalKlines[finalKlines.length - 1].ma150 || 0;
  const ma50Above150MA = ma50Value > ma150Value;

  // 3. 50日均線 > 200日均線
  const ma200Value = finalKlines[finalKlines.length - 1].ma200 || 0;
  const ma50Above200MA = ma50Value > ma200Value;

  // 4. 150日均線 > 200日均線
  const ma150Above200MA = ma150Value > ma200Value;

  // 6. 接近52週低點+30%以上 (收盤價比52週低點至少高出30%)
  const closeAbove52WLowPct = lastClose >= low52Week * 1.30;

  // 7. 距離52週高點不超過25%
  const closeNear52WHighPct = lastClose >= high52Week * 0.75;

  // 8. RS Ranking 至少 70 (最好 80 以上)
  const rsRankingAbove70 = rsRanking >= 70;

  const passedCount = 
    (closeAbove50MA ? 1 : 0) +
    (ma50Above150MA ? 1 : 0) +
    (ma50Above200MA ? 1 : 0) +
    (ma150Above200MA ? 1 : 0) +
    (ma200Rising20Days ? 1 : 0) +
    (closeAbove52WLowPct ? 1 : 0) +
    (closeNear52WHighPct ? 1 : 0) +
    (rsRankingAbove70 ? 1 : 0);

  const passed = passedCount === 8;

  const trendTemplate: TrendTemplateResult = {
    passed,
    closeAbove50MA,
    ma50Above150MA,
    ma50Above200MA,
    ma150Above200MA,
    ma200Rising20Days,
    closeAbove52WLowPct,
    closeNear52WHighPct,
    rsRankingAbove70,
  };

  // Determine VCP details
  let pattern = "無明顯型態";
  let vcpPhaseDesc = "";
  let pivotPrice = 0;
  let status: StockAnalysis["status"] = "可觀察";
  let statusEn: StockAnalysis["statusEn"] = "Watch";
  let suggestion = "";

  if (profile === "vcp-tight") {
    pattern = "VCP 3T 核心收斂";
    vcpPhaseDesc = "3 段收縮 (22% → 11% → 3.5%)，振幅顯著壓縮，成交量進入乾枯期 (Vol Dry-up)。";
    pivotPrice = Math.round(high52Week * 0.99 * 100) / 100;
  } else if (profile === "forming-vcp") {
    pattern = "VCP 二段成形中";
    vcpPhaseDesc = "正進行第 2 段震盪收縮 (18% → 8%)，結構尚未完全收緊，右側量能仍待沉澱。";
    pivotPrice = Math.round(high52Week * 0.97 * 100) / 100;
  } else if (profile === "breakout") {
    pattern = "VCP 爆量突破";
    vcpPhaseDesc = "3T 收斂完成，伴隨 2.8 倍平均量能強勢突破 Pivot 壓力區。";
    pivotPrice = Math.round(high52Week * 0.92 * 100) / 100; // was broken 3 business days ago
  } else if (profile === "flat-base") {
    pattern = "高檔箱型收斂";
    vcpPhaseDesc = "箱型基底 (Flat Base)，價格於 4% 狹幅區間平緩整理，成交量溫和萎縮。";
    pivotPrice = Math.round(high52Week * 1.01 * 100) / 100;
  } else if (profile === "overextended") {
    pattern = "高檔延伸超買";
    vcpPhaseDesc = "無收斂型態。50 日均線乖離率高達 32%，呈陡峭噴出走勢，累計量能極大。";
    pivotPrice = Math.round(high52Week * 1.02 * 100) / 100;
  } else if (profile === "downtrend") {
    pattern = "頭部成形空頭排列";
    vcpPhaseDesc = "均線群死叉下行，收盤價持續破底，無任何看漲收斂特徵。";
    pivotPrice = Math.round(lastClose * 1.15 * 100) / 100;
  }

  // Calculate Pivot, Buy point, Stop Loss, Risk %
  let stopLoss = 0;
  let buyPoint = pivotPrice;

  if (profile === "vcp-tight") {
    // Buy point is pivotPrice
    const distanceToPivot = (pivotPrice - lastClose) / lastClose;
    if (lastClose >= pivotPrice * 0.96 && lastClose <= pivotPrice * 1.05) {
      status = "接近買點";
      statusEn = "Near Pivot";
      suggestion = "股價處於合理突破前夕。建議分批布局，或等待確定性帶量突破 Pivot 買點時加碼。";
    } else {
      status = "可觀察";
      statusEn = "Watch";
      suggestion = "型態極為優異，距離 Pivot 臨界點尚有空間，列為首要追蹤名單。";
    }
    // Stop loss placed below the third contraction low (approx 4.5% below pivot)
    stopLoss = Math.round(pivotPrice * 0.945 * 100) / 100;
  } else if (profile === "breakout") {
    status = "已突破";
    statusEn = "Breakout";
    suggestion = "強勢突破 Pivot！股價目前落於突破區間上方 +3.5%，仍屬合理買入區 (Pivot +5% 內)。";
    stopLoss = Math.round(pivotPrice * 0.94 * 100) / 100;
  } else if (profile === "forming-vcp") {
    status = "型態尚未完成";
    statusEn = "Pattern Forming";
    suggestion = "第 2-3 段收斂尚在演進中，建議靜待波動度進一步枯竭與成交量探底。";
    stopLoss = Math.round(lastClose * 0.92 * 100) / 100;
  } else if (profile === "flat-base") {
    status = "可觀察";
    statusEn = "Watch";
    suggestion = "高檔狹幅整理，等待箱頂壓力帶量突破。突破時可積極參與。";
    stopLoss = Math.round(lastClose * 0.94 * 100) / 100;
  } else if (profile === "overextended") {
    status = "過度延伸，不建議追";
    statusEn = "Overextended";
    suggestion = "短期漲幅極度延伸，回檔修正與假突破風險極高，此時建倉風險極大。應待其構築新底。";
    stopLoss = Math.round(lastClose * 0.90 * 100) / 100;
  } else {
    status = "不符合";
    statusEn = "Non-compliant";
    suggestion = "不符強勢股多頭排列。此股目前處於空頭或紊亂整理，極不建議操作。";
    stopLoss = Math.round(lastClose * 0.88 * 100) / 100;
  }

  // Calculate target prices
  // Minervini target is typically 2x to 3x stop loss risk (e.g. risk is 5%, target 10% - 15%)
  const riskPercent = Math.round(((buyPoint - stopLoss) / buyPoint) * 10000) / 100;
  const targetPrice1 = Math.round(buyPoint * (1 + (riskPercent * 2) / 100) * 100) / 100;
  const targetPrice2 = Math.round(buyPoint * (1 + (riskPercent * 3) / 100) * 100) / 100;
  
  const pctToBuyPoint = Math.round(((buyPoint - lastClose) / lastClose) * 10000) / 100;

  // Let's create SEPA score components (out of 100)
  // 1. Trend Template: 40 points
  const trendPoints = Math.round((passedCount / 8) * 40);

  // 2. RS Rank: 20 points
  const rsPoints = Math.round((rsRanking / 100) * 20);

  // 3. VCP Pattern: 20 points
  let vcpPoints = 0;
  if (profile === "vcp-tight") vcpPoints = 20;
  else if (profile === "breakout") vcpPoints = 20;
  else if (profile === "forming-vcp") vcpPoints = 14;
  else if (profile === "flat-base") vcpPoints = 12;
  else if (profile === "overextended") vcpPoints = 6;
  else vcpPoints = 2;

  // 4. Volume dry up: 10 points
  let volPoints = 0;
  if (profile === "vcp-tight") volPoints = 10;
  else if (profile === "flat-base") volPoints = 8;
  else if (profile === "forming-vcp") volPoints = 6;
  else if (profile === "breakout") volPoints = 9; // broke out on massive volume, previously dry
  else if (profile === "overextended") volPoints = 3;
  else volPoints = 1;

  // 5. Risk / Reward: 10 points (lower risk % = higher reward ratio)
  let valPoints = 0;
  if (profile === "vcp-tight") valPoints = 10; // Tight stop, 4-5% risk
  else if (profile === "breakout") valPoints = 9;  // 5-6% risk
  else if (profile === "flat-base") valPoints = 8;  // Medium risk
  else if (profile === "forming-vcp") valPoints = 5;  // Indeterminate risk
  else if (profile === "overextended") valPoints = 1; // Heavy Risk
  else valPoints = 0;

  const sepaScore: SEPAScoreResult = {
    total: 0, // calculated below based on custom weights
    trendTemplate: trendPoints,
    rsStrength: rsPoints,
    vcpPattern: vcpPoints,
    volumeDryUp: volPoints,
    riskReward: valPoints,
  };

  sepaScore.total = Math.round(
    sepaScore.trendTemplate +
    sepaScore.rsStrength +
    sepaScore.vcpPattern +
    sepaScore.volumeDryUp +
    sepaScore.riskReward
  );

  const defaultSeeds: Record<string, number> = {
    "2330": 15,
    "2317": 14,
    "2382": 12,
    "3653": 22,
    "2383": 26,
    "6669": 18,
    "1513": 10,
    "1519": 8,
    "3017": 11,
    "3324": 14,
    "3037": 9,
    "2449": 8,
    "NVDA": 28,
    "MSFT": 19,
    "AAPL": 16,
    "PLTR": 25,
    "LLY": 21,
    "AVGO": 18,
    "NET": 13,
    "MSTR": 20,
  };
  const cleanTicker = ticker.split(".")[0].toUpperCase();
  const consecutiveDays = defaultSeeds[cleanTicker] || (trendTemplate.passed ? 8 : 2);

  let watchlistCategory: "核心觀察股" | "接近買點" | "今日突破" | "過度延伸" | "失敗型態" | "一般追蹤" = "一般追蹤";
  let watchlistCategoryEn: "Core Watchlist" | "Near Pivot" | "Breakout Today" | "Extended" | "Failed Setup" | "Regular Watch" = "Regular Watch";

  const isBelowStopLoss = lastClose < stopLoss;
  const isBelow50MA = !trendTemplate.closeAbove50MA;
  const isBelowPivot = lastClose < buyPoint * 0.95;

  if (isBelowStopLoss || isBelow50MA || isBelowPivot) {
    watchlistCategory = "失敗型態";
    watchlistCategoryEn = "Failed Setup";
  } else if (profile === "breakout") {
    watchlistCategory = "今日突破";
    watchlistCategoryEn = "Breakout Today";
  } else if (profile === "overextended") {
    watchlistCategory = "過度延伸";
    watchlistCategoryEn = "Extended";
  } else if (consecutiveDays >= 10 && rsRanking >= 75 && trendTemplate.passed) {
    watchlistCategory = "核心觀察股";
    watchlistCategoryEn = "Core Watchlist";
  } else if (lastClose >= buyPoint * 0.94 && lastClose <= buyPoint * 1.05) {
    watchlistCategory = "接近買點";
    watchlistCategoryEn = "Near Pivot";
  }

  return {
    ticker,
    name,
    marketType,
    country,
    lastClose,
    changePercent,
    volume,
    avgVolume20,
    high52Week,
    low52Week,
    rsRanking,
    trendTemplate,
    sepaScore,
    pattern,
    buyPoint,
    stopLoss,
    riskPercent,
    status,
    statusEn,
    consecutiveDays,
    watchlistCategory,
    watchlistCategoryEn,
    suggestion,
    targetPrice1,
    targetPrice2,
    pctToBuyPoint,
    vcpPhaseDesc,
    klines: finalKlines,
  };
}

/**
 * Shared Data Registry for stocks loaded from live backend endpoints
 */
export class DataProvider {
  private static twStocks: StockAnalysis[] = [];
  private static usStocks: StockAnalysis[] = [];
  private static weights: SepaWeights = DEFAULT_WEIGHTS;
  private static lastUpdated: string = "2026-05-27 15:30:00 CST";
  private static taiexVal = { price: 27150.80, changePercent: 1.15, date: "2026-05-27" };
  private static nasdaqVal = { price: 16920.58, changePercent: 0.85, date: "2026-05-27" };

  public static async loadFromAPI(force = false, customWeights?: SepaWeights): Promise<boolean> {
    if (customWeights) {
      this.weights = customWeights;
    }
    try {
      const url = `/api/market-data${force ? "?force=true" : ""}`;
      console.log(`[DataProvider] Fetching market data from API: ${url}`);
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP Error status ${res.status}`);
      }
      const data = await res.json();
      if (data) {
        if (data.lastUpdated) this.lastUpdated = data.lastUpdated;
        if (data.taiex) this.taiexVal = data.taiex;
        if (data.nasdaq) this.nasdaqVal = data.nasdaq;
        if (data.twStocks) this.twStocks = data.twStocks;
        if (data.usStocks) this.usStocks = data.usStocks;

        // Recalculate score on client side based on settings weights
        this.twStocks = this.twStocks.map(s => this.recalculateScore(s));
        this.usStocks = this.usStocks.map(s => this.recalculateScore(s));
        console.log(`[DataProvider] Successfully populated stats from live API. TAIEX: ${this.taiexVal.price}`);
        return true;
      }
    } catch (err) {
      console.error("[DataProvider] API retrieval failed. CORS, block, or offline. Engaging robust seed fallback.", err);
    }
    
    // In case API completely fails/timeout/CORS/offline, we do a high-fidelity local generation
    this.initialize(customWeights);
    return false;
  }

  public static initialize(customWeights?: SepaWeights) {
    if (customWeights) {
      this.weights = customWeights;
    }

    const todayStr = new Date().toISOString().split("T")[0];
    this.lastUpdated = `${todayStr} 15:30:00 CST`;

    const twStockDefs = [
      { ticker: "2330", name: "台積電", market: "上市", seed: 940, profile: "vcp-tight", rs: 91, mainIndustry: "電子類", subIndustry: "半導體" },
      { ticker: "2317", name: "鴻海", market: "上市", seed: 180, profile: "breakout", rs: 88, mainIndustry: "電子類", subIndustry: "AI 伺服器" },
      { ticker: "2454", name: "聯發科", market: "上市", seed: 1150, profile: "flat-base", rs: 82, mainIndustry: "電子類", subIndustry: "半導體" },
      { ticker: "3008", name: "大立光", market: "上市", seed: 2600, profile: "downtrend", rs: 38, mainIndustry: "電子類", subIndustry: "半導體" },
      { ticker: "1519", name: "華城", market: "上市", seed: 680, profile: "overextended", rs: 96, mainIndustry: "傳產類", subIndustry: "" },
      { ticker: "3231", name: "緯創", market: "上市", seed: 110, profile: "forming-vcp", rs: 72, mainIndustry: "電子類", subIndustry: "AI 伺服器" },
      { ticker: "2382", name: "廣達", market: "上市", seed: 250, profile: "vcp-tight", rs: 85, mainIndustry: "電子類", subIndustry: "AI 伺服器" },
      { ticker: "1513", name: "中興電", market: "上市", seed: 165, profile: "vcp-tight", rs: 83, mainIndustry: "傳產類", subIndustry: "" },
      { ticker: "2603", name: "長榮", market: "上市", seed: 170, profile: "overextended", rs: 84, mainIndustry: "傳產類", subIndustry: "" },
      { ticker: "2308", name: "台達電", market: "上市", seed: 320, profile: "forming-vcp", rs: 74, mainIndustry: "電子類", subIndustry: "電源 / 功率半導體" },
      { ticker: "3653", name: "健策", market: "上市", seed: 920, profile: "breakout", rs: 93, mainIndustry: "電子類", subIndustry: "散熱" },
      { ticker: "2337", name: "旺宏", market: "上市", seed: 24, profile: "downtrend", rs: 31, mainIndustry: "電子類", subIndustry: "半導體" },
      { ticker: "3481", name: "群創", market: "上市", seed: 14, profile: "downtrend", rs: 41, mainIndustry: "電子類", subIndustry: "半導體" },
      { ticker: "2303", name: "聯電", market: "上市", seed: 51, profile: "forming-vcp", rs: 55, mainIndustry: "電子類", subIndustry: "半導體" },
      { ticker: "2881", name: "富邦金", market: "上市", seed: 75, profile: "flat-base", rs: 78, mainIndustry: "金融類", subIndustry: "" },
      { ticker: "2882", name: "國泰金", market: "上市", seed: 58, profile: "forming-vcp", rs: 72, mainIndustry: "金融類", subIndustry: "" },
      { ticker: "3037", name: "欣興", market: "上市", seed: 180, profile: "vcp-tight", rs: 81, mainIndustry: "電子類", subIndustry: "PCB / ABF" },
      { ticker: "8046", name: "南電", market: "上市", seed: 210, profile: "forming-vcp", rs: 68, mainIndustry: "電子類", subIndustry: "PCB / ABF" },
      { ticker: "2368", name: "金像電", market: "上市", seed: 232, profile: "breakout", rs: 86, mainIndustry: "電子類", subIndustry: "PCB / ABF" },
      { ticker: "3017", name: "奇鋐", market: "上市", seed: 650, profile: "vcp-tight", rs: 92, mainIndustry: "電子類", subIndustry: "散熱" },
      { ticker: "3324", name: "雙鴻", market: "上市", seed: 720, profile: "breakout", rs: 94, mainIndustry: "電子類", subIndustry: "散熱" },
      { ticker: "2301", name: "光寶科", market: "上市", seed: 110, profile: "forming-vcp", rs: 70, mainIndustry: "電子類", subIndustry: "電源 / 功率半導體" },
      { ticker: "6415", name: "矽力*-KY", market: "上市", seed: 380, profile: "vcp-tight", rs: 75, mainIndustry: "電子類", subIndustry: "電源 / 功率半導體" },
      { ticker: "3711", name: "日月光投控", market: "上市", seed: 155, profile: "flat-base", rs: 80, mainIndustry: "電子類", subIndustry: "半導體" },
      { ticker: "2449", name: "京元電子", market: "上市", seed: 115, profile: "breakout", rs: 84, mainIndustry: "電子類", subIndustry: "半導體" },
      { ticker: "6669", name: "緯穎", market: "上市", seed: 1800, profile: "vcp-tight", rs: 89, mainIndustry: "電子類", subIndustry: "AI 伺服器" },
      { ticker: "2383", name: "台光電", market: "上市", seed: 380, profile: "forming-vcp", rs: 87, mainIndustry: "電子類", subIndustry: "PCB / ABF" },
    ];

    const usStockDefs = [
      { ticker: "NVDA", name: "NVIDIA Corp.", market: "NASDAQ", seed: 110, profile: "breakout", rs: 97 },
      { ticker: "MSFT", name: "Microsoft Corp.", market: "NASDAQ", seed: 410, profile: "vcp-tight", rs: 88 },
      { ticker: "AAPL", name: "Apple Inc.", market: "NASDAQ", seed: 175, profile: "flat-base", rs: 79 },
      { ticker: "TSLA", name: "Tesla Inc.", market: "NASDAQ", seed: 210, profile: "downtrend", rs: 43 },
      { ticker: "PLTR", name: "Palantir Technologies", market: "NYSE", seed: 22, profile: "overextended", rs: 96 },
      { ticker: "LLY", name: "Eli Lilly & Co", market: "NYSE", seed: 750, profile: "overextended", rs: 94 },
      { ticker: "AVGO", name: "Broadcom Inc.", market: "NASDAQ", seed: 1350, profile: "vcp-tight", rs: 91 },
      { ticker: "AMD", name: "Advanced Micro Devices", market: "NASDAQ", seed: 160, profile: "forming-vcp", rs: 74 },
      { ticker: "META", name: "Meta Platforms", market: "NASDAQ", seed: 460, profile: "vcp-tight", rs: 90 },
      { ticker: "AMZN", name: "Amazon.com Inc.", market: "NASDAQ", seed: 170, profile: "flat-base", rs: 82 },
      { ticker: "NFLX", name: "Netflix Inc.", market: "NASDAQ", seed: 580, profile: "breakout", rs: 89 },
      { ticker: "COIN", name: "Coinbase Global", market: "NASDAQ", seed: 190, profile: "overextended", rs: 92 },
      { ticker: "SMCI", name: "Super Micro Computer", market: "NASDAQ", seed: 650, profile: "downtrend", rs: 51 },
      { ticker: "CRWD", name: "CrowdStrike Holdings", market: "NASDAQ", seed: 280, profile: "forming-vcp", rs: 81 },
      { ticker: "NET", name: "Cloudflare Inc.", market: "NYSE", seed: 90, profile: "vcp-tight", rs: 83 },
      { ticker: "MSTR", name: "MicroStrategy", market: "NASDAQ", seed: 1200, profile: "overextended", rs: 95 },
      { ticker: "SMH", name: "Semiconductor ETF", market: "NASDAQ", seed: 220, profile: "flat-base", rs: 85 },
      { ticker: "CELH", name: "Celsius Holdings", market: "NASDAQ", seed: 75, profile: "downtrend", rs: 52 },
    ];

    const rawTwStocks = twStockDefs.map(def => {
      const stock = generateStockHistory(
        def.ticker + ".TW",
        def.name,
        def.market,
        "TW",
        def.seed,
        def.profile as any,
        def.rs
      );
      stock.mainIndustry = def.mainIndustry;
      stock.subIndustry = def.subIndustry;
      return this.recalculateScore(stock);
    });

    // Store all generated candidate stocks so client-side parameters can dynamically filter them
    this.twStocks = rawTwStocks.filter(stock => {
      const passDays = stock.klines && stock.klines.length >= 50;
      return passDays && stock.lastClose >= 5;
    });

    this.usStocks = usStockDefs.map(def => 
      this.recalculateScore(
        generateStockHistory(
          def.ticker,
          def.name,
          def.market,
          "US",
          def.seed,
          def.profile as any,
          def.rs
        )
      )
    );
  }

  // Live recalculator of SEPA Scores based on settings weights
  private static recalculateScore(stock: StockAnalysis): StockAnalysis {
    const rawSepa = stock.sepaScore;
    const weights = this.weights;

    // Normalize elements with custom weights so they sum up to maximum of 100 points
    const trendWeightRatio = weights.trendTemplate / 40;
    const rsWeightRatio = weights.rsStrength / 20;
    const vcpWeightRatio = weights.vcpPattern / 20;
    const volWeightRatio = weights.volumeDryUp / 10;
    const rrWeightRatio = weights.riskReward / 10;

    const weightedTrend = rawSepa.trendTemplate * trendWeightRatio;
    const weightedRS = rawSepa.rsStrength * rsWeightRatio;
    const weightedVCP = rawSepa.vcpPattern * vcpWeightRatio;
    const weightedVol = rawSepa.volumeDryUp * volWeightRatio;
    const weightedRR = rawSepa.riskReward * rrWeightRatio;

    const total = Math.min(100, Math.round(
      weightedTrend + weightedRS + weightedVCP + weightedVol + weightedRR
    ));

    stock.sepaScore = {
      ...rawSepa,
      total,
    };

    return stock;
  }

  public static getTwStocks(weights?: SepaWeights): StockAnalysis[] {
    if (this.twStocks.length === 0) {
      this.initialize(weights);
    } else if (weights) {
      this.weights = weights;
      this.twStocks = this.twStocks.map(s => this.recalculateScore(s));
    }
    return [...this.twStocks];
  }

  public static getUsStocks(weights?: SepaWeights): StockAnalysis[] {
    if (this.usStocks.length === 0) {
      this.initialize(weights);
    } else if (weights) {
      this.weights = weights;
      this.usStocks = this.usStocks.map(s => this.recalculateScore(s));
    }
    return [...this.usStocks];
  }

  public static getStockByTicker(ticker: string): StockAnalysis | undefined {
    if (this.twStocks.length === 0 || this.usStocks.length === 0) {
      this.initialize();
    }
    const cleanTicker = ticker.toUpperCase();
    const twMatch = this.twStocks.find(s => s.ticker.toUpperCase() === cleanTicker || s.ticker.split(".")[0].toUpperCase() === cleanTicker);
    if (twMatch) return twMatch;
    return this.usStocks.find(s => s.ticker.toUpperCase() === cleanTicker);
  }

  public static getLastUpdated(): string {
    return this.lastUpdated;
  }

  public static getTaiex() {
    return this.taiexVal;
  }

  public static getNasdaq() {
    return this.nasdaqVal;
  }
}
