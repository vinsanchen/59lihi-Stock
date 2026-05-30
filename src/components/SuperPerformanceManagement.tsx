/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useMemo } from "react";
import { ShieldCheck, Calendar, TrendingUp, AlertCircle, CheckCircle2, XCircle, Info } from "lucide-react";
import { StockAnalysis, KLine } from "../types";

interface SuperPerformanceManagementProps {
  stock: StockAnalysis;
  klines: KLine[];
}

export default function SuperPerformanceManagement({ stock, klines }: SuperPerformanceManagementProps) {
  const { buyPoint, lastClose, stopLoss, pivotCreationDate, ma50 } = stock;

  const stats = useMemo(() => {
    // Default stats for when no breakout has occurred or data is missing
    const defaultStats = {
        daysSinceBreakout: 0,
        perfSinceBreakout: 0,
        reached20PercentIn3Weeks: false,
        rule8WStatus: 'not_started' as const,
        strategy: 'hold' as const
    };

    if (!pivotCreationDate || klines.length === 0) return defaultStats;

    // Find breakout bar index
    const breakoutIndex = klines.findIndex(k => k.time && (k.time === pivotCreationDate || k.time.startsWith(pivotCreationDate)));
    if (breakoutIndex === -1) return defaultStats;

    // Trading days since breakout
    const daysSinceBreakout = klines.length - 1 - breakoutIndex;
    
    // Performance since breakout
    const perfSinceBreakout = ((lastClose - buyPoint) / buyPoint) * 100;

    // 8-Week Rule Check (If gain >= 20% within 15 trading days of breakout)
    let reached20PercentIn3Weeks = false;
    const windowSize = 15;
    const searchEnd = Math.min(breakoutIndex + windowSize, klines.length);
    
    for (let i = breakoutIndex; i < searchEnd; i++) {
        const highAtTime = klines[i].high;
        const gainAtTime = ((highAtTime - buyPoint) / buyPoint) * 100;
        if (gainAtTime >= 20) {
            reached20PercentIn3Weeks = true;
            break;
        }
    }

    // Status Determination
    let rule8WStatus: 'activated' | 'not_started' | 'failed' = 'not_started';
    if (lastClose < stopLoss || (buyPoint > 0 && lastClose < buyPoint * 0.95)) { 
        rule8WStatus = 'failed';
    } else if (reached20PercentIn3Weeks) {
        rule8WStatus = 'activated';
    }

    // Sell Signal / Management Strategy
    let strategy: 'hold' | 'reduce' | 'exit' = 'hold';
    const isBelowMA50 = ma50 ? lastClose < ma50 : false;
    const isBelowStopLoss = lastClose < stopLoss;
    const isBelowPivot = buyPoint > 0 ? lastClose < buyPoint : false;
    const isOverextended = stock.status === "過度延伸，不建議追";

    if (isBelowStopLoss || isBelowPivot || isBelowMA50) {
        strategy = 'exit';
    } else if (isOverextended || (perfSinceBreakout >= 20 && perfSinceBreakout <= 25 && !reached20PercentIn3Weeks)) {
        // Overextended status or normal 20-25% target profit reached
        strategy = 'reduce';
    } else {
        strategy = 'hold';
    }

    return {
        daysSinceBreakout,
        perfSinceBreakout,
        reached20PercentIn3Weeks,
        rule8WStatus,
        strategy
    };
  }, [stock, klines, pivotCreationDate, lastClose, buyPoint, stopLoss, ma50]);

  // Only show holding management if the stock is actually in a breakout/post-breakout state
  const isBreakoutActive = stock.status === "已突破" || stock.status === "突破回撤" || (stock.status === "過度延伸，不建議追" && stock.pivotStatus === "Breakout");
  
  if (!isBreakoutActive) return null;

  return (
    <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-5 shadow-sm space-y-6">
      {/* Header */}
      <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-400" />
            <h4 className="font-sans font-bold text-gray-100">超級績效持股管理</h4>
        </div>
        <div className="text-[10px] text-gray-500 font-mono font-bold uppercase tracking-widest bg-slate-900 px-2 py-0.5 rounded border border-slate-800">
            Holding Risk Matrix
        </div>
      </div>

      {/* Grid Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Breakout Info */}
        <div className="space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/50">
               <span className="text-[11px] text-gray-500 font-bold flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5" /> 突破日點位 / 日期</span>
               <span className="text-xs font-mono font-black text-indigo-400">{buyPoint} <span className="text-gray-600 font-normal ml-1">({pivotCreationDate})</span></span>
            </div>
            
            <div className="flex items-center justify-between pb-2 border-b border-slate-800/50">
               <span className="text-[11px] text-gray-500 font-bold flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> 突破後交易日數</span>
               <span className="text-xs font-mono font-black text-gray-200">{stats.daysSinceBreakout} 天</span>
            </div>

            <div className="flex items-center justify-between pb-2 border-b border-slate-800/50">
               <span className="text-[11px] text-gray-500 font-bold flex items-center gap-1.5"><TrendingUp className="w-3.5 h-3.5" /> 突破後目前漲幅</span>
               <span className={`text-xs font-mono font-black ${stats.perfSinceBreakout >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                 {stats.perfSinceBreakout > 0 ? "+" : ""}{stats.perfSinceBreakout.toFixed(2)}%
               </span>
            </div>
        </div>

        {/* 8-Week Rule Status */}
        <div className="bg-black/30 p-4 rounded-xl border border-slate-800 flex flex-col justify-center items-center text-center space-y-2 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-indigo-500 to-violet-500 opacity-20"></div>
            <span className="text-[10px] text-gray-500 font-black uppercase tracking-widest">8 週規則狀態</span>
            
            {stats.rule8WStatus === 'activated' ? (
                <>
                    <div className="flex items-center gap-2 text-emerald-400 font-black text-base">
                        <CheckCircle2 className="w-5 h-5 fill-emerald-500/10" /> 8週規則已啟動
                    </div>
                    <p className="text-[10px] text-gray-400 leading-relaxed px-2">
                        代表突破後動能極強，建議不要急著在 20%~25% 獲利區賣出，除非跌破 50MA、跌破 Pivot 或出現突破失敗。
                    </p>
                </>
            ) : stats.rule8WStatus === 'failed' ? (
                <>
                    <div className="flex items-center gap-2 text-rose-400 font-black text-base">
                        <XCircle className="w-5 h-5 fill-rose-500/10" /> 8週規則失效
                    </div>
                    <p className="text-[10px] text-gray-400 leading-relaxed px-2">
                        目前已跌破關鍵防守位置，應優先執行風險控管。
                    </p>
                </>
            ) : (
                <>
                    <div className="flex items-center gap-2 text-gray-400 font-black text-base">
                        <AlertCircle className="w-5 h-5" /> 尚未啟動
                    </div>
                    <p className="text-[10px] text-gray-500 leading-relaxed px-2">
                        尚未啟動 8 週規則。若突破後 3 週（15個交易日）內漲幅達 20%，可視為超級強勢股，暫停 20%~25% 獲利了結策略。
                    </p>
                </>
            )}
        </div>
      </div>

      {/* Strategy Recommendation */}
      <div className={`p-4 rounded-xl border flex items-center justify-between transition-all ${
        stats.strategy === 'hold' ? "bg-emerald-500/10 border-emerald-500/20" :
        stats.strategy === 'reduce' ? "bg-amber-500/10 border-amber-500/20" :
        "bg-rose-500/10 border-rose-500/20"
      }`}>
        <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center border ${
                 stats.strategy === 'hold' ? "bg-emerald-500/20 border-emerald-500/30 text-emerald-400" :
                 stats.strategy === 'reduce' ? "bg-amber-500/20 border-amber-500/30 text-amber-400" :
                 "bg-rose-500/20 border-rose-500/30 text-rose-400"
            }`}>
                {stats.strategy === 'hold' ? <ShieldCheck className="w-6 h-6" /> : stats.strategy === 'reduce' ? <Info className="w-6 h-6" /> : <AlertCircle className="w-6 h-6" />}
            </div>
            <div>
                <h5 className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-0.5">持股管理建議</h5>
                <div className={`text-sm font-black ${
                     stats.strategy === 'hold' ? "text-emerald-400" :
                     stats.strategy === 'reduce' ? "text-amber-400" :
                     "text-rose-400"
                }`}>
                    {stats.strategy === 'hold' ? "🟢 持有" : stats.strategy === 'reduce' ? "🟡 減碼觀察" : "🔴 出場"}
                </div>
            </div>
        </div>
        
        <div className="text-right hidden sm:block">
            <p className="text-[10px] text-gray-500 leading-tight max-w-[200px]">
                {stats.strategy === 'hold' ? "目前價格仍在 Pivot、50MA 及停損點之上，趨勢健康。" :
                 stats.strategy === 'reduce' ? (stock.status === "過度延伸，不建議追" ? "股價已大幅偏離均線與 Pivot（過度延伸），建議分批獲利了結並收緊移動停利。" : "已進入 20%-25% 獲利滿足區，且非 8週超強勢股，建議落袋為安。") :
                 "已觸發賣出條件（跌破 Pivot、50MA 或停損點），請依紀律執行交易。"}
            </p>
        </div>
      </div>
    </div>
  );
}
