/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StockAnalysis, SepaWeights, KLine } from "../types";

export const DEFAULT_WEIGHTS: SepaWeights = {
  trendTemplate: 40,
  rsStrength: 20,
  vcpPattern: 20,
  volumeDryUp: 10,
  riskReward: 10,
};

/**
 * Data provider that bridges the frontend to the real-time scanning backend.
 * No mock data is utilized; returns actual market findings collected via TWSE/Yahoo/FinMind.
 */
export class DataProvider {
  private static twStocks: StockAnalysis[] = [];
  private static usStocks: StockAnalysis[] = [];
  private static weights: SepaWeights = DEFAULT_WEIGHTS;
  private static lastUpdated: string = "";
  private static poolCount: number = 0;
  private static topIndustries: any[] = [];
  private static taiexVal = { price: 0, changePercent: 0, date: "" };
  private static nasdaqVal = { price: 0, changePercent: 0, date: "" };

  public static async loadFromAPI(force = false, customWeights?: SepaWeights): Promise<{ success: boolean; isSyncing: boolean; message?: string }> {
    if (customWeights) {
      this.weights = customWeights;
    }
    try {
      const url = `/api/market-data${force ? "?force=true" : ""}`;
      const res = await fetch(url);
      if (!res.ok) {
        throw new Error("市場資料同步失敗，請檢查資料來源。");
      }
      const data = await res.json();
      if (data) {
        if (data.lastUpdated) this.lastUpdated = data.lastUpdated;
        if (data.stockPoolCount !== undefined) this.poolCount = data.stockPoolCount;
        if (data.topIndustries) this.topIndustries = data.topIndustries;
        if (data.taiex) this.taiexVal = data.taiex;
        if (data.nasdaq) this.nasdaqVal = data.nasdaq;
        
        // Always update twStocks if data is present, don't wait for sync completion
        if (data.twStocks && data.twStocks.length > 0) {
          if (data.isBackgroundSyncing) {
            // Merge into existing pool during partial syncs to avoid UI jumping/flickering
            // Use normalized Ticker as key to ensure no duplicates during sync
            const exitMap = new Map();
            this.twStocks.forEach(s => exitMap.set(s.ticker.split('.')[0].toUpperCase(), s));
            data.twStocks.forEach((s: StockAnalysis) => exitMap.set(s.ticker.split('.')[0].toUpperCase(), s));
            this.twStocks = Array.from(exitMap.values());
          } else {
            this.twStocks = data.twStocks;
          }
        } else if (!data.isBackgroundSyncing) {
          this.twStocks = data.twStocks || [];
        }

        if (data.usStocks && data.usStocks.length > 0) {
          if (data.isBackgroundSyncing) {
            const exitMap = new Map(this.usStocks.map(s => [s.ticker, s]));
            data.usStocks.forEach((s: StockAnalysis) => exitMap.set(s.ticker, s));
            this.usStocks = Array.from(exitMap.values());
          } else {
            this.usStocks = data.usStocks;
          }
        } else if (!data.isBackgroundSyncing) {
          this.usStocks = data.usStocks || [];
        }

        this.twStocks = this.twStocks.map(s => this.recalculateScore(s));
        this.usStocks = this.usStocks.map(s => this.recalculateScore(s));
        return { success: true, isSyncing: !!data.isBackgroundSyncing, message: data.message };
      }
    } catch (err) {
      console.error("[DataProvider] API retrieval failed:", err);
      throw err;
    }
    return { success: false, isSyncing: false };
  }

  // Live recalculator of SEPA Scores based on settings weights
  private static recalculateScore(stock: StockAnalysis): StockAnalysis {
    if (!stock.sepaScore) return stock;
    
    const rawSepa = stock.sepaScore;
    const weights = this.weights;

    // Normalize elements with custom weights and strictly cap them
    const weightedTrend = Math.min(weights.trendTemplate, (rawSepa.trendTemplate || 0) * (weights.trendTemplate / 40));
    const weightedRS = Math.min(weights.rsStrength, (rawSepa.rsStrength || 0) * (weights.rsStrength / 20));
    const weightedVCP = Math.min(weights.vcpPattern, (rawSepa.vcpPattern || 0) * (weights.vcpPattern / 20));
    const weightedVol = Math.min(weights.volumeDryUp, (rawSepa.volumeDryUp || 0) * (weights.volumeDryUp / 10));
    const weightedRR = Math.min(weights.riskReward, (rawSepa.riskReward || 0) * (weights.riskReward / 10));

    const totalValue = Math.max(10, Math.min(100, Math.round(
      weightedTrend + weightedRS + weightedVCP + weightedVol + weightedRR
    ) - (rawSepa.penalty || 0)));

    stock.sepaScore = {
      ...rawSepa,
      trendTemplate: Math.round(weightedTrend),
      rsStrength: Math.round(weightedRS),
      vcpPattern: Math.round(weightedVCP),
      volumeDryUp: Math.round(weightedVol),
      riskReward: Math.round(weightedRR),
      total: totalValue,
    };

    return stock;
  }

  public static async fetchKlines(ticker: string): Promise<KLine[]> {
    try {
      const res = await fetch(`/api/stock-klines/${ticker}`);
      if (!res.ok) return [];
      return await res.json();
    } catch (err) {
      console.error("[DataProvider] Failed to fetch klines:", err);
      return [];
    }
  }

  public static getTwStocks(weights?: SepaWeights): StockAnalysis[] {
    if (weights) {
      this.weights = weights;
      this.twStocks = this.twStocks.map(s => this.recalculateScore(s));
    }
    return [...this.twStocks];
  }

  public static getUsStocks(weights?: SepaWeights): StockAnalysis[] {
    if (weights) {
      this.weights = weights;
      this.usStocks = this.usStocks.map(s => this.recalculateScore(s));
    }
    return [...this.usStocks];
  }

  public static getStockByTicker(ticker: string): StockAnalysis | undefined {
    const cleanTicker = ticker.toUpperCase();
    const twMatch = this.twStocks.find(s => s.ticker.toUpperCase() === cleanTicker || s.ticker.split(".")[0].toUpperCase() === cleanTicker);
    if (twMatch) return twMatch;
    return this.usStocks.find(s => s.ticker.toUpperCase() === cleanTicker);
  }

  public static getLastUpdated(): string {
    return this.lastUpdated;
  }

  public static getStockPoolCount(): number {
    return this.poolCount;
  }

  public static getTaiex() {
    return this.taiexVal;
  }

  public static getNasdaq() {
    return this.nasdaqVal;
  }

  public static getTopIndustries() {
    return this.topIndustries;
  }
}
