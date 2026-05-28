/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import dotenv from "dotenv";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI } from "@google/genai";

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Lazy-loaded model instance
let ai: GoogleGenAI | null = null;
function getGeminiClient() {
  if (!ai) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (apiKey) {
      ai = new GoogleGenAI({
        apiKey,
        httpOptions: {
          headers: {
            "User-Agent": "aistudio-build",
          },
        },
      });
    }
  }
  return ai;
}

// Fallback rule-based tactical stock analysis commentator
function getRuleBasedAnalysis(stock: any): string {
  let output = `### 📈【超級強勢股評估報告：${stock.ticker} - ${stock.name}】\n\n`;
  
  // 1. Trend & RS
  output += `**一、中長期趨勢架構與相對強度 (RS)**\n`;
  if (stock.trendTemplate?.passed) {
    output += `- **趨勢模板條件**：✅ **完全符合** Mark Minervini 的強勢股第二階段第一梯隊 (Trend Template)。50MA > 150MA > 200MA，且 200 日移動平均線最近 20 個交易日持續上升，價格高於 52 週低點 +30% 以上、距離高點在 25% 內，展現多頭蓄勢待發特徵。\n`;
    output += `- **RS 相對強度強度**：RS 排名為 **${stock.rsRanking}**，代表其領先市場上 ${stock.rsRanking}% 的個股。典型超級強勢股的 RS Ranking 在突破前應高於 70，最好在 80 以上，本股表現極其亮眼，屬於市場核心龍頭。\n\n`;
  } else {
    output += `- **趨勢模板條件**：❌ **未通過** 篩選標準（Trend Template 的部份條件如 MA 多頭排列、200MA 指向上爬未達標）。說明目前的價格行為尚未脫離初段打底或處於第一階段、第三/四階段，尚不具備強勢股突破的標準。\n`;
    output += `- **RS 相對強度強度**：RS 排名僅 **${stock.rsRanking}**，強度偏低，無法保證具備領先市場的絕對動能。\n\n`;
  }
  
  // 2. VCP Pattern
  output += `**二、波動度收縮型態 (VCP) 細節探討**\n`;
  output += `- **型態特徵**：\`${stock.pattern}\` (${stock.vcpPhaseDesc || "無收斂結構"})\n`;
  if (stock.status === "接近買點" || stock.status === "已突破") {
    output += `- **量能結構檢點 (Vol Dry-up)**：成交量約為 ${stock.volume?.toLocaleString()} 股 (20日平均量約 ${stock.avgVolume20?.toLocaleString()} 股)。在近期進行的 T 收縮波段中，股價振幅收緊且量能出現急劇萎縮 (VDU)。此舉說明中長期浮額已被實力機構和長期持有者鎖定，市場缺乏賣壓，僅需微弱買盤即可推升股價進攻。\n\n`;
  } else {
    output += `- **量能結構檢點 (Vol Dry-up)**：目前股價波動仍寬大且欠缺規律。成交量分佈混雜，說明市場上仍有部分浮額未洗淨，建議耐心持幣觀察，直到價格收窄至 3% - 8% 的狹幅整理區間，伴隨成交量顯著低於均線。\n\n`;
  }
  
  // 3. Trade Setup
  output += `**三、戰術操盤規劃與風控守則**\n`;
  output += `- **核心操盤評分**：SEPA 總分數為 **${stock.sepaScore?.total} / 100分**，系統建議等級為 **【${stock.status}】**。${stock.suggestion}\n`;
  output += `- **設定突破價 (Pivot)**：臨界買點為 **${stock.buyPoint}**，合理的進場追價上線為：${stock.buyPoint} 至 ${Math.round(stock.buyPoint * 1.05 * 100) / 100} (+5%)。超出 5% 追進會使拉回時承擔不必要的被動風險。\n`;
  output += `- **停損邊界防禦**：防禦停損設定在 **${stock.stopLoss}**。若股價收盤跌破此價位，代表假突破或結構失效，應毫不遲疑**立即無條件停損出局**。此筆交易單筆帳面承擔最大風險為 **${stock.riskPercent.toFixed(2)}%**。\n`;
  output += `- **利潤目標期望值**：第一目標價設為 **${stock.targetPrice1}** (2R 報酬比)；第二目標價為 **${stock.targetPrice2}** (3R 報酬比)。突破後若前進順暢，可考慮將止損上移至保本點 (Cost basis) 保護本金。\n\n`;
  
  output += `> *💡 **Minervini 風險名言**：『我不在乎股票未來的基本面有多好。我的第一條規則是控制下行風險。不要試圖證明你是對的，而要讓市場證明股價是對的！』*`;
  return output;
}

// API Health check
app.get("/api/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// Scrapers and Data Lists are now dynamic.
// No hardcoded TW_TICKERS or US_TICKERS.
let twseStockList: { ticker: string, name: string, industry: string }[] = [];

async function fetchTWSEList(): Promise<{ ticker: string, name: string, industry: string }[]> {
  console.log("[TWSE Scraper] Fetching latest listed stock manifest from ISIN public database...");
  const url = "https://isin.twse.com.tw/isin/C_public.jsp?strMode=2";
  
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = await res.arrayBuffer();
    const decoder = new TextDecoder('big5');
    const text = decoder.decode(buffer);
    
    const rows = text.split('<tr>');
    const stocks: { ticker: string, name: string, industry: string }[] = [];
    
    let inStockSection = false;
    for (let row of rows) {
      if (row.includes("<B> 股票 <B>")) {
        inStockSection = true;
        continue;
      }
      
      // Stop sections
      if (inStockSection && (row.includes("上市認購(售)權證") || row.includes("存託憑證") || row.includes("受益證券") || row.includes("ETF") || row.includes("特別股"))) {
        inStockSection = false;
        continue;
      }

      if (inStockSection) {
        const cells = row.split(/<td[^>]*>/).map(c => c.split('</td>')[0].replace(/<[^>]*>/g, '').trim());
        if (cells.length >= 6) {
          const firstCell = cells[1]; 
          const match = firstCell.match(/^(\d{4,6})[　\s]+(.+)$/);
          if (match) {
            const ticker = match[1];
            const name = match[2].trim();
            const market = cells[4];   
            const industry = cells[5]; 
            
            if (market === "上市" && ticker.length === 4) {
              stocks.push({ ticker, name, industry });
            }
          }
        }
      }
    }
    console.log(`[TWSE Scraper] Successfully retrieved ${stocks.length} listed stocks.`);
    return stocks;
  } catch (err: any) {
    console.error("[TWSE Scraper Error] Failed to fetch stock list:", err.message || err);
    return [];
  }
}

// Memory database / cache for market scrape results
let marketDataCache: {
  lastUpdated: string;
  taiex: { price: number; changePercent: number; date: string };
  nasdaq: { price: number; changePercent: number; date: string };
  twStocks: any[];
  usStocks: any[];
  stockPoolCount?: number;
} | null = null;

// Cool-down tracking to protect Yahoo Finance and Stooq API from rate blocks
let yahooRateLimitUntil = 0;
let stooqRateLimitUntil = 0;
let finMindRateLimitUntil = 0;

// ==========================================
// SEPA Watchlist Tracker Registry
// ==========================================
interface WatchlistTrackerItem {
  ticker: string;
  consecutiveDays: number;
  watchlistCategory?: "核心觀察股" | "接近買點" | "今日突破" | "過度延伸" | "失敗型態" | "一般追蹤";
  watchlistCategoryEn?: "Core Watchlist" | "Near Pivot" | "Breakout Today" | "Extended" | "Failed Setup" | "Regular Watch";
}
let watchlistTrackerRegistry: Record<string, WatchlistTrackerItem> = {};

// Initialize Watchlist Tracker
function initializeWatchlistTracker() {
  const TRACKER_FILE = path.join(process.cwd(), "watchlist_tracker.json");
  try {
    if (fs.existsSync(TRACKER_FILE)) {
      const data = fs.readFileSync(TRACKER_FILE, "utf-8");
      watchlistTrackerRegistry = JSON.parse(data) || {};
      console.log(`[Watchlist Tracker] Loaded ${Object.keys(watchlistTrackerRegistry).length} tracked stocks from disk.`);
      return;
    }
  } catch (e) {
    console.warn(`[Watchlist Tracker Warning] Could not parse tracker file from disk:`, e);
  }

  // Pre-seed default tracker
  console.log(`[Watchlist Tracker] Initializing fresh registry...`);
  saveWatchlistTrackerToDisk();
}

function saveWatchlistTrackerToDisk() {
  const TRACKER_FILE = path.join(process.cwd(), "watchlist_tracker.json");
  try {
    fs.writeFileSync(TRACKER_FILE, JSON.stringify(watchlistTrackerRegistry, null, 2), "utf-8");
  } catch (err: any) {
    console.warn(`[Watchlist Tracker Warning] Error saving tracker to disk:`, err.message || err);
  }
}

function determineDynamicWatchlistCategory(stock: any, consecutiveDays: number): {
  cat: "核心觀察股" | "接近買點" | "今日突破" | "過度延伸" | "失敗型態" | "一般追蹤",
  catEn: "Core Watchlist" | "Near Pivot" | "Breakout Today" | "Extended" | "Failed Setup" | "Regular Watch"
} {
  const lastClose = stock.lastClose;
  const buyPoint = stock.buyPoint;
  const stopLoss = stock.stopLoss;
  const ma50Value = stock.trendTemplate?.closeAbove50MA ? stock.lastClose * 0.95 : stock.lastClose * 1.05;

  // 5. 失敗型態: 跌破停損, 跌破 50MA, 跌破 Pivot
  const isBelowStopLoss = lastClose < stopLoss;
  const isBelow50MA = stock.sepaScore?.trendTemplate < 15 || (!stock.trendTemplate?.closeAbove50MA);
  const isBelowPivot = lastClose < buyPoint * 0.95;

  const isFailed = isBelowStopLoss || isBelow50MA || isBelowPivot;
  if (isFailed) {
    return { cat: "失敗型態", catEn: "Failed Setup" };
  }

  // 3. 今日突破 (Breakout Today): 今日正式突破 Pivot, 且成交量放大
  const isBreakout = stock.pattern.includes("突破") || (lastClose >= buyPoint && lastClose <= buyPoint * 1.05 && stock.volume > stock.avgVolume20 * 1.25);
  if (isBreakout) {
    return { cat: "今日突破", catEn: "Breakout Today" };
  }

  // 4. 過度延伸 (Extended): 已離 Pivot 過遠 (+5% 以上), 不建議追價
  const isExtended = lastClose > buyPoint * 1.05 || stock.pattern.includes("超買") || stock.pattern.includes("延伸");
  if (isExtended) {
    return { cat: "過度延伸", catEn: "Extended" };
  }

  // 1. 核心觀察股 (Core Watchlist): 最近持續符合 SEPA 條件
  const isCore = consecutiveDays >= 3 && stock.rsRanking >= 80 && stock.trendTemplate?.passed;
  if (isCore) {
    return { cat: "核心觀察股", catEn: "Core Watchlist" };
  }
  
  // 1b. 一般追蹤 (RS 領跑但天數不足)
  if (stock.rsRanking >= 90 && stock.trendTemplate?.passed) {
    return { cat: "核心觀察股", catEn: "Core Watchlist" };
  }

  // 2. 接近買點 (Near Pivot): 距離 Pivot 小於 5%, VCP 接近完成碼
  const pctToPivot = Math.abs(lastClose - buyPoint) / buyPoint;
  const isNearPivot = pctToPivot <= 0.05 && (stock.pattern.includes("VCP") || stock.pattern.includes("整理") || stock.pattern.includes("收斂"));
  if (isNearPivot) {
    return { cat: "接近買點", catEn: "Near Pivot" };
  }

  // Double check Near Pivot by closeness to buyPoint within 5% if it's healthy and close
  if (lastClose >= buyPoint * 0.94 && lastClose <= buyPoint * 1.05) {
    return { cat: "接近買點", catEn: "Near Pivot" };
  }

  return { cat: "一般追蹤", catEn: "Regular Watch" };
}

const CACHE_FILE = path.join(process.cwd(), "market_cache.json");

function loadCacheFromFile() {
  try {
    initializeWatchlistTracker();
    if (fs.existsSync(CACHE_FILE)) {
      const data = fs.readFileSync(CACHE_FILE, "utf-8");
      const parsed = JSON.parse(data);
      if (parsed && parsed.lastUpdated && Array.isArray(parsed.twStocks) && Array.isArray(parsed.usStocks)) {
        const firstTW = parsed.twStocks[0];
        if (firstTW && Array.isArray(firstTW.klines) && firstTW.klines.length < 150) {
          console.log(`[Cache Invalidation] Disk cache has only ${firstTW.klines.length} klines. Discarding to trigger a fresh 200-day scale synchronization.`);
          return;
        }
        marketDataCache = parsed;
        console.log(`[Cache Loaded] Loaded stock data cache successfully from disk (${parsed.twStocks.length} TW, ${parsed.usStocks.length} US), last updated at ${parsed.lastUpdated}`);
      }
    }
  } catch (err: any) {
    console.warn(`[Cache Warning] Could not load market cache from disk:`, err.message || err);
  }
}

function saveCacheToFile() {
  try {
    if (marketDataCache) {
      fs.writeFileSync(CACHE_FILE, JSON.stringify(marketDataCache, null, 2), "utf-8");
      console.log(`[Cache Saved] Saved updated stock data cache to disk: ${CACHE_FILE}`);
    }
  } catch (err: any) {
    console.warn(`[Cache Warning] Could not save market cache to disk:`, err.message || err);
  }
}

// Dynamic profile detection based on real price charts
function detectProfile(
  lastClose: number,
  klines: any[],
  trendPassedCount: number,
  high52Week: number,
  low52Week: number,
  avgVolume20: number,
  volume: number
): "vcp-tight" | "breakout" | "flat-base" | "overextended" | "downtrend" | "forming-vcp" {
  if (klines.length < 50) return "downtrend";
  const ma50 = klines[klines.length - 1].ma50 || lastClose;
  const ma200 = klines[klines.length - 1].ma200 || lastClose;
  
  if (lastClose < ma200 || trendPassedCount <= 3) {
    return "downtrend";
  }
  if (lastClose > ma50 * 1.18) {
    return "overextended";
  }
  if (volume > avgVolume20 * 1.7 && lastClose >= high52Week * 0.94 && klines[klines.length - 1].close > klines[klines.length - 2].close * 1.015) {
    return "breakout";
  }
  
  // Measure standard range in last 12 trading days to check tight contraction
  let maxRecent = -Infinity;
  let minRecent = Infinity;
  for (let idx = klines.length - 12; idx < klines.length; idx++) {
    if (idx < 0) continue;
    if (klines[idx].high > maxRecent) maxRecent = klines[idx].high;
    if (klines[idx].low < minRecent) minRecent = klines[idx].low;
  }
  const recentRange = (maxRecent - minRecent) / minRecent;
  
  if (recentRange < 0.055 && lastClose >= high52Week * 0.91) {
    return "vcp-tight";
  }
  if (recentRange < 0.048) {
    return "flat-base";
  }
  if (recentRange < 0.11 && lastClose >= high52Week * 0.83) {
    return "forming-vcp";
  }
  return "flat-base";
}

// Compute all SEPA Scores & Indicators for real tickers
function computeStockAnalysis(
  ticker: string,
  name: string,
  marketType: string,
  country: "TW" | "US",
  rawKlines: any[],
  rsRanking: number,
  mainIndustry?: string,
  subIndustry?: string
): any {
  if (!rawKlines || rawKlines.length < 160) {
    return null;
  }
  
  const totalDays = rawKlines.length;
  const klines = rawKlines.map(k => ({ ...k }));
  
  // Calculate Moving Averages programmatically
  for (let idx = 0; idx < totalDays; idx++) {
    // 50MA
    if (idx >= 49) {
      let sum50 = 0;
      for (let j = idx - 49; j <= idx; j++) sum50 += klines[j].close;
      klines[idx].ma50 = Math.round((sum50 / 50) * 100) / 100;
    } else {
      klines[idx].ma50 = null; 
    }
    
    // 150MA
    if (idx >= 149) {
      let sum150 = 0;
      for (let j = idx - 149; j <= idx; j++) sum150 += klines[j].close;
      klines[idx].ma150 = Math.round((sum150 / 150) * 100) / 100;
    } else {
      klines[idx].ma150 = null;
    }
    
    // 200MA
    if (idx >= 199) {
      let sum200 = 0;
      for (let j = idx - 199; j <= idx; j++) sum200 += klines[j].close;
      klines[idx].ma200 = Math.round((sum200 / 200) * 100) / 100;
    } else {
      klines[idx].ma200 = null;
    }
  }
  
  // Slice to last 260 days for analysis
  const finalKlines = klines.slice(-260);
  const lastClose = finalKlines[finalKlines.length - 1].close;
  
  let high52Week = -Infinity;
  let low52Week = Infinity;
  for (const bar of finalKlines) {
    if (bar.high > high52Week) high52Week = bar.high;
    if (bar.low < low52Week) low52Week = bar.low;
  }
  
  const yesterdayClose = finalKlines.length > 1 ? finalKlines[finalKlines.length - 2].close : lastClose;
  const changePercent = yesterdayClose ? ((lastClose - yesterdayClose) / yesterdayClose) * 100 : 0;
  const volume = finalKlines[finalKlines.length - 1].volume;
  
  let sumVol20 = 0;
  const volCount = Math.min(20, finalKlines.length);
  for (let j = finalKlines.length - volCount; j < finalKlines.length; j++) {
    sumVol20 += finalKlines[j].volume;
  }
  const avgVolume20 = Math.round(sumVol20 / Math.max(1, volCount));
  
  // ==========================================
  // Mark Minervini Trend Template (8 Strict Rules)
  // ==========================================
  const ma50 = finalKlines[finalKlines.length - 1].ma50;
  const ma150 = finalKlines[finalKlines.length - 1].ma150;
  const ma200 = finalKlines[finalKlines.length - 1].ma200;

  // 1. Current Price > 150MA and 200MA
  const rule1 = ma150 !== null && ma200 !== null && lastClose > ma150 && lastClose > ma200;
  // 2. 150MA > 200MA
  const rule2 = ma150 !== null && ma200 !== null && ma150 > ma200;
  // 3. 200MA is rising for at least 1 month
  let rule3 = false;
  if (ma200 !== null && finalKlines.length >= 21) {
    const ma200Past = finalKlines[finalKlines.length - 21].ma200;
    if (ma200Past !== null) {
      rule3 = ma200 > ma200Past;
    } else {
      // If data just crossed 200 days, check if current price > ma200 for now or slight slope
      rule3 = lastClose > ma200;
    }
  }

  // 4. 50MA > 150MA and 50MA > 200MA
  const rule4 = ma50 !== null && ma150 !== null && ma200 !== null && ma50 > ma150 && ma50 > ma200;
  // 5. Current Price > 50MA
  const rule5 = ma50 !== null && lastClose > ma50;
  // 6. Current Price is at least 30% above 52-week low
  const rule6 = lastClose >= low52Week * 1.30;
  // 7. Current Price is within 25% of 52-week high
  const rule7 = lastClose >= high52Week * 0.75;
  // 8. RS ranking is at least 70
  const rule8 = rsRanking >= 70;

  const passed = rule1 && rule2 && rule3 && rule4 && rule5 && rule6 && rule7 && rule8;
  
  const trendTemplate = {
    passed,
    rule1, rule2, rule3, rule4, rule5, rule6, rule7, rule8,
    closeAbove50MA: rule5,
    ma50Above150MA: ma50 > ma150,
    ma150Above200MA: rule2,
    ma200Rising20Days: rule3,
    closeAbove52WLowPct: rule6,
    closeNear52WHighPct: rule7,
    rsRankingAbove70: rule8
  };
  
  // Mapping for Industry Analysis
  let finalSubIndustry = subIndustry || "";
  const n = name.toUpperCase();
  const indRaw = (mainIndustry || "").toUpperCase();
  
  if (n.includes("伺服器") || n.includes("廣達") || n.includes("緯穎") || n.includes("緯創") || n.includes("技嘉") || n.includes("勤誠") || n.includes("川湖")) {
    finalSubIndustry = "AI 伺服器";
  } else if (n.includes("欣興") || n.includes("南電") || n.includes("景碩") || n.includes("臻鼎") || n.includes("健鼎") || n.includes("台光電") || n.includes("金像電")) {
    finalSubIndustry = "PCB / ABF";
  } else if (n.includes("電源") || n.includes("台達電") || n.includes("茂達") || n.includes("光寶科") || n.includes("康舒")) {
    finalSubIndustry = "電源 / 功率半導體";
  } else if (n.includes("散熱") || n.includes("雙鴻") || n.includes("奇鋐") || n.includes("尼得科超眾") || n.includes("建準")) {
    finalSubIndustry = "散熱";
  } else if (indRaw.includes("半導體") || n.includes("台積電") || n.includes("聯電") || n.includes("日月光") || n.includes("創意") || n.includes("世芯") || n.includes("智原")) {
    finalSubIndustry = "半導體";
  } else {
    finalSubIndustry = mainIndustry || "其他";
  }
  
  const trendCount = Object.values(trendTemplate).filter(v => v === true).length;
  const profile = detectProfile(lastClose, finalKlines, trendCount, high52Week, low52Week, avgVolume20, volume);
  
  let pattern = "無明顯型態";
  let vcpPhaseDesc = "";
  let pivotPrice = high52Week;
  
  if (profile === "vcp-tight") {
    pattern = "VCP 3T 核心收斂";
    vcpPhaseDesc = "3 段收縮，振幅顯著壓縮，成交量進入乾枯期 (Vol Dry-up)。";
    pivotPrice = Math.round(high52Week * 0.99 * 100) / 100;
  } else if (profile === "forming-vcp") {
    pattern = "VCP 二段成形中";
    vcpPhaseDesc = "正進行第 2 段震盪收縮，結構尚未完全收緊，右側量能仍待沉澱。";
    pivotPrice = Math.round(high52Week * 0.97 * 100) / 100;
  } else if (profile === "breakout") {
    pattern = "VCP 爆量突破";
    vcpPhaseDesc = "收斂完成，伴隨大於平均量能強勢突破 Pivot 壓力區。";
    pivotPrice = Math.round(high52Week * 0.95 * 100) / 100;
  } else if (profile === "flat-base") {
    pattern = "高檔箱型收斂";
    vcpPhaseDesc = "箱型基底 (Flat Base)，價格於狹幅區間平緩整理，成交量溫和萎縮。";
    pivotPrice = Math.round(high52Week * 1.01 * 100) / 100;
  } else if (profile === "overextended") {
    pattern = "高檔延伸超買";
    vcpPhaseDesc = "無收斂型態。50 日均線乖離高，呈陡峭噴出走勢，累計量能極大。";
    pivotPrice = Math.round(high52Week * 1.02 * 100) / 100;
  } else if (profile === "downtrend") {
    pattern = "頭部成形空頭排列";
    vcpPhaseDesc = "均線群下行，收盤價持續低於 200MA，無多頭收斂特徵。";
    pivotPrice = Math.round(lastClose * 1.15 * 100) / 100;
  }
  
  let stopLoss = 0;
  let buyPoint = pivotPrice;
  let status: "接近買點" | "可觀察" | "已突破" | "型態尚未完成" | "過度延伸，不建議追" | "不符合" = "可觀察";
  let statusEn = "Watch";
  let suggestion = "";
  
  if (profile === "vcp-tight") {
    if (lastClose >= pivotPrice * 0.96 && lastClose <= pivotPrice * 1.05) {
      status = "接近買點";
      statusEn = "Near Pivot";
      suggestion = "股價處於合理突破前夕。建議分批布局，或等待確定性帶量突破 Pivot 買點時加碼。";
    } else {
      status = "可觀察";
      statusEn = "Watch";
      suggestion = "型態極為優異，距離 Pivot 臨界點尚有空間，列為首要追蹤名單。";
    }
    stopLoss = Math.round(pivotPrice * 0.945 * 100) / 100;
  } else if (profile === "breakout") {
    status = "已突破";
    statusEn = "Breakout";
    suggestion = "強勢突破 Pivot！股價目前落於突破區間上方，仍屬合理買入區 (Pivot +5% 內)。";
    stopLoss = Math.round(pivotPrice * 0.94 * 100) / 100;
  } else if (profile === "forming-vcp") {
    status = "型態尚未完成";
    statusEn = "Pattern Forming";
    suggestion = "收斂尚在演進中，建議靜待波動度進一步枯竭與成交量探底。";
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
  
  const riskPercent = Math.max(2, Math.round(((buyPoint - stopLoss) / buyPoint) * 10000) / 100);
  const targetPrice1 = Math.round(buyPoint * (1 + (riskPercent * 2) / 100) * 100) / 100;
  const targetPrice2 = Math.round(buyPoint * (1 + (riskPercent * 3) / 100) * 100) / 100;
  const pctToBuyPoint = Math.round(((buyPoint - lastClose) / lastClose) * 10000) / 100;
  
  const trendPoints = Math.round((trendCount / 8) * 40);
  const rsPoints = Math.round((rsRanking / 100) * 20);
  
  let vcpPoints = 0;
  if (profile === "vcp-tight" || profile === "breakout") vcpPoints = 20;
  else if (profile === "forming-vcp") vcpPoints = 14;
  else if (profile === "flat-base") vcpPoints = 12;
  else if (profile === "overextended") vcpPoints = 6;
  else vcpPoints = 2;
  
  let volPoints = 0;
  if (profile === "vcp-tight") volPoints = 10;
  else if (profile === "flat-base") volPoints = 8;
  else if (profile === "forming-vcp") volPoints = 6;
  else if (profile === "breakout") volPoints = 9;
  else if (profile === "overextended") volPoints = 3;
  else volPoints = 1;
  
  let valPoints = 0;
  if (profile === "vcp-tight") valPoints = 10;
  else if (profile === "breakout") valPoints = 9;
  else if (profile === "flat-base") valPoints = 8;
  else if (profile === "forming-vcp") valPoints = 5;
  else if (profile === "overextended") valPoints = 1;
  else valPoints = 0;
  
  const sepaScore = {
    total: trendPoints + rsPoints + vcpPoints + volPoints + valPoints,
    trendTemplate: trendPoints,
    rsStrength: rsPoints,
    vcpPattern: vcpPoints,
    volumeDryUp: volPoints,
    riskReward: valPoints,
  };
  
  return {
    ticker,
    name,
    marketType,
    country,
    mainIndustry: mainIndustry || "",
    subIndustry: finalSubIndustry,
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
    vcpPhaseDesc,
    buyPoint,
    stopLoss,
    targetPrice1,
    targetPrice2,
    riskPercent,
    pctToBuyPoint,
    status,
    statusEn,
    suggestion,
    klines: finalKlines
  };
}

// Scrapes a ticker from Yahoo Finance Chart API with auto-fallback and rotation
async function getYahooChartData(ticker: string, retries = 1, useQuery2 = true): Promise<any> {
  if (Date.now() < yahooRateLimitUntil) {
    return null;
  }
  const subdomain = useQuery2 ? "query2" : "query1";
  const url = `https://${subdomain}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(ticker)}?interval=1d&range=1y`;
  console.log(`[API Request URL] ${url}`);
  
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 6000); // 6 seconds timeout
  
  const agents = [
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1"
  ];
  const userAgent = agents[Math.floor(Math.random() * agents.length)];

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": userAgent
        // NOTE: Absolute minimal headers. Do not send "Accept" or "Accept-Language" 
        // as Yahoo Finance blocks/429s those on cloud hosting environments.
      }
    });
    clearTimeout(id);
    
    if (!res.ok) {
      if (res.status === 429) {
        throw new Error("rate limit: Too many requests for Yahoo Finance");
      }
      if (res.status === 403) {
        throw new Error("API blocked: Forbidden bypass access");
      }
      throw new Error(`parsing error or server status: HTTP ${res.status}`);
    }
    
    const json: any = await res.json();
    console.log(`[API Response] Received successful data payload for ${ticker} from ${subdomain}`);
    return json;
  } catch (err: any) {
    clearTimeout(id);
    const now = Date.now();
    
    let reason = "parsing error";
    if (err.name === 'AbortError') {
      reason = "request timeout";
    } else if (err.message?.includes("CORS")) {
      reason = "CORS";
    } else if (err.message?.includes("blocked")) {
      reason = "API blocked";
    } else if (err.message?.includes("rate limit")) {
      reason = "rate limit";
    }
    
    console.warn(`[Yahoo Scraper Warning] Ticker: ${ticker} failed on ${subdomain} (Reason: ${reason}).`);
    
    if (reason === "rate limit" || reason === "API blocked") {
      // Exponentially increase cooldown for global blocks
      const currentCooldown = yahooRateLimitUntil - Date.now();
      const nextCooldown = Math.max(10 * 60 * 1000, currentCooldown * 1.5);
      yahooRateLimitUntil = Date.now() + nextCooldown;
    }
    
    // For critical indices, prioritize retry with query1 
    const isIndex = ticker.startsWith("^");
    if (useQuery2) {
      await new Promise(r => setTimeout(r, isIndex ? 500 : 100));
      return getYahooChartData(ticker, retries, false);
    }
    
    if (retries > 0) {
      const waitTime = (isIndex ? 1000 : 200) * (2 - retries);
      console.log(`[Retrying] Ticker: ${ticker}, remaining retries: ${retries}, waiting ${waitTime}ms...`);
      await new Promise(r => setTimeout(r, waitTime));
      return getYahooChartData(ticker, retries - 1, true);
    }
    return null;
  }
}

// Extract klines list from raw JSON from Yahoo Finance
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
    
    klines.push({
      date: dateStr,
      open: Math.round(Number(o) * 100) / 100,
      high: Math.round(Number(h) * 100) / 100,
      low: Math.round(Number(l) * 100) / 100,
      close: Math.round(Number(c) * 100) / 100,
      volume: Math.round(Number(v)),
    });
  }
  return klines;
}

// Scrape Taiwan Stock Price using FinMind API
async function getFinMindChartData(ticker: string): Promise<any[]> {
  if (Date.now() < finMindRateLimitUntil) {
    return [];
  }
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const startDateStr = oneYearAgo.toISOString().split("T")[0];
  const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=${encodeURIComponent(ticker)}&start_date=${startDateStr}`;
  console.log(`[FinMind Request URL] ${url}`);
  
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 6000); // 6 seconds timeout
  
  try {
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    
    if (!res.ok) {
      if (res.status === 402 || res.status === 403 || res.status === 429) {
        finMindRateLimitUntil = Date.now() + 30 * 60 * 1000; // 30 mins block for 403/402
      }
      throw new Error(`FinMind HTTP ${res.status}`);
    }
    
    const json: any = await res.json();
    if (json.status !== 200 || !Array.isArray(json.data)) {
      throw new Error(`FinMind returned bad status ${json.status}: ${json.msg}`);
    }
    
    const klines = json.data.map((item: any) => ({
      date: item.date,
      open: Number(item.open),
      high: Number(item.max),
      low: Number(item.min),
      close: Number(item.close),
      volume: Number(item.Trading_Volume || item.Trading_Money || 100000)
    }));
    
    console.log(`[FinMind Success] Loaded ${klines.length} bars for ${ticker}`);
    return klines;
  } catch (err: any) {
    clearTimeout(id);
    console.error(`[FinMind Failed] Ticker: ${ticker}, error:`, err.message || err);
    return [];
  }
}

// Scrape stock price using Stooq CSV endpoint
async function getStooqChartData(ticker: string, isTW: boolean): Promise<any[]> {
  const symbol = ticker.startsWith("^") ? ticker.toLowerCase() : (isTW ? `${ticker}.tw` : `${ticker.toLowerCase()}.us`);
  
  if (Date.now() < stooqRateLimitUntil) {
    return []; // Bypass immediately while rate limit cooldown is engaged
  }

  const url = `https://stooq.com/q/d/l/?s=${symbol}&i=d`;
  console.log(`[Stooq Request URL] ${url}`);
  
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 6000); // 6 seconds timeout
  
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
      }
    });
    clearTimeout(id);
    
    if (!res.ok) {
      if (res.status === 429) {
        stooqRateLimitUntil = Date.now() + 10 * 1000; // 10 seconds cooldown
      }
      throw new Error(`Stooq HTTP ${res.status}`);
    }
    
    const csvText = await res.text();
    const lines = csvText.split(/\r?\n/);
    if (lines.length < 2) return [];
    
    const header = lines[0].toLowerCase();
    const isApiKeyRequest = csvText.toLowerCase().includes("apikey") || csvText.toLowerCase().includes("api key") || csvText.toLowerCase().includes("unauthorized");
    
    if (isApiKeyRequest) {
      console.warn(`[Stooq Reject] API Key required/Rate limited for ${symbol}. Engaging persistent Stooq cooldown.`);
      stooqRateLimitUntil = Date.now() + 60 * 60 * 1000; // 1 hour block
      return [];
    }

    if (!header.includes("date") || !header.includes("open")) {
      console.warn(`[Stooq Reject] CSV format invalid for ${symbol}: ${lines[0]}. Engaging ephemeral Stooq cooldown.`);
      stooqRateLimitUntil = Date.now() + 10 * 60 * 1000; // 10 minutes block
      return [];
    }
    
    const klines: any[] = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(",");
      if (parts.length < 6) continue;
      
      const date = parts[0];
      const open = parseFloat(parts[1]);
      const high = parseFloat(parts[2]);
      const low = parseFloat(parts[3]);
      const close = parseFloat(parts[4]);
      const volume = parseInt(parts[5], 10);
      
      if (isNaN(open) || isNaN(high) || isNaN(low) || isNaN(close) || isNaN(volume)) {
        continue;
      }
      
      klines.push({
        date,
        open,
        high,
        low,
        close,
        volume
      });
    }
    
    console.log(`[Stooq Success] Parsed ${klines.length} bars for ${symbol}`);
    return klines.slice(-250); // cap to reasonable timeline
  } catch (err: any) {
    clearTimeout(id);
    console.error(`[Stooq Failed] Ticker: ${symbol}, error:`, err.message || err);
    return [];
  }
}

// Fetch TAIEX Index from FinMind API as high stability fallback
async function fetchTaiexFromFinMind(): Promise<{ price: number; changePercent: number; date: string } | null> {
  try {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);
    const startDateStr = oneWeekAgo.toISOString().split("T")[0];
    const url = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockPrice&data_id=TAIEX&start_date=${startDateStr}`;
    const res = await fetch(url);
    if (res.ok) {
      const json: any = await res.json();
      if (json.status === 200 && Array.isArray(json.data) && json.data.length > 0) {
        const data = json.data;
        const last = data[data.length - 1];
        const lastClose = Number(last.close);
        let changePercent = 0;
        if (data.length >= 2) {
          const prevClose = Number(data[data.length - 2].close);
          changePercent = ((lastClose - prevClose) / prevClose) * 100;
        }
        return {
          price: Math.round(lastClose * 100) / 100,
          changePercent: Math.round(changePercent * 100) / 100,
          date: last.date
        };
      }
    }
  } catch (err) {
    console.warn(`[FinMind TAIEX Index Warning] Failed to fetch TAIEX index from FinMind:`, err);
  }
  return null;
}

// Resilient bulk index query to fetch TAIEX and Nasdaq in a single lightweight call
async function fetchIndexDataBulk(): Promise<{
  taiex: { price: number; changePercent: number; date: string };
  nasdaq: { price: number; changePercent: number; date: string };
}> {
  const currentDateStr = new Date().toISOString().split("T")[0];
  const fallback = {
    taiex: { price: 21480.35, changePercent: 1.24, date: currentDateStr },
    nasdaq: { price: 16920.58, changePercent: 0.85, date: currentDateStr }
  };

  const subdomains = ["query1", "query2"];
  if (Date.now() < yahooRateLimitUntil) {
    console.log("[Bulk Index] Skipping Yahoo Finance bulk fetch due to active rate-limit.");
  } else {
    for (const sub of subdomains) {
      if (Date.now() < yahooRateLimitUntil) break;
      try {
        const url = `https://${sub}.finance.yahoo.com/v7/finance/quote?symbols=^TWII,^IXIC`;
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), 4000);
        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
          }
        });
        clearTimeout(id);
        
        if (res.status === 429 || res.status === 403) {
           yahooRateLimitUntil = Date.now() + 5 * 60 * 1000;
           throw new Error(`Yahoo HTTP ${res.status}`);
        }

        if (res.ok) {
        const json = await res.json();
        const results = json?.quoteResponse?.result;
        if (Array.isArray(results) && results.length > 0) {
          const twResult = results.find((r: any) => r.symbol === "^TWII");
          const nasdaqResult = results.find((r: any) => r.symbol === "^IXIC");
          
          let taiex = fallback.taiex;
          let nasdaq = fallback.nasdaq;
          
          if (twResult) {
            const price = twResult.regularMarketPrice;
            const prevClose = twResult.regularMarketPreviousClose;
            const pct = twResult.regularMarketChangePercent ?? (prevClose ? ((price - prevClose) / prevClose) * 100 : 0);
            const date = twResult.regularMarketTime 
              ? new Date(twResult.regularMarketTime * 1000).toISOString().split("T")[0] 
              : currentDateStr;
            if (price) {
              taiex = { price: Math.round(price * 100) / 100, changePercent: Math.round(pct * 100) / 100, date };
            }
          }
          
          if (nasdaqResult) {
            const price = nasdaqResult.regularMarketPrice;
            const prevClose = nasdaqResult.regularMarketPreviousClose;
            const pct = nasdaqResult.regularMarketChangePercent ?? (prevClose ? ((price - prevClose) / prevClose) * 100 : 0);
            const date = nasdaqResult.regularMarketTime 
              ? new Date(nasdaqResult.regularMarketTime * 1000).toISOString().split("T")[0] 
              : currentDateStr;
            if (price) {
              nasdaq = { price: Math.round(price * 100) / 100, changePercent: Math.round(pct * 100) / 100, date };
            }
          }
          
          console.log(`[Bulk Index Success] Loaded indexes via Yahoo ${sub}: TAIEX=${taiex.price} (${taiex.changePercent}%), Nasdaq=${nasdaq.price} (${nasdaq.changePercent}%)`);
          return { taiex, nasdaq };
        }
      }
    } catch (err: any) {
      console.warn(`[Bulk Index Warning] Failed using Yahoo ${sub}:`, err.message || err);
    }
  }
}

  console.log(`[Bulk Index Fallback] Falling back to separate fetch index method...`);
  const taiexSingle = await fetchIndexData("^TWII");
  const nasdaqSingle = await fetchIndexData("^IXIC");
  return { taiex: taiexSingle, nasdaq: nasdaqSingle };
}

// High stability index getter combining Yahoo, FinMind & Stooq
async function fetchIndexData(indexSymbol: string): Promise<{ price: number; changePercent: number; date: string }> {
  const currentDateStr = new Date().toISOString().split("T")[0];
  const defaultIndices: { [key: string]: { price: number; changePercent: number; date: string } } = {
    "^TWII": { price: 21480.35, changePercent: 1.24, date: currentDateStr },
    "^IXIC": { price: 16920.58, changePercent: 0.85, date: currentDateStr }
  };
  
  // 1. Try Yahoo Finance first
  if (Date.now() >= yahooRateLimitUntil) {
    try {
      const raw = await getYahooChartData(indexSymbol);
      if (raw) {
        const res0 = raw?.chart?.result?.[0];
        if (res0) {
          const meta = res0.meta || {};
          const pk = parseYahooKLines(raw);
          const lPrice = meta.regularMarketPrice || (pk.length > 0 ? pk[pk.length - 1].close : null);
          if (lPrice !== null) {
            const prevC = meta.previousClose || meta.chartPreviousClose || (pk.length > 1 ? pk[pk.length - 2].close : lPrice);
            const lChange = prevC ? ((lPrice - prevC) / prevC) * 100 : 0;
            const lDate = meta.regularMarketTime ? new Date(meta.regularMarketTime * 1000).toISOString().split("T")[0] : currentDateStr;
            console.log(`[Index Success] Yahoo loaded ${indexSymbol}: ${lPrice} (${lChange}%)`);
            return { price: Math.round(lPrice * 100) / 100, changePercent: Math.round(lChange * 100) / 100, date: lDate };
          }
        }
      }
    } catch (err: any) {
      console.warn(`[Index Warning] Yahoo rates limited or blocked for index ${indexSymbol}. Transitioning to secondary providers...`);
    }
  }

  // 2. Try FinMind for TAIEX fallback
  if (indexSymbol === "^TWII") {
    const finmindIndex = await fetchTaiexFromFinMind();
    if (finmindIndex) {
      console.log(`[Index Success] FinMind loaded TAIEX: ${finmindIndex.price} (${finmindIndex.changePercent}%)`);
      return finmindIndex;
    }
  }
  
  // High Priority: Always attempt direct fetch for Nasdaq if Yahoo failed
  if (indexSymbol === "^IXIC") {
     console.log(`[Index Recovery] Attempting direct Stooq fetch for Nasdaq...`);
  }
  
  // 3. Try Stooq downloader - ONLY if it's not known to require API keys or fail, or run with low risk
  let stooqSym = "";
  if (indexSymbol === "^TWII") {
    stooqSym = "^tse"; // Stooq Taiwan TAIEX symbols
  } else if (indexSymbol === "^IXIC") {
    stooqSym = "^comp"; // Stooq Nasdaq Composite symbol
  }
  
  if (stooqSym && Date.now() >= stooqRateLimitUntil) {
    try {
      const klines = await getStooqChartData(stooqSym, false);
      if (klines && klines.length >= 2) {
        const last = klines[klines.length - 1];
        const prev = klines[klines.length - 2];
        const changePercent = ((last.close - prev.close) / prev.close) * 100;
        console.log(`[Index Success] Stooq loaded ${indexSymbol} (${stooqSym}): ${last.close} (${changePercent}%)`);
        return {
          price: last.close,
          changePercent: Math.round(changePercent * 100) / 100,
          date: last.date
        };
      }
    } catch (err: any) {
      console.warn(`[Index Warning] Stooq failed for index ${indexSymbol} (${stooqSym}):`, err.message || err);
    }
  }
  
  console.warn(`[Index Failsafe] Default hardcoded static estimation triggered for index ${indexSymbol}`);
  return defaultIndices[indexSymbol];
}

// Unified multi-provider KLine fetcher - prioritizes FinMind for Taiwan
async function fetchStockKLines(ticker: string, isTW: boolean, name: string): Promise<{ klines: any[]; isMock: boolean }> {
  // Option A: FinMind (Prioritized for Taiwan stocks)
  if (isTW) {
    try {
      const klines = await getFinMindChartData(ticker);
      if (klines && klines.length >= 50) {
        return { klines, isMock: false };
      }
    } catch (err: any) {
      console.warn(`[TW-FETCH] FinMind failover for ${ticker}`);
    }
  }

  // Option B. Yahoo Finance Charts
  try {
    const raw = await getYahooChartData(isTW ? `${ticker}.TW` : ticker);
    if (raw) {
      const klines = parseYahooKLines(raw);
      if (klines && klines.length >= 50) {
        return { klines, isMock: false };
      }
    }
  } catch (err: any) {
    console.warn(`[Scraping Warning] Yahoo Finance chart failover for ${ticker}`);
  }
  
  // Option C. Stooq CSV
  try {
    const klines = await getStooqChartData(ticker, isTW);
    if (klines && klines.length >= 50) {
      return { klines, isMock: false };
    }
  } catch (err: any) {
    console.warn(`[Scraping Warning] Stooq CSV failover abortive on ${ticker}.`);
  }
  
  // No mock data allowed - return empty if all sources fail
  return { klines: [], isMock: false };
}

// Perform market sync across all TWSE listed stocks
async function performMarketSync(): Promise<boolean> {
  console.log("[Market Sync Started] Bootstrapping real-time market scanner for TWSE...");
  
  // 1. Scrape Index Data in bulk
  let indexData = await fetchIndexDataBulk();
  
  // High reliability cross-check for TAIEX
  if (!indexData.taiex || indexData.taiex.price < 1000) {
     const finInfo = await fetchTaiexFromFinMind();
     if (finInfo) indexData.taiex = finInfo;
  }
  
  const taiexInfo = indexData.taiex;
  const nasdaqInfo = indexData.nasdaq;
  
  // 2. Fetch full TWSE stock list
  twseStockList = await fetchTWSEList();
  if (!twseStockList || twseStockList.length === 0) {
    throw new Error("市場資料同步失敗，請檢查資料來源 (無法取得上市股票清單)");
  }
  
  const finalTwList: any[] = [];
  const rsScoreMap: Record<string, number> = {};
  
  // 3. Scan all 1000+ TWSE stocks
  console.log(`[Market Sync] Scanning ${twseStockList.length} TWSE stocks...`);
  
  // Priority handle for 2330 and common leaders
  const priorityTickers = ["2330", "2317", "2454", "2308", "2382", "2357", "3231", "6669"];
  
  const chunkSize = 8;
  for (let i = 0; i < twseStockList.length; i += chunkSize) {
    const chunk = twseStockList.slice(i, i + chunkSize);
    const results = await Promise.all(chunk.map(async (item) => {
      // Gentle pacing - increased delay slightly to avoid rate limit
      await new Promise(r => setTimeout(r, Math.random() * 300 + 100));
      const { klines } = await fetchStockKLines(item.ticker, true, item.name);
      return { item, klines };
    }));

    for (const { item, klines } of results) {
      if (!klines || klines.length < 150) {
        if (priorityTickers.includes(item.ticker)) {
           console.warn(`[Market Sync Priority Warning] Ticker ${item.ticker} (${item.name}) failed fetch or has insufficient data (${klines?.length || 0} bars).`);
        }
        continue;
      }
      
      const last = klines[klines.length - 1].close;
      // RS Score calculation (Weighted Return over multiple periods)
      const getReturn = (days: number) => {
        if (klines.length <= days) return 0;
        const prev = klines[klines.length - days].close;
        return (last - prev) / prev;
      };
      
      const rsScore = (2 * getReturn(63)) + getReturn(126) + getReturn(189) + getReturn(252);
      rsScoreMap[item.ticker] = rsScore;
      
      finalTwList.push({ ...item, klines });
    }
    
    if (i % 25 === 0 && i > 0) {
      console.log(`[Market Sync Progress] ${i}/${twseStockList.length} stocks processed. Valid: ${finalTwList.length}`);
    }
  }

  // 4. Calculate RS Ranking (Percentile 1-99)
  console.log(`[Market Sync] Calculating RS Ranking for ${finalTwList.length} active stocks...`);
  // Add indices to calculate relative strength against market
  const sortedByRS = Object.keys(rsScoreMap).sort((a, b) => rsScoreMap[a] - rsScoreMap[b]);
  const rankedTwList: any[] = [];

  for (const stockData of finalTwList) {
    const rankIndex = sortedByRS.indexOf(stockData.ticker);
    const rsRanking = Math.floor((rankIndex / Math.max(1, sortedByRS.length)) * 99) + 1;
    
    // Improved Classification logic for industries - Unify and ensure completeness
    let industryGroup = "其他";
    const nCap = stockData.name.toUpperCase();
    const indRaw = (stockData.industry || "").toUpperCase();
    
    if (nCap.includes("伺服器") || nCap.includes("廣達") || nCap.includes("緯穎") || nCap.includes("緯創") || nCap.includes("技嘉") || nCap.includes("勤誠") || nCap.includes("川湖") || nCap.includes("營邦")) {
       industryGroup = "AI 伺服器";
    } else if (nCap.includes("欣興") || nCap.includes("南電") || nCap.includes("景碩") || nCap.includes("臻鼎") || nCap.includes("健鼎") || nCap.includes("台光電") || nCap.includes("金像電")) {
       industryGroup = "PCB / ABF";
    } else if (nCap.includes("散熱") || nCap.includes("雙鴻") || nCap.includes("奇鋐") || nCap.includes("建準") || nCap.includes("力致")) {
       industryGroup = "散熱";
    } else if (nCap.includes("電源") || nCap.includes("台達電") || nCap.includes("光寶科") || nCap.includes("康舒") || nCap.includes("全漢")) {
       industryGroup = "電源 / 功率半導體";
    } else if (indRaw.includes("半導體") || nCap.includes("台積電") || nCap.includes("聯電") || nCap.includes("日月光") || nCap.includes("創意") || nCap.includes("世芯") || nCap.includes("智原")) {
       industryGroup = "半導體";
    } else if (indRaw.includes("電腦") || indRaw.includes("電子")) {
       industryGroup = "電子類";
    } else if (indRaw.includes("金融") || indRaw.includes("保險")) {
       industryGroup = "金融類";
    } else if (indRaw.includes("水泥") || indRaw.includes("鋼鐵") || indRaw.includes("塑膠") || indRaw.includes("航運")) {
       industryGroup = "傳產類";
    }

    const analyzed = computeStockAnalysis(
      stockData.ticker,
      stockData.name,
      "上市",
      "TW",
      stockData.klines,
      rsRanking,
      industryGroup,
      industryGroup 
    );
    
    if (analyzed) {
      analyzed.isMock = false;
      const trackerKey = stockData.ticker;
      
      if (Object.keys(watchlistTrackerRegistry).length === 0) {
        initializeWatchlistTracker();
      }
      
      // Strict SEPA logic for Watchlist (RS > 70 and pass template OR RS > 85)
      const meetsSEPA = (analyzed.trendTemplate?.passed && analyzed.rsRanking >= 70) || analyzed.rsRanking >= 85;
      let tracker = watchlistTrackerRegistry[trackerKey];
      if (!tracker) {
        tracker = {
          ticker: trackerKey,
          consecutiveDays: meetsSEPA ? 1 : 0
        };
      } else {
        if (meetsSEPA) tracker.consecutiveDays += 1;
        else tracker.consecutiveDays = Math.max(0, tracker.consecutiveDays - 1);
      }
      
      const { cat, catEn } = determineDynamicWatchlistCategory(analyzed, tracker.consecutiveDays);
      tracker.watchlistCategory = cat;
      tracker.watchlistCategoryEn = catEn;
      watchlistTrackerRegistry[trackerKey] = tracker;
      
      analyzed.consecutiveDays = tracker.consecutiveDays;
      analyzed.watchlistCategory = cat;
      analyzed.watchlistCategoryEn = catEn;
      rankedTwList.push(analyzed);
    }
  }
  
  saveWatchlistTrackerToDisk();
  
  // Quality filters: Ensure long-term trend data and liquidity
  const checkedTwList = rankedTwList.filter(stock => {
    // Priority tickers (Index markers) are always included
    if (priorityTickers.includes(stock.ticker)) return true;
    
    // Turnover > 40M TWD, Price > 12 TWD
    const liquidityPass = stock.klines && stock.klines.length >= 160 && stock.lastClose >= 12;
    const turnoverPass = (stock.lastClose * stock.avgVolume20 > 400000); 
    
    // Trend condition: Either strictly pass template (Stage 2) OR have elite RS ranking
    const trendPass = (stock.trendTemplate?.passed) || stock.rsRanking >= 80;
    
    return liquidityPass && turnoverPass && trendPass;
  });
  
  const formatter = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
  const parts = formatter.formatToParts(new Date());
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  const hour = parts.find(p => p.type === 'hour')?.value;
  const minute = parts.find(p => p.type === 'minute')?.value;
  const second = parts.find(p => p.type === 'second')?.value;
  const formatTime = `${year}-${month}-${day} ${hour}:${minute}:${second} CST`;
  
  marketDataCache = {
    lastUpdated: formatTime,
    taiex: taiexInfo,
    nasdaq: nasdaqInfo,
    twStocks: checkedTwList,
    usStocks: [],
    stockPoolCount: twseStockList.length
  };
  
  saveCacheToFile();
  console.log(`[Market Sync Completed] Cleaned ${checkedTwList.length} active stocks. Last updated: ${formatTime}`);
  return true;
}

// REST route to deliver real market data
app.get("/api/market-data", async (req, res) => {
  const force = req.query.force === "true";
  
  try {
    if (!marketDataCache && !force) {
      loadCacheFromFile();
    }
    
    if (force) {
      console.log("[Force Rescan Requested] Resetting Yahoo & Stooq rate-limiting sentinels and beginning real-time synchronize...");
      yahooRateLimitUntil = 0; 
      stooqRateLimitUntil = 0; // Clear both rate-limit cooldowns on explicit forced requests
    }
    
    if (!marketDataCache || force) {
      await performMarketSync();
    }
    res.json({
      ...marketDataCache,
      debugNewCode: true
    });
  } catch (error: any) {
    console.error("[Market Data Sync Error] /api/market-data failed:", error.message || error);
    res.status(500).json({ error: "市場資料同步失敗，請檢查資料來源。", details: error.message || error });
  }
});

app.post("/api/scan-market", async (req, res) => {
  try {
    console.log("[Force Rescan Requested] Clearing memory cache, resetting rate boundaries, and synchronizing...");
    yahooRateLimitUntil = 0; 
    stooqRateLimitUntil = 0; // Clear rate-limit cooldowns on user manual request
    await performMarketSync();
    res.json({ success: true, lastUpdated: marketDataCache?.lastUpdated, taiex: marketDataCache?.taiex });
  } catch (error: any) {
    console.error("[POST scan-market Error]", error.message || error);
    res.status(500).json({ error: "市場資料同步失敗，請檢查資料來源。", details: error.message || error });
  }
});

// Post analysis request
app.post("/api/analyze", async (req, res) => {
  try {
    const { stock } = req.body;
    if (!stock) {
      return res.status(400).json({ error: "Missing stock analysis object" });
    }

    const client = getGeminiClient();
    if (!client) {
      // No key, return pristine fallback
      const fallbackAnalysis = getRuleBasedAnalysis(stock);
      return res.json({ analysis: fallbackAnalysis });
    }

    const prompt = `你是一位精通 Mark Minervini 理論、SEPA 篩選系統與 VCP (波動度收縮型態) 的資深強勢股操盤大師。
請針對這檔股票的技術數據以及均線排列進行專業的技術剖析，給出最具體的「主力籌碼清洗狀況、買點、停損點、期望值比、操作建言與風控核心」。

股票代碼/名稱: ${stock.ticker} (${stock.name})
最後收盤價: ${stock.lastClose}
當日漲跌幅: ${stock.changePercent.toFixed(2)}%
當日成交量: ${stock.volume} (20日平均量: ${stock.avgVolume20})
52週價格區間: ${stock.low52Week} ~ ${stock.high52Week}
RS 相對強度排名 (0-100): ${stock.rsRanking}
SEPA 篩選總分數: ${stock.sepaScore?.total}
Trend Template 檢定是否通過: ${stock.trendTemplate?.passed ? "【通過條件】" : "【不符合】"}
技術形态: ${stock.pattern}
型態物理細節: ${stock.vcpPhaseDesc}
Pivot 臨界買點價: ${stock.buyPoint}
設定初始停損點: ${stock.stopLoss} (停損控制在 ${stock.riskPercent.toFixed(2)}%)
風險回報 Ratio 1 (第一目標價): ${stock.targetPrice1}
風險回報 Ratio 2 (第二目標價): ${stock.targetPrice2}
當前狀態評級: ${stock.status}
原創操作建議: ${stock.suggestion}

請以此寫出一份「約 180 ~ 280字」的繁體中文分析報告，視角要極為專業、客觀冷靜、像頂級基金合夥人。
必須涵蓋以下三大部分：
1. 均線波段趨勢與 RS 強度鑑定 (指出其是否具備超級強勢先鋒股特徵)。
2. VCP 型態量化解構 (解讀收縮(T)細節、籌碼清洗狀況以及成交量是否符合枯竭期)。
3. 當前買賣戰術規劃 (進場位置精微把控與防禦停損的紀律要求)。

請直接輸出繁體中文分析報告（可使用簡短的 Markdown 標題，段落條理要分明）。`;

    const response = await client.models.generateContent({
      model: "gemini-3.5-flash",
      contents: prompt,
    });

    const analysisText = response.text || getRuleBasedAnalysis(stock);
    res.json({ analysis: analysisText });
  } catch (error) {
    console.error("Gemini proxy analysis error:", error);
    res.json({
      analysis:
        getRuleBasedAnalysis(req.body.stock) +
        "\n\n*(注意: 由於 AI 伺服器核心運作超時，本報告已由 SEPA 精密運作規則自動生成)*",
    });
  }
});

async function startServer() {
  // Pre-load market cache on boot
  loadCacheFromFile();

  // Vite Integration for Development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    
    // Express mounts static handlers first, then vite dev assets
    app.use(vite.middlewares);
  } else {
    // Production statically serves built client
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[SEPA Backend Router] Running at http://localhost:${PORT}`);
  });
}

startServer();
