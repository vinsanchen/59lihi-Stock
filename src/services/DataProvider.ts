/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { StockAnalysis, SepaWeights } from "../types";

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
  private static taiexVal = { price: 0, changePercent: 0, date: "" };
  private static nasdaqVal = { price: 0, changePercent: 0, date: "" };

  public static async loadFromAPI(force = false, customWeights?: SepaWeights): Promise<boolean> {
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
        if (data.taiex) this.taiexVal = data.taiex;
        if (data.nasdaq) this.nasdaqVal = data.nasdaq;
        if (data.twStocks) this.twStocks = data.twStocks;
        if (data.usStocks) this.usStocks = data.usStocks;

        this.twStocks = this.twStocks.map(s => this.recalculateScore(s));
        this.usStocks = this.usStocks.map(s => this.recalculateScore(s));
        return true;
      }
    } catch (err) {
      console.error("[DataProvider] API retrieval failed:", err);
      throw err;
    }
    return false;
  }

  // Live recalculator of SEPA Scores based on settings weights
  private static recalculateScore(stock: StockAnalysis): StockAnalysis {
    if (!stock.sepaScore) return stock;
    
    const rawSepa = stock.sepaScore;
    const weights = this.weights;

    // Normalize elements with custom weights
    const trendWeightRatio = weights.trendTemplate / 40;
    const rsWeightRatio = weights.rsStrength / 20;
    const vcpWeightRatio = weights.vcpPattern / 20;
    const volWeightRatio = weights.volumeDryUp / 10;
    const rrWeightRatio = weights.riskReward / 10;

    const weightedTrend = (rawSepa.trendTemplate || 0) * trendWeightRatio;
    const weightedRS = (rawSepa.rsStrength || 0) * rsWeightRatio;
    const weightedVCP = (rawSepa.vcpPattern || 0) * vcpWeightRatio;
    const weightedVol = (rawSepa.volumeDryUp || 0) * volWeightRatio;
    const weightedRR = (rawSepa.riskReward || 0) * rrWeightRatio;

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
}
