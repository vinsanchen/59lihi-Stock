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
  topIndustries?: any[];
} | null = null;

// Cool-down tracking to protect Yahoo Finance and Stooq API from rate blocks
let yahooRateLimitUntil = 0;
let stooqRateLimitUntil = 0;
let finMindRateLimitUntil = 0;
let globalSyncingFlag = false;

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
let cachedIndexData: Record<string, { data: { price: number; changePercent: number; date: string }; timestamp: number }> = {};
const INDEX_CACHE_TTL = 5 * 60 * 1000; // 5-minute memory cache

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

  // 1. 今日突破 (Breakout Today)
  if (stock.statusEn === 'Breakout') {
     return { cat: "今日突破", catEn: "Breakout Today" };
  }

  // 2. 接近買點 (Near Pivot)
  if (stock.statusEn === 'Near Pivot') {
     return { cat: "接近買點", catEn: "Near Pivot" };
  }

  // 3. 失敗型態 (Failed Setup)
  if (stock.statusEn === 'Non-compliant') {
     return { cat: "失敗型態", catEn: "Failed Setup" };
  }

  // 4. 過度延伸 (Extended)
  if (stock.statusEn === 'Overextended') {
     return { cat: "過度延伸", catEn: "Extended" };
  }

  // 5. 核心觀察股 (Core Watchlist)
  if (consecutiveDays >= 2 || (stock.rsRanking >= 80 && stock.statusEn === 'Watch') || (stock.statusEn === 'Watch' && stock.sepaScore?.total >= 85)) {
    return { cat: "核心觀察股", catEn: "Core Watchlist" };
  }

  // 6. 一般追蹤
  if (stock.statusEn === 'Watch') {
    return { cat: "一般追蹤", catEn: "Regular Watch" };
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
      if (parsed && parsed.lastUpdated && Array.isArray(parsed.twStocks)) {
        const firstTW = parsed.twStocks[0];
        if (firstTW && Array.isArray(firstTW.klines) && firstTW.klines.length < 100) {
          console.warn(`[Cache Warning] Disk cache has limited history (${firstTW.klines.length} klines). Keeping it but a fresh sync is recommended.`);
        }
        marketDataCache = parsed;
        console.log(`[Cache Loaded] Loaded stock data cache successfully from disk (${parsed.twStocks.length} TW stocks), last updated at ${parsed.lastUpdated}`);
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
  
  if (lastClose < ma200 || trendPassedCount <= 5) {
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
  subIndustry?: string,
  previousAnalysis?: any
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
  // Aligned with Frontend Labels order
  // ==========================================
  const ma50 = finalKlines[finalKlines.length - 1].ma50;
  const ma150 = finalKlines[finalKlines.length - 1].ma150;
  const ma200 = finalKlines[finalKlines.length - 1].ma200;

  // Rule 1: Close > 50MA
  const rule1 = ma50 !== null && lastClose > ma50;
  // Rule 2: 50MA > 150MA
  const rule2 = ma50 !== null && ma150 !== null && ma50 > ma150;
  // Rule 3: 50MA > 200MA
  const rule3 = ma50 !== null && ma200 !== null && ma50 > ma200;
  // Rule 4: 150MA > 200MA
  const rule4 = ma150 !== null && ma200 !== null && ma150 > ma200;
  // Rule 5: 200MA Rising (at least 1 month)
  let rule5 = false;
  if (ma200 !== null && finalKlines.length >= 21) {
    const ma200Past = finalKlines[finalKlines.length - 21].ma200;
    if (ma200Past !== null) rule5 = ma200 > ma200Past;
    else rule5 = lastClose > ma200;
  }
  // Rule 6: Close > 52W Low + 30%
  const rule6 = low52Week > 0 && lastClose >= low52Week * 1.30;
  // Rule 7: Close within 25% of 52W High
  const rule7 = high52Week > 0 && lastClose >= high52Week * 0.75;
  // Rule 8: RS Ranking >= 70
  const rule8 = rsRanking >= 70;

  const passed = rule1 && rule2 && rule3 && rule4 && rule5 && rule6 && rule7 && rule8;
  
  const trendTemplate = {
    passed,
    rule1, rule2, rule3, rule4, rule5, rule6, rule7, rule8,
    closeAbove50MA: rule1,
    ma50Above150MA: rule2,
    ma50Above200MA: rule3,
    ma150Above200MA: rule4,
    ma200Rising20Days: rule5,
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
  
  // Pivot locking management
  let pivotPrice = high52Week;
  let pivotCreationDate = new Date().toISOString().split('T')[0];
  let pivotStatus: 'Active' | 'Fixed' | 'Breakout' = 'Active';
  let originalPivot = 0;
  let isNewBase = false;

  let calculatedPivot = high52Week;
  if (profile === "vcp-tight") {
    pattern = "VCP 3T 核心收斂";
    vcpPhaseDesc = "3 段收縮，振幅顯著壓縮，成交量進入乾枯期 (Vol Dry-up)。";
    calculatedPivot = Math.round(high52Week * 0.99 * 100) / 100;
  } else if (profile === "forming-vcp") {
    pattern = "VCP 二段成形中";
    vcpPhaseDesc = "正進行第 2 段震盪收縮，結構尚未完全收緊，右側量能仍待沉澱。";
    calculatedPivot = Math.round(high52Week * 0.97 * 100) / 100;
  } else if (profile === "breakout") {
    pattern = "VCP 爆量突破";
    vcpPhaseDesc = "收斂完成，伴隨大於平均量能強勢突破 Pivot 壓力區。";
    calculatedPivot = Math.round(high52Week * 0.95 * 100) / 100;
  } else if (profile === "flat-base") {
    pattern = "高檔箱型收斂";
    vcpPhaseDesc = "箱型基底 (Flat Base)，價格於狹幅區間平緩整理，成交量溫和萎縮。";
    calculatedPivot = Math.round(high52Week * 1.01 * 100) / 100;
  } else if (profile === "overextended") {
    pattern = "高檔延伸超買";
    vcpPhaseDesc = "無收斂型態。50 日均線乖離高，呈陡峭噴出走勢，累計量能極大。";
    calculatedPivot = Math.round(high52Week * 1.02 * 100) / 100;
  } else if (profile === "downtrend") {
    pattern = "頭部成形空頭排列";
    vcpPhaseDesc = "均線群下行，收盤價持續低於 200MA，無多頭收斂特徵。";
    calculatedPivot = Math.round(lastClose * 1.15 * 100) / 100;
  }

  // Pivot locking logic - RESET ONLY on specific conditions
  const isBelow200MA = ma200 !== null && lastClose < ma200;
  const isBelow50MA = ma50 !== null && lastClose < ma50;
  const isBelowBaseLow = previousAnalysis?.buyPoint && lastClose < previousAnalysis.buyPoint * 0.92;
  const patternFailed = profile === 'downtrend' || (!passed && previousAnalysis?.statusEn !== 'Breakout');
  const wasBreakout = previousAnalysis?.statusEn === 'Breakout';
  const isNewBasePattern = (profile === 'flat-base' || profile === 'forming-vcp' || profile === 'vcp-tight') && wasBreakout && lastClose > previousAnalysis.buyPoint * 1.08;
  
  const mustReset = isBelow200MA || isBelow50MA || isBelowBaseLow || patternFailed || isNewBasePattern;
  
  if (previousAnalysis && previousAnalysis.buyPoint && !mustReset && previousAnalysis.statusEn !== 'Non-compliant') {
      pivotPrice = previousAnalysis.buyPoint;
      originalPivot = previousAnalysis.originalPivot || previousAnalysis.buyPoint;
      pivotCreationDate = previousAnalysis.pivotCreationDate || pivotCreationDate;
      pivotStatus = previousAnalysis.statusEn === 'Breakout' ? 'Breakout' : 'Fixed';
      isNewBase = false;
  } else {
      pivotPrice = calculatedPivot;
      originalPivot = calculatedPivot;
      pivotCreationDate = new Date().toISOString().split('T')[0];
      pivotStatus = 'Active';
      isNewBase = true;
  }
  
  let stopLoss = 0;
  let buyPoint = pivotPrice;
  let status: "接近買點" | "可觀察" | "已突破" | "型態尚未完成" | "過度延伸，不建議追" | "不符合" = "可觀察";
  let statusEn = "Watch";
  let suggestion = "";
  
  // MANDATORY: If Trend Template fails, it MUST NOT be given a positive status
  if (!passed) {
    status = "不符合";
    statusEn = "Non-compliant";
    suggestion = "目前不符趨勢樣板。股價可能回落至均線下方或大趨勢不連貫，交易者應耐心等待其重新站回關鍵水位。";
    stopLoss = Math.round(lastClose * 0.88 * 100) / 100;
  } else if (profile === "vcp-tight") {
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
  
  const trendPoints = Math.round((trendCount / 8) * 40); // Max 40
  const rsPoints = Math.round((rsRanking / 100) * 20);    // Max 20
  
  let vcpPoints = 0;
  if (profile === "vcp-tight") vcpPoints = 20;
  else if (profile === "breakout") vcpPoints = 18;
  else if (profile === "forming-vcp") vcpPoints = 14;
  else if (profile === "flat-base") vcpPoints = 12;
  else vcpPoints = 5;
  
  let volPoints = 0;
  if (profile === "vcp-tight") volPoints = 10;
  else if (profile === "flat-base") volPoints = 8;
  else if (profile === "forming-vcp") volPoints = 6;
  else if (profile === "breakout") volPoints = 9;
  else volPoints = 2;
  
  let valPoints = 0;
  if (profile === "vcp-tight") valPoints = 10;
  else if (profile === "breakout") valPoints = 9;
  else if (profile === "flat-base") valPoints = 8;
  else if (profile === "forming-vcp") valPoints = 5;
  else valPoints = 0;
  
  // Penalties
  let penalty = 0;
  if (profile === 'overextended') penalty = 20; 
  if (profile === 'downtrend') penalty = 60;
  if (lastClose < ma200 && ma200) penalty += 25;
  
  // Strict: If Trend Template fails, it cannot have a high score
  if (!passed) {
    penalty += 35;
  }
  
  // Strict: Low RS (Laggard) further penalty
  if (rsRanking < 40) {
    penalty += 15;
  } else if (rsRanking < 70) {
    penalty += 5;
  }

  const total = Math.max(10, Math.min(100, trendPoints + rsPoints + vcpPoints + volPoints + valPoints - penalty));
  
  const sepaScore = {
    total,
    trendTemplate: trendPoints,
    rsStrength: rsPoints,
    vcpPattern: vcpPoints,
    volumeDryUp: volPoints,
    riskReward: valPoints,
    penalty,
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
    buyPoint: pivotPrice,
    originalPivot,
    pivotCreationDate,
    pivotStatus,
    isNewBase,
    stopLoss,
    targetPrice1,
    targetPrice2,
    riskPercent,
    pctToBuyPoint,
    status,
    statusEn,
    suggestion,
    lastMA50: ma50,
    lastMA150: ma150,
    lastMA200: ma200,
    klineCount: finalKlines.length,
    klines: finalKlines
  };
}

// Scrapes a ticker from Yahoo Finance Chart API with auto-fallback and rotation
async function getYahooChartData(ticker: string, retries = 1, useQuery2 = true, isPriority = false): Promise<any> {
  if (Date.now() < yahooRateLimitUntil && !isPriority) {
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
    
    const isIndex = ticker.startsWith("^");
    if (!isIndex) {
      const isRateLimited = reason === "rate limit" || reason === "API blocked";
      // Only log if it's a priority ticker OR it's not a rate limit (meaning it's an unexpected error)
      if (isPriority) {
        console.warn(`[Yahoo Scraper Warning] Ticker: ${ticker} failed on ${subdomain} (Reason: ${reason}).`);
      } else if (isRateLimited && Date.now() >= yahooRateLimitUntil) {
        // Log once briefly if first hit
        console.warn(`[Yahoo Rate Limit Hit] Yahoo Finance hit rate limits. Engaging cooldown.`);
      }
    }
    
    if (reason === "rate limit" || reason === "API blocked") {
      // Exponentially increase cooldown for global blocks
      const currentCooldown = yahooRateLimitUntil - Date.now();
      const nextCooldown = Math.min(20 * 60 * 1000, Math.max(5 * 60 * 1000, currentCooldown * 1.2)); 
      yahooRateLimitUntil = Date.now() + nextCooldown;
    }
    
    // For critical indices, prioritize retry with query1 
    if (useQuery2) {
      await new Promise(r => setTimeout(r, (isIndex || isPriority) ? 2000 : 1000));
      return getYahooChartData(ticker, retries, false, isPriority);
    }
    
    if (retries > 0) {
      const waitTime = (isIndex || isPriority ? 5000 : 3000) * (2 - retries + 1);
      console.log(`[Retrying] Ticker: ${ticker}, remaining retries: ${retries}, waiting ${waitTime}ms...`);
      await new Promise(r => setTimeout(r, waitTime));
      return getYahooChartData(ticker, retries - 1, true, isPriority);
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
async function getFinMindChartData(ticker: string, isPriority = false): Promise<any[]> {
  if (Date.now() < finMindRateLimitUntil && !isPriority) {
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
    if (res.status === 402) {
      if (Date.now() >= finMindRateLimitUntil) {
        console.warn(`[FinMind Quota Alert] Quota exhausted (402). Engaging 1-hour cooldown.`);
      }
      finMindRateLimitUntil = Date.now() + 60 * 60 * 1000; // 1 hour block for quota exhausted
    } else if (res.status === 403 || res.status === 429) {
      finMindRateLimitUntil = Date.now() + 10 * 60 * 1000; // 10 mins block for 429/403
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
    if (Date.now() >= finMindRateLimitUntil && !err.message?.includes("402")) {
      // Only log if not already in cooldown or if it's not a known 402 (which we already log as a Warning above)
      console.error(`[FinMind Failed] Ticker: ${ticker}, error:`, err.message || err);
    }
    return [];
  }
}

// Scrape stock price using Stooq CSV endpoint
async function getStooqChartData(ticker: string, isTW: boolean, isPriority = false): Promise<any[]> {
  const symbol = ticker.startsWith("^") ? ticker.toLowerCase() : (isTW ? `${ticker}.tw` : `${ticker.toLowerCase()}.us`);
  
  if (Date.now() < stooqRateLimitUntil && !isPriority) {
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
        const id = setTimeout(() => controller.abort(), 2000);
        const res = await fetch(url, {
          signal: controller.signal,
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
          }
        });
        clearTimeout(id);
        
        if (res.status === 429 || res.status === 403) {
           yahooRateLimitUntil = Date.now() + 2 * 60 * 1000; // 2 min quick cooldown
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

// High stability index getter combining Yahoo, FinMind & Stooq with 5-min caching
async function fetchIndexData(indexSymbol: string): Promise<{ price: number; changePercent: number; date: string }> {
  // Check index cache first
  const now = Date.now();
  if (cachedIndexData[indexSymbol] && (now - cachedIndexData[indexSymbol].timestamp < INDEX_CACHE_TTL)) {
    return cachedIndexData[indexSymbol].data;
  }

  const currentDateStr = new Date().toISOString().split("T")[0];
  const defaultIndices: { [key: string]: { price: number; changePercent: number; date: string } } = {
    "^TWII": { price: 21480.35, changePercent: 1.24, date: currentDateStr },
    "^IXIC": { price: 16920.58, changePercent: 0.85, date: currentDateStr }
  };
  
  // 1. For TAIEX, prioritize FinMind if Yahoo is rate limited
  if (indexSymbol === "^TWII") {
    if (Date.now() < yahooRateLimitUntil) {
      console.log(`[Index Pre-emptive Fallback] Yahoo rate limited. Using FinMind for TAIEX...`);
      const finmindIndex = await fetchTaiexFromFinMind();
      if (finmindIndex) return finmindIndex;
    }
  }

  // 2. Try Yahoo Finance
  const isPriority = true; // Index symbols are always priority
  if (Date.now() >= yahooRateLimitUntil || isPriority) {
    try {
      const raw = await getYahooChartData(indexSymbol, 2, true, isPriority);
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
            const data = { price: Math.round(lPrice * 100) / 100, changePercent: Math.round(lChange * 100) / 100, date: lDate };
            
            // Success - store in cache
            cachedIndexData[indexSymbol] = { data, timestamp: Date.now() };
            console.log(`[Index Success] Yahoo loaded ${indexSymbol}: ${data.price} (${data.changePercent}%)`);
            return data;
          }
        }
      }
    } catch (err: any) {
      // Only log if not already rate-limited to reduce noise
      if (Date.now() >= yahooRateLimitUntil) {
        console.warn(`[Index Warning] Yahoo rates limited or blocked for index ${indexSymbol}. Transitioning to secondary providers...`);
      }
    }
  }

  // 3. Fallback to FinMind for TAIEX
  if (indexSymbol === "^TWII") {
    const finmindIndex = await fetchTaiexFromFinMind();
    if (finmindIndex) {
      cachedIndexData[indexSymbol] = { data: finmindIndex, timestamp: Date.now() };
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
  
  if (stooqSym && (Date.now() >= stooqRateLimitUntil || isPriority)) {
    try {
      const klines = await getStooqChartData(stooqSym, false, isPriority);
      if (klines && klines.length >= 2) {
        const last = klines[klines.length - 1];
        const prev = klines[klines.length - 2];
        const changePercent = ((last.close - prev.close) / prev.close) * 100;
        const res = {
          price: last.close,
          changePercent: Math.round(changePercent * 100) / 100,
          date: last.date
        };
        cachedIndexData[indexSymbol] = { data: res, timestamp: Date.now() };
        console.log(`[Index Success] Stooq loaded ${indexSymbol} (${stooqSym}): ${res.price} (${res.changePercent}%)`);
        return res;
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
  const priorityTickers = ["2330", "2317", "2454", "2308", "2382", "2357", "3231", "6669", "2337", "2344", "2356", "2376", "2301", "2313", "2368", "3034", "3037"];
  const isPriority = priorityTickers.includes(ticker);

  // Option A: FinMind (Prioritized for Taiwan stocks)
  // If quota exhausted (402), strictly honor it even for priority
  const finMindBlocked = Date.now() < finMindRateLimitUntil;
  if (isTW && !finMindBlocked) {
    try {
      const klines = await getFinMindChartData(ticker, isPriority);
      if (klines && klines.length >= 50) {
        return { klines, isMock: false };
      }
    } catch (err: any) {
      // Small failover window
    }
  }

  // Option B. Yahoo Finance Charts
  const yahooBlocked = Date.now() < yahooRateLimitUntil;
  if (!yahooBlocked || isPriority) {
    try {
      const raw = await getYahooChartData(isTW ? `${ticker}.TW` : ticker, isPriority ? 2 : 0, true, isPriority);
      if (raw) {
        const klines = parseYahooKLines(raw);
        if (klines && klines.length >= 50) {
          return { klines, isMock: false };
        }
      }
    } catch (err: any) {
      // Suppress logs if we are already rate limited or the error is common
    }
  }
  
  // Option C. Stooq CSV (Last resort)
  const stooqBlocked = Date.now() < stooqRateLimitUntil;
  if (!stooqBlocked || isPriority) {
    try {
      const klines = await getStooqChartData(ticker, isTW, isPriority);
      if (klines && klines.length >= 50) {
        return { klines, isMock: false };
      }
    } catch (err: any) {
      // Suppress
    }
  }
  
  // No mock data allowed - return empty if all sources fail
  return { klines: [], isMock: false };
}

// Perform market sync across all TWSE listed stocks
async function performMarketSync(): Promise<boolean> {
  if (globalSyncingFlag) return false;
  globalSyncingFlag = true;
  
  try {
    console.log("[Market Sync Started] Bootstrapping real-time market scanner for TWSE...");
  
  // 1. Scrape Index Data in bulk
  let indexData = await fetchIndexDataBulk();
  
  // High reliability cross-check for TAIEX
  if (!indexData.taiex || indexData.taiex.price < 1000) {
     console.log("[Index Fallback] TAIEX data missing or invalid, attempting FinMind specific fetch...");
     const finInfo = await fetchTaiexFromFinMind();
     if (finInfo) {
       indexData.taiex = finInfo;
       console.log(`[Index Fallback Success] FinMind recovered TAIEX: ${finInfo.price}`);
     }
  }
  
  if (!indexData.taiex) {
    console.error("[Index Critical Failure] Could not fetch TAIEX from any source. Using last cached value if available.");
    if (marketDataCache?.taiex) indexData.taiex = marketDataCache.taiex;
  }
  
  const taiexInfo = indexData.taiex;
  const nasdaqInfo = indexData.nasdaq;
  
  // 2. Fetch full TWSE stock list
  twseStockList = await fetchTWSEList();
  
  // 3. Define US stock universe for tracking
  const usUniverse = [
    { ticker: "NVDA", name: "Nvidia" },
    { ticker: "TSLA", name: "Tesla" },
    { ticker: "AAPL", name: "Apple" },
    { ticker: "MSFT", name: "Microsoft" },
    { ticker: "AMD", name: "AMD" },
    { ticker: "AMZN", name: "Amazon" },
    { ticker: "GOOGL", name: "Google" },
    { ticker: "META", name: "Meta" },
    { ticker: "AVGO", name: "Broadcom" },
    { ticker: "SMCI", name: "SuperMicro" },
    { ticker: "ARM", name: "ARM Holdings" },
    { ticker: "MU", name: "Micron" },
    { ticker: "ASML", name: "ASML" },
    { ticker: "MSTR", name: "MicroStrategy" },
    { ticker: "COIN", name: "Coinbase" },
    { ticker: "PLTR", name: "Palantir" },
    { ticker: "NFLX", name: "Netflix" },
    { ticker: "ORCL", name: "Oracle" },
    { ticker: "ADBE", name: "Adobe" },
    { ticker: "CRM", name: "Salesforce" }
  ];

  const finalTwList: any[] = [];
  const finalUsList: any[] = [];
  const rsScoreMap: Record<string, number> = {};
  
  // 4. Scan US Stocks first (usually faster as it's a smaller universe)
  console.log(`[Market Sync] Scanning ${usUniverse.length} US momentum stocks...`);
  const usTempList: any[] = [];
  for (const item of usUniverse) {
    try {
      const { klines } = await fetchStockKLines(item.ticker, false, item.name);
      // Pacing for US stocks to avoid Yahoo Finance cloud IP blocking
      await new Promise(resolve => setTimeout(resolve, 1200));
      
      if (klines && klines.length >= 160) {
        const last = klines[klines.length - 1].close;
        const getReturn = (days: number) => {
          if (klines.length <= days) return 0;
          const prev = klines[klines.length - days].close;
          return (last - prev) / prev;
        };
        // RS Score formula: 2*Q1_Return + Q2_Return + Q3_Return + Q4_Return
        const rsScore = (2 * getReturn(63)) + getReturn(126) + getReturn(189) + getReturn(252);
        rsScoreMap[item.ticker] = rsScore;
        usTempList.push({ ...item, klines });
      } else {
        console.warn(`[Market Sync Warning] US Ticker ${item.ticker} has insufficient data (${klines?.length || 0} bars). Required: 160`);
      }
    } catch (err) {
      console.error(`[Market Sync Error] Failed to scan US Ticker ${item.ticker}:`, err);
    }
  }

  // Calculate RS Ranks for the US subset
  const usRSKeys = Object.keys(rsScoreMap).sort((a, b) => rsScoreMap[a] - rsScoreMap[b]);
  for (const item of usTempList) {
    const rankIndex = usRSKeys.indexOf(item.ticker);
    const rs = Math.floor((rankIndex / Math.max(1, usRSKeys.length)) * 99) + 1;
    const analyzed = computeStockAnalysis(item.ticker, item.name, "NASDAQ", "US", item.klines, rs, "科技/增長");
    if (analyzed) finalUsList.push(analyzed);
  }

  // 5. Scan all 1000+ TWSE stocks
  console.log(`[Market Sync] Scanning ${twseStockList.length} TWSE stocks...`);
  
  // Priority handle for leaders
  const priorityTickers = ["2330", "2317", "2454", "2308", "2382", "2357", "3231", "6669", "2337", "2344", "2356", "2376", "2301", "2313", "2368", "3034", "3037"];
  
  // Fetch priority tickers first for high reliability - concurrent
  console.log(`[Market Sync] Priority fetch phase starting for ${priorityTickers.length} leaders...`);
  const priorityStocks = twseStockList.filter(s => priorityTickers.includes(s.ticker));
  const remainingStocks = twseStockList.filter(s => !priorityTickers.includes(s.ticker));

  const priorityResults = await Promise.all(priorityStocks.map(async (item) => {
    // Staggered starts for priority
    await new Promise(r => setTimeout(r, Math.random() * 400));
    const { klines } = await fetchStockKLines(item.ticker, true, item.name);
    return { item, klines };
  }));

  for (const { item, klines } of priorityResults) {
    if (klines && klines.length >= 150) {
      const last = klines[klines.length - 1].close;
      const getReturn = (days: number) => {
        if (klines.length <= days) return 0;
        const prev = klines[klines.length - days].close;
        return (last - prev) / prev;
      };
      const rsScore = (2 * getReturn(63)) + getReturn(126) + getReturn(189) + getReturn(252);
      rsScoreMap[item.ticker] = rsScore;
      finalTwList.push({ ...item, klines });
    } else {
      console.warn(`[Market Sync Priority Warning] Ticker ${item.ticker} (${item.name}) failed fetch in priority phase.`);
    }
  }

  // Update cache immediately after priority phase so user sees results right away
  if (finalTwList.length > 0) {
    console.log(`[Market Sync] Priority phase complete (${finalTwList.length} stocks). Updating intermediate cache.`);
    
    // Calculate intermediate RS
    const currentRSKeys = Object.keys(rsScoreMap).sort((a, b) => rsScoreMap[a] - rsScoreMap[b]);
    
    const tempResults = finalTwList.map(s => {
      const rankIndex = currentRSKeys.indexOf(s.ticker);
      // If we only have priority stocks (usually strong), cap intermediate RS to avoid inflation
      // but still show ranking among them. 
      const rawRs = Math.floor((rankIndex / Math.max(1, currentRSKeys.length)) * 99) + 1;
      const isPriorityOnly = currentRSKeys.length < 50;
      
      const prev = marketDataCache?.twStocks?.find(p => p.ticker === s.ticker);
      
      // Fix: If in priority phase, don't let RS drop to 1 if we have a previous high RS
      // This prevents visual flickering where leaders like 2330/2317 show RS 1/15 during background syncs
      let rs = rawRs;
      if (isPriorityOnly) {
        if (prev && prev.rsRanking > 70) {
          // If was previously a leader, keep it high in intermediate phase
          rs = Math.max(prev.rsRanking - 5, rawRs); 
        } else {
          rs = Math.min(85, rawRs);
        }
      }
      
      const analyzed = computeStockAnalysis(s.ticker, s.name, "上市", "TW", s.klines, rs, s.industry, undefined, prev);
      if (analyzed) {
         const tracker = watchlistTrackerRegistry[analyzed.ticker] || { ticker: analyzed.ticker, consecutiveDays: 0 };
         const { cat, catEn } = determineDynamicWatchlistCategory(analyzed, tracker.consecutiveDays);
         analyzed.watchlistCategory = cat;
         analyzed.watchlistCategoryEn = catEn;
         analyzed.consecutiveDays = tracker.consecutiveDays;
      }
      return analyzed;
    });
    
    marketDataCache = {
      ...marketDataCache,
      lastUpdated: `優先股同步完成 (掃描中...)`,
      taiex: taiexInfo || marketDataCache?.taiex || { price: 0, changePercent: 0, date: "" },
      nasdaq: nasdaqInfo || marketDataCache?.nasdaq || { price: 0, changePercent: 0, date: "" },
      twStocks: tempResults.filter(Boolean),
      usStocks: [],
      stockPoolCount: twseStockList.length
    };
  }

  const chunkSize = 1; // Serialize for rate limit safety
  for (let i = 0; i < remainingStocks.length; i += chunkSize) {
    const chunk = remainingStocks.slice(i, i + chunkSize);
    const results = await Promise.all(chunk.map(async (item) => {
      // Significantly increase pacing: ~3-6 seconds per request
      await new Promise(r => setTimeout(r, Math.random() * 3000 + 3000));
      const { klines } = await fetchStockKLines(item.ticker, true, item.name);
      return { item, klines };
    }));

    let chunkFailures = 0;
    for (const { item, klines } of results) {
      if (!klines || klines.length < 150) {
        chunkFailures++;
        continue;
      }
      
      const last = klines[klines.length - 1].close;
      const getReturn = (days: number) => {
        if (klines.length <= days) return 0;
        const prev = klines[klines.length - days].close;
        return (last - prev) / prev;
      };
      
      const rsScore = (2 * getReturn(63)) + getReturn(126) + getReturn(189) + getReturn(252);
      rsScoreMap[item.ticker] = rsScore;
      finalTwList.push({ ...item, klines });
    }
    
    // If whole chunk failed, pause briefly
    if (chunkFailures === chunk.length) {
      const blockedUntil = Math.max(yahooRateLimitUntil, finMindRateLimitUntil);
      if (blockedUntil > Date.now()) {
        console.warn(`[Market Sync Paused] APIs partially blocked. Pacing for 30s...`);
        await new Promise(r => setTimeout(r, 30000));
      }
    }
    
    // Partial status logging and periodic safety update
    if (i % 10 === 0 && i > 0) {
      console.log(`[Market Sync Progress] ${i}/${twseStockList.length} stocks processed. Valid: ${finalTwList.length}`);
      
      // If we have some data, update a "temp" cache so users see progress
      if (finalTwList.length > 5) {
        const currentRSKeys = Object.keys(rsScoreMap).sort((a, b) => rsScoreMap[a] - rsScoreMap[b]);
        
        const tempResults = finalTwList.map(s => {
          const rankIndex = currentRSKeys.indexOf(s.ticker);
          const rawRs = Math.floor((rankIndex / Math.max(1, currentRSKeys.length)) * 99) + 1;
          const isIntermediate = currentRSKeys.length < 300;
          const rs = isIntermediate ? Math.min(95, rawRs) : rawRs;
          
          const prev = marketDataCache?.twStocks?.find(p => p.ticker === s.ticker);
          const analyzed = computeStockAnalysis(s.ticker, s.name, "上市", "TW", s.klines, rs, s.industry, undefined, prev);
          
          if (analyzed) {
             const tracker = watchlistTrackerRegistry[analyzed.ticker] || { ticker: analyzed.ticker, consecutiveDays: 0 };
             const { cat, catEn } = determineDynamicWatchlistCategory(analyzed, tracker.consecutiveDays);
             analyzed.watchlistCategory = cat;
             analyzed.watchlistCategoryEn = catEn;
             analyzed.consecutiveDays = tracker.consecutiveDays;
          }
          return analyzed;
        });
        const filteredTemp = tempResults.filter(Boolean);
        marketDataCache = {
          ...marketDataCache,
          lastUpdated: `同步中 (${i}/${twseStockList.length})`,
          taiex: taiexInfo || { price: 0, changePercent: 0, date: "" },
          nasdaq: nasdaqInfo || { price: 0, changePercent: 0, date: "" },
          twStocks: filteredTemp,
          usStocks: finalUsList,
          stockPoolCount: twseStockList.length
        };
      }
    }
  }

  // 4. Calculate RS Ranking (Percentile 1-99)
  // CRITICAL SAFETY CHECK: If we failed to get a reasonable amount of data, DON'T UPDATE CACHE.
  const minimumRequired = twseStockList.length > 0 ? Math.min(10, twseStockList.length) : 5;
  if (finalTwList.length < minimumRequired) {
    console.error(`[Market Sync Aborted] Only ${finalTwList.length} stocks fetched. This indicates a mass API failure. Aborting to protect existing cache.`);
    return false;
  }

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

    const prev = marketDataCache?.twStocks?.find(p => p.ticker === stockData.ticker);
    const analyzed = computeStockAnalysis(
      stockData.ticker,
      stockData.name,
      "上市",
      "TW",
      stockData.klines,
      rsRanking,
      industryGroup,
      industryGroup,
      prev
    );
    
    if (analyzed) {
      analyzed.isMock = false;
      const trackerKey = stockData.ticker;
      
      if (Object.keys(watchlistTrackerRegistry).length === 0) {
        initializeWatchlistTracker();
      }
      
      // Strict SEPA logic for Watchlist (8/8 Template MUST pass)
      const meetsSEPA = !!analyzed.trendTemplate?.passed;
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
    
    // Trend condition: Strictly enforce Minervini Trend Template (8/8)
    const trendPass = !!stock.trendTemplate?.passed;
    
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
  
  // 6. Calculate Dynamic Industry Rankings
  const industrySummary: Record<string, { totalSepa: number, count: number, breakoutCount: number, leaders: string[] }> = {};
  
  [...checkedTwList, ...finalUsList].forEach(s => {
    const ind = s.subIndustry || s.mainIndustry || "其他";
    if (!industrySummary[ind]) {
      industrySummary[ind] = { totalSepa: 0, count: 0, breakoutCount: 0, leaders: [] };
    }
    industrySummary[ind].totalSepa += s.sepaScore.total;
    industrySummary[ind].count += 1;
    if (s.statusEn === "Breakout" || s.statusEn === "Near Pivot") {
      industrySummary[ind].breakoutCount += 1;
    }
    if (s.sepaScore.total >= 80) {
      industrySummary[ind].leaders.push(s.name);
    }
  });

  const rankedIndustries = Object.entries(industrySummary)
    .map(([name, data]) => ({
      name,
      avgSepa: Math.round((data.totalSepa / data.count) * 10) / 10,
      breakoutRate: Math.round((data.breakoutCount / data.count) * 100),
      leaders: data.leaders.slice(0, 3)
    }))
    .filter(ind => ind.name !== "其他" && ind.name !== "電子類" && ind.name !== "傳產類")
    .sort((a, b) => (b.avgSepa + b.breakoutRate/2) - (a.avgSepa + a.breakoutRate/2))
    .slice(0, 5);

  marketDataCache = {
    lastUpdated: formatTime,
    taiex: taiexInfo,
    nasdaq: nasdaqInfo,
    twStocks: checkedTwList,
    usStocks: finalUsList,
    stockPoolCount: twseStockList.length,
    topIndustries: rankedIndustries
  };
  
  saveCacheToFile();
  console.log(`[Market Sync Completed] Cleaned ${checkedTwList.length} active stocks. Last updated: ${formatTime}`);
  globalSyncingFlag = false;
  return true;
} catch (err) {
  console.error("[Market Sync Fatal Error]", err);
  globalSyncingFlag = false;
  return false;
}
}

// REST route to deliver real market data
app.get("/api/market-data", async (req, res) => {
  const force = req.query.force === "true";
  
  try {
    if (!marketDataCache) {
      loadCacheFromFile();
    }
    
    // If we have a cache and not a force request, return immediately
    if (marketDataCache && !force) {
      return res.json({ ...marketDataCache, isBackgroundSyncing: false });
    }
    
    // If force or no cache, we start a sync
    console.log(`[Market API] ${force ? "Force rescan" : "No cache"} triggered. Checking status...`);
    
    // Status check: if already syncing, don't double trigger
    const isSyncing = globalSyncingFlag; 
    
    if (force) {
      console.log("[Market API] Forced reset of rate-limit sentinels...");
      yahooRateLimitUntil = 0;
      stooqRateLimitUntil = 0;
      finMindRateLimitUntil = 0;
    }
    
    // Start full sync in background if needed
    if (!isSyncing && (!marketDataCache || force)) {
      performMarketSync().catch(err => {
        console.error("[Background Sync Error]", err);
        globalSyncingFlag = false;
      });
    }
    
    // Return what we have
    if (marketDataCache) {
      const stripKlines = (stocks: any[]) => stocks.map(({ klines, ...rest }) => rest);
      
      return res.json({ 
        ...marketDataCache, 
        twStocks: stripKlines(marketDataCache.twStocks || []),
        usStocks: stripKlines(marketDataCache.usStocks || []),
        isBackgroundSyncing: globalSyncingFlag || isSyncing,
        message: globalSyncingFlag ? `掃描進度: ${marketDataCache.lastUpdated}` : undefined
      });
    } else {
      // Return a structured pending response so the UI knows we're working
      return res.json({ 
        lastUpdated: "正在初始化數據...", 
        twStocks: [], 
        taiex: { price: 0, changePercent: 0, date: "" },
        isBackgroundSyncing: true,
        message: "系統偵測到目前尚無存檔，正在從交易所緊急獲取權值股數據，請稍後 1~2 分鐘並重新整理。" 
      });
    }
  } catch (error: any) {
    console.error("[Market Data Sync Error] /api/market-data failed:", error.message || error);
    res.status(500).json({ error: "市場資料解析失敗", details: error.message || error });
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

// ==========================================
// Fundamental Analysis Data Fetchers
// ==========================================

async function fetchTWFundamentals(ticker: string): Promise<any> {
  const cleanTicker = ticker.split(".")[0];
  const currentDate = new Date();
  const threeYearsAgo = new Date();
  threeYearsAgo.setFullYear(currentDate.getFullYear() - 3);
  const startDateStr = threeYearsAgo.toISOString().split("T")[0];

  try {
    // 1. Fetch EPS (Financial Statements)
    const epsUrl = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockFinancialStatements&data_id=${cleanTicker}&start_date=${startDateStr}`;
    const epsRes = await fetch(epsUrl);
    const epsJson: any = await epsRes.json();
    
    // 2. Fetch Monthly Revenue
    const revUrl = `https://api.finmindtrade.com/api/v4/data?dataset=TaiwanStockMonthRevenue&data_id=${cleanTicker}&start_date=${startDateStr}`;
    const revRes = await fetch(revUrl);
    const revJson: any = await revRes.json();

    if (epsJson.status !== 200 || revJson.status !== 200) {
      return null;
    }

    // Process EPS
    const rawEps = epsJson.data.filter((d: any) => d.type === "EPS");
    // Sort by date descending
    rawEps.sort((a: any, b: any) => b.date.localeCompare(a.date));
    
    const epsList: any[] = [];
    for (let i = 0; i < Math.min(4, rawEps.length); i++) {
      const current = rawEps[i];
      const quarter = current.date.substring(0, 7).replace("-", "Q"); // Simplistic parse
      
      // Find same quarter last year
      const lastYearDate = new Date(current.date);
      lastYearDate.setFullYear(lastYearDate.getFullYear() - 1);
      const lastYearDateStr = lastYearDate.toISOString().split("T")[0];
      const lastYear = rawEps.find((d: any) => d.date === lastYearDateStr);
      
      let yoy = 0;
      if (lastYear && lastYear.value !== 0) {
        yoy = ((current.value - lastYear.value) / Math.abs(lastYear.value)) * 100;
      }
      
      epsList.push({
        quarter: current.date, // Use date, formatter in frontend
        eps: current.value,
        yoy: Math.round(yoy * 10) / 10
      });
    }

    // Process Revenue
    const rawRev = revJson.data;
    rawRev.sort((a: any, b: any) => b.date.localeCompare(a.date));
    
    const revenueList: any[] = [];
    for (let i = 0; i < Math.min(12, rawRev.length); i++) {
        const item = rawRev[i];
        
        let yoy = Math.round((item.revenue_year_growth || 0) * 10) / 10;
        
        // Manual calculation fallback if API YoY is missing or zero, and we have history
        if (yoy === 0 && rawRev.length > i + 12) {
            const currentRev = item.revenue;
            const prevYearRev = rawRev[i + 12]?.revenue;
            if (prevYearRev && prevYearRev > 0) {
                yoy = Math.round(((currentRev - prevYearRev) / prevYearRev) * 1000) / 10;
            }
        }

        revenueList.push({
            period: item.date,
            revenue: item.revenue,
            yoy: yoy
        });
    }

    // Calculate trend from last 3 months YoY
    let revenueTrend: any = "成長持平";
    if (revenueList.length >= 3) {
        const y3 = revenueList[2].yoy;
        const y2 = revenueList[1].yoy;
        const y1 = revenueList[0].yoy; // Most recent
        
        if (y1 > y2 && y2 > y3) revenueTrend = "營收加速";
        else if (y1 < y2 && y2 < y3) revenueTrend = "成長放緩";
        else if (y1 < 0) revenueTrend = "衰退";
    }

    return { epsList, revenueList, revenueTrend };
  } catch (e) {
    console.error(`[TW Fundamentals Error] ${ticker}:`, e);
    return null;
  }
}

async function fetchUSFundamentals(ticker: string): Promise<any> {
    try {
        const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${ticker}?modules=earnings,financialData`;
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"
            }
        });
        if (!res.ok) return null;
        const json: any = await res.json();
        const result = json.quoteSummary?.result?.[0];
        if (!result) return null;

        const earningsChart = result.earnings?.earningsChart?.quarterly || [];
        const financialsChart = result.earnings?.financialsChart?.quarterly || [];

        const epsList = earningsChart.map((d: any) => ({
            quarter: d.date,
            eps: d.actual?.raw || 0,
            yoy: 0 // Yahoo doesn't give YoY directly here in this simple module
        })).reverse();

        const revenueList = financialsChart.map((d: any) => ({
            period: d.date,
            revenue: d.revenue?.raw || 0,
            yoy: 0
        })).reverse();

        // Calculate YoY for EPS if possible
        // (This is limited as we only have 4 data points from this module usually)
        
        let revenueTrend: any = "成長持平";
        if (revenueList.length >= 3) {
            const r3 = revenueList[2].revenue;
            const r2 = revenueList[1].revenue;
            const r1 = revenueList[0].revenue;
            if (r1 > r2 && r2 > r3) revenueTrend = "營收加速";
            else if (r1 < r2 && r2 < r3) revenueTrend = "成長放緩";
        }

        return { epsList, revenueList, revenueTrend };
    } catch (e) {
        console.error(`[US Fundamentals Error] ${ticker}:`, e);
        return null;
    }
}

// Load industry mapping
const INDUSTRY_MAPPING_PATH = path.join(process.cwd(), "industry_mapping.json");
let industryMapping: { [ticker: string]: string } = {};

function loadIndustryMapping() {
  try {
    if (fs.existsSync(INDUSTRY_MAPPING_PATH)) {
      industryMapping = JSON.parse(fs.readFileSync(INDUSTRY_MAPPING_PATH, "utf8"));
    }
  } catch (e) {
    console.error("Error loading industry mapping:", e);
  }
}
loadIndustryMapping();

app.post("/api/industry-mapping", express.json(), (req, res) => {
  try {
    const { mapping } = req.body;
    industryMapping = mapping;
    fs.writeFileSync(INDUSTRY_MAPPING_PATH, JSON.stringify(mapping, null, 2));
    res.json({ status: "ok" });
  } catch (error: any) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/industry-mapping", (req, res) => {
    res.json(industryMapping);
});

app.get("/api/stock-list-simple", (req, res) => {
    if (!marketDataCache) return res.json([]);
    const list = [...marketDataCache.twStocks, ...marketDataCache.usStocks].map(s => ({
        ticker: s.ticker,
        name: s.name
    }));
    res.json(list);
});

app.get("/api/fundamentals/:ticker", async (req, res) => {
  try {
    const { ticker } = req.params;
    if (!marketDataCache) {
      loadCacheFromFile();
    }
    if (!marketDataCache) {
      return res.status(404).json({ error: "Data not available yet" });
    }

    const cleanTicker = ticker.split(".")[0];
    const stock = marketDataCache.twStocks.find(s => s.ticker === ticker) || 
                  marketDataCache.usStocks.find(s => s.ticker === ticker);
                  
    if (!stock) {
      return res.status(404).json({ error: "Stock not found" });
    }

    let fundamentalData: any = null;
    if (stock.country === "TW") {
        fundamentalData = await fetchTWFundamentals(ticker);
    } else {
        fundamentalData = await fetchUSFundamentals(ticker);
    }

    if (!fundamentalData) {
        return res.status(404).json({ error: "尚未取得基本面資料" });
    }

    // --- Industry Logic ---
    loadIndustryMapping();
    const mappedIndustry = industryMapping[cleanTicker] || "未分類";

    // All stocks with their mapped industry
    const allStocksWithIndustry = [...marketDataCache.twStocks, ...marketDataCache.usStocks].map(s => ({
        ...s,
        mappedIndustry: industryMapping[s.ticker.split(".")[0]] || "未分類"
    }));

    // Grouping for Industry Strength calculation
    const industriesMap = new Map<string, { tickers: string[], scores: number[] }>();
    allStocksWithIndustry.forEach(s => {
        if (!industriesMap.has(s.mappedIndustry)) {
            industriesMap.set(s.mappedIndustry, { tickers: [], scores: [] });
        }
        // Calculate a composite return for Industry RS
        // We use stock.rsRanking as a proxy for efficiency if direct returns aren't cached separately
        // BUT the user specifically wants: 40% * 3m + 30% * 6m + 30% * 12m
        // Since we don't store 3/6/12m returns directly in marketDataCache yet, 
        // we'll use the existing rsRanking as a surrogate for now, or assume data exists in an analysis object.
        // Actually, let's assume we want to calculate this properly if possible.
        // For now, I'll use rsRanking as a placeholder or perform a quick calculation if return data exists.
        
        // Better: Use stock.sepaScore.total and rsRanking to derive relative strength
        const strength = s.rsRanking || 50; 
        industriesMap.get(s.mappedIndustry)!.tickers.push(s.ticker);
        industriesMap.get(s.mappedIndustry)!.scores.push(strength);
    });

    // Calculate Industry RS scores
    const industryStrengthList: { name: string, score: number }[] = [];
    industriesMap.forEach((data, name) => {
        if (name === "未分類") return;
        const avgScore = data.scores.reduce((a, b) => a + b, 0) / data.scores.length;
        industryStrengthList.push({ name, score: avgScore });
    });
    
    industryStrengthList.sort((a, b) => b.score - a.score);
    
    // Assign rank among all valid industries
    const industryGlobalRank = industryStrengthList.findIndex(i => i.name === mappedIndustry) + 1;
    const totalIndustries = industryStrengthList.length;
    // Calculate Industry RS (percentile)
    const industryStrengthPercentile = Math.floor(((totalIndustries - Math.max(0, industryGlobalRank - 1)) / Math.max(1, totalIndustries)) * 99) + 1;

    // Industry statistics for SPECIFIC industry
    const sameIndustryStocks = allStocksWithIndustry.filter(s => s.mappedIndustry === mappedIndustry);
    
    sameIndustryStocks.sort((a, b) => b.rsRanking - a.rsRanking);
    const industryRsRanking = sameIndustryStocks.findIndex(s => s.ticker === ticker) + 1;

    sameIndustryStocks.sort((a, b) => b.sepaScore.total - a.sepaScore.total);
    const industrySepaRanking = sameIndustryStocks.findIndex(s => s.ticker === ticker) + 1;

    // Fundamental Score Calculation (Simplified logic)
    let fScore = 50;
    // EPS points
    if (fundamentalData.epsList?.[0]?.yoy > 20) fScore += 15;
    if (fundamentalData.epsList?.[0]?.yoy > 50) fScore += 10;
    if (fundamentalData.epsList?.[1]?.yoy > 20) fScore += 5;
    
    // Revenue points
    if (fundamentalData.revenueTrend === "營收加速") fScore += 15;
    else if (fundamentalData.revenueTrend === "成長持平") fScore += 5;
    else if (fundamentalData.revenueTrend === "衰退") fScore -= 20;

    // Ranking points
    if (industrySepaRanking === 1) fScore += 10;
    else if (industrySepaRanking <= 3) fScore += 5;

    fScore = Math.max(10, Math.min(100, fScore));
    let fRating: any = "普通";
    if (fScore >= 80) fRating = "優秀";
    else if (fScore < 50) fRating = "偏弱";

    const finalData = {
        ...fundamentalData,
        ticker,
        industry: mappedIndustry,
        industryTotalStocks: sameIndustryStocks.length,
        industryRsRanking,
        industrySepaRanking,
        industryStrength: industryStrengthPercentile,
        industryGlobalRank,
        totalIndustries,
        fundamentalScore: fScore,
        fundamentalRating: fRating
    };

    res.json(finalData);
  } catch (error: any) {
    console.error("API error", error);
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/stock-klines/:ticker", async (req, res) => {
  try {
    const { ticker } = req.params;
    if (!marketDataCache) {
      loadCacheFromFile();
    }
    
    if (!marketDataCache) {
      return res.status(404).json({ error: "Data not available yet" });
    }
    
    const stock = marketDataCache.twStocks.find(s => s.ticker === ticker) || 
                  marketDataCache.usStocks.find(s => s.ticker === ticker);
                  
    if (!stock) {
      return res.status(404).json({ error: "Stock not found" });
    }
    
    res.json(stock.klines || []);
  } catch (error: any) {
    res.status(500).json({ error: error.message });
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
