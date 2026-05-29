/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface KLine {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  ma50?: number;
  ma150?: number;
  ma200?: number;
}

export interface TrendTemplateResult {
  passed: boolean;
  closeAbove50MA: boolean;       // 1. 收盤價 > 50MA
  ma50Above150MA: boolean;       // 2. 50MA > 150MA
  ma50Above200MA: boolean;       // 3. 50MA > 200MA
  ma150Above200MA: boolean;      // 4. 150MA > 200MA
  ma200Rising20Days: boolean;    // 5. 200MA 最近至少 20 交易日呈上升
  closeAbove52WLowPct: boolean;  // 6. 接近 52 週低點 +30% 以上
  closeNear52WHighPct: boolean;  // 7. 距離 52 週高點不超過 25%
  rsRankingAbove70: boolean;     // 8. RS Ranking >= 70 (最好 80 以上)
}

export interface SEPAScoreResult {
  total: number;
  trendTemplate: number;  // Max 40%
  rsStrength: number;     // Max 20%
  vcpPattern: number;     // Max 20%
  volumeDryUp: number;    // Max 10%
  riskReward: number;     // Max 10%
  penalty?: number;
}

export interface QuarterEPS {
  quarter: string;
  eps: number;
  yoy: number;
}

export interface MonthlyRevenue {
  period: string;
  revenue: number;
  yoy: number;
}

export interface FundamentalData {
  ticker: string;
  epsList: QuarterEPS[];
  revenueList: MonthlyRevenue[];
  revenueTrend: "營收加速" | "成長持平" | "成長放緩" | "衰退";
  industry: string;
  industryTotalStocks: number;
  industryRsRanking: number;
  industrySepaRanking: number;
  industryStrength?: number; // Industry RS 0~99
  industryGlobalRank?: number; // Industry Rank among all industries
  totalIndustries?: number;
  fundamentalScore: number;
  fundamentalRating: "優秀" | "普通" | "偏弱";
}

export interface StockAnalysis {
  ticker: string;
  name: string;
  marketType: string;      // "TSE" | "OTC" | "NYSE" | "NASDAQ" | "AMEX"
  country: "TW" | "US";
  mainIndustry?: string;   // "電子類" | "金融類" | "傳產類"
  subIndustry?: string;    // "半導體" | "AI 伺服器" | "PCB / ABF" | "散熱" | "電源 / 功率半導體" | ""
  lastClose: number;
  changePercent: number;
  volume: number;
  avgVolume20: number;
  high52Week: number;
  low52Week: number;
  rsRanking: number;
  trendTemplate: TrendTemplateResult;
  sepaScore: SEPAScoreResult;
  pattern: string;         // VCP 型態名稱
  buyPoint: number;        // Pivot 突破價
  originalPivot?: number;  // 原始突破 Pivot
  pivotCreationDate?: string; // Pivot 建立日期
  pivotStatus?: 'Active' | 'Fixed' | 'Breakout'; // Pivot 狀態
  isNewBase?: boolean;     // 是否形成新 Base
  stopLoss: number;        // 初始停損價
  riskPercent: number;     // 停損百分比
  status: "接近買點" | "已突破" | "可觀察" | "過度延伸，不建議追" | "型態尚未完成" | "不符合";
  statusEn: "Near Pivot" | "Breakout" | "Watch" | "Overextended" | "Pattern Forming" | "Non-compliant";
  consecutiveDays?: number;
  watchlistCategory?: "核心觀察股" | "接近買點" | "今日突破" | "過度延伸" | "失敗型態" | "一般追蹤";
  watchlistCategoryEn?: "Core Watchlist" | "Near Pivot" | "Breakout Today" | "Extended" | "Failed Setup" | "Regular Watch";
  suggestion: string;
  targetPrice1: number;    // 第一目標價
  targetPrice2: number;    // 第二目標價
  pctToBuyPoint: number;   // 距離買點還差幾 %
  vcpPhaseDesc: string;    // VCP 物理細節描述 (如: 3聲收縮 22% -> 11% -> 3%)
  lastMA50?: number;
  lastMA150?: number;
  lastMA200?: number;
  klineCount?: number;
  klines?: KLine[];
}

export interface SepaWeights {
  trendTemplate: number;
  rsStrength: number;
  vcpPattern: number;
  volumeDryUp: number;
  riskReward: number;
}

export interface FilterSettings {
  searchQuery: string;
  marketFilter: string; // "ALL" | specific type
  statusFilter: string; // "ALL" | specific status
  minScore: number;
  sortField: keyof StockAnalysis | "sepaScoreTotal" | ""; // helper fields
  sortOrder: "asc" | "desc";
}

export interface LiquidityParameters {
  minPrice: number;            // 最低股價 (預設 20 元)
  minTurnover: number;         // 最低日成交金額 (預設 50,000,000 元)
  minAvgVolume: number;        // 最低日均成交量 (預設 1,000,000 股 = 1000張)
  excludeEtf: boolean;         // 排除 ETF (預設 true)
  excludeWarrants: boolean;    // 排除 權證 (預設 true)
  excludePreferred: boolean;   // 排除 特別股 (預設 true)
  excludeEmerging: boolean;     // 排除 興櫃 (預設 true)
  require200Days: boolean;     // 最近 200 日資料完整 (預設 true)
}

