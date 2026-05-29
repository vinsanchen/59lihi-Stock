/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { 
  TrendingUp, 
  BarChart3, 
  Award, 
  Layers, 
  AlertCircle, 
  CheckCircle2, 
  Activity,
  ArrowUpRight,
  TrendingDown
} from "lucide-react";
import { FundamentalData } from "../types";

interface Props {
  data: FundamentalData | null;
  loading: boolean;
}

export default function FundamentalAnalysis({ data, loading }: Props) {
  if (loading) {
    return (
      <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-8 flex flex-col items-center justify-center space-y-4 animate-pulse">
        <div className="w-10 h-10 bg-slate-800 rounded-full flex items-center justify-center">
          <Activity className="w-5 h-5 text-indigo-400 animate-spin" />
        </div>
        <p className="text-gray-400 text-xs font-bold font-sans">正在調取財報數據與大數據排名檢索...</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-8 flex flex-col items-center justify-center space-y-3 text-center">
        <AlertCircle className="w-8 h-8 text-slate-700" />
        <div className="space-y-1">
            <h4 className="text-gray-400 font-bold text-sm">資料尚未取得</h4>
            <p className="text-gray-600 text-[10px]">該標的基本面財報數據目前無法獲取，或尚未更新。</p>
        </div>
      </div>
    );
  }

  const getTrendColor = (trend: string) => {
    switch (trend) {
      case "營收加速": return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
      case "成長持平": return "text-amber-400 bg-amber-500/10 border-amber-500/20";
      case "成長放緩": return "text-amber-500 bg-amber-500/10 border-amber-500/20";
      case "衰退": return "text-rose-400 bg-rose-500/10 border-rose-500/20";
      default: return "text-gray-400 bg-gray-500/10 border-gray-500/20";
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return "text-emerald-400";
    if (score >= 50) return "text-amber-400";
    return "text-rose-400";
  };

  const getRatingBadge = (rating: string) => {
    switch (rating) {
        case "優秀": return <span className="px-2 py-0.5 bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 rounded text-[10px] font-black">🟢 優秀</span>;
        case "普通": return <span className="px-2 py-0.5 bg-amber-500/20 text-amber-500 border border-amber-500/30 rounded text-[10px] font-black">🟡 普通</span>;
        case "偏弱": return <span className="px-2 py-0.5 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded text-[10px] font-black">🔴 偏弱</span>;
        default: return null;
    }
  };

  return (
    <div className="space-y-6 animate-fade-in py-4">
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <Layers className="w-5 h-5 text-indigo-400" />
        <h3 className="text-lg font-black text-white tracking-tight">【基本面分析】Fundamental Matrix</h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
        
        {/* EPS Analysis */}
        <div className="md:col-span-4 bg-[#161B22] border border-[#30363D] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-gray-200 flex items-center gap-1.5 uppercase tracking-wider">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    EPS 成長分析 (近4季)
                </h4>
            </div>

            <div className="space-y-3">
                {data.epsList.map((eps, i) => (
                    <div key={i} className="flex items-center justify-between bg-black/20 p-2.5 rounded-lg border border-slate-800/40">
                        <div className="flex flex-col">
                            <span className="text-[10px] font-mono text-gray-500 font-bold uppercase">{eps.quarter}</span>
                            <span className="text-sm font-mono font-black text-gray-100">{eps.eps.toFixed(2)}</span>
                        </div>
                        <div className="text-right">
                            <span className="text-[9px] text-gray-500 block font-bold uppercase">YoY %</span>
                            <span className={`text-xs font-mono font-black flex items-center justify-end ${eps.yoy >= 20 ? "text-emerald-400" : eps.yoy >= 0 ? "text-amber-400" : "text-rose-400"}`}>
                                {eps.yoy >= 0 ? "+" : ""}{eps.yoy}%
                                {eps.yoy >= 20 ? <CheckCircle2 className="w-3 h-3 ml-1" /> : (eps.yoy < 0 ? <AlertCircle className="w-3 h-3 ml-1" /> : null)}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
            
            <div className="p-2.5 bg-slate-950/50 rounded-lg border border-slate-800 text-[10px] text-gray-500 leading-relaxed font-medium">
                註：Mark Minervini 強調 EPS 成長應在 25% 以上，最佳強勢股常出現 50%-100% 以上的爆發性成長。
            </div>
        </div>

        {/* Revenue Analysis */}
        <div className="md:col-span-5 bg-[#161B22] border border-[#30363D] rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-gray-200 flex items-center gap-1.5 uppercase tracking-wider">
                    <BarChart3 className="w-4 h-4 text-sky-400" />
                    營收增長趨勢 (近12個月 YoY)
                </h4>
                <div className={`px-2 py-0.5 rounded text-[10px] font-black border ${getTrendColor(data.revenueTrend)}`}>
                    {data.revenueTrend === "營收加速" && "🟢 "}{data.revenueTrend === "成長放緩" && "🟡 "}{data.revenueTrend === "衰退" && "🔴 "}{data.revenueTrend}
                </div>
            </div>

            <div className="h-[120px] flex items-end justify-between gap-1 px-1">
                {data.revenueList.slice(0, 12).reverse().map((rev, i) => (
                    <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group relative">
                        <div className="absolute bottom-full mb-1 bg-black text-[9px] px-1 rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-10 border border-slate-700">
                            {rev.yoy >= 0 ? "+" : ""}{rev.yoy}%
                        </div>
                        <div 
                            className={`w-full rounded-t-sm transition-all duration-300 ${rev.yoy >= 50 ? "bg-emerald-500" : rev.yoy >= 25 ? "bg-emerald-500/60" : rev.yoy >= 0 ? "bg-emerald-500/30" : "bg-rose-500/40"}`}
                            style={{ height: `${Math.min(100, Math.max(5, Math.abs(rev.yoy) * 1.5))}px` }}
                        ></div>
                        <span className="text-[8px] font-mono font-bold text-gray-600 scale-90">{rev.period.substring(5)}</span>
                    </div>
                ))}
            </div>

            <div className="grid grid-cols-3 gap-2">
                <div className="bg-black/20 p-2 rounded-lg border border-slate-800">
                    <span className="block text-[8px] text-gray-500 font-bold uppercase">最新營收 YoY</span>
                    <span className={`text-sm font-mono font-black ${(data.revenueList[0]?.yoy ?? 0) >= 25 ? "text-emerald-400" : "text-gray-200"}`}>
                        {data.revenueList[0] ? `${data.revenueList[0].yoy}%` : "資料不足"}
                    </span>
                </div>
                <div className="bg-black/20 p-2 rounded-lg border border-slate-800">
                    <span className="block text-[8px] text-gray-500 font-bold uppercase">前月營收 YoY</span>
                    <span className="text-sm font-mono font-black text-gray-200">
                        {data.revenueList[1] ? `${data.revenueList[1].yoy}%` : "資料不足"}
                    </span>
                </div>
                <div className="bg-black/20 p-2 rounded-lg border border-slate-800">
                    <span className="block text-[8px] text-gray-500 font-bold uppercase">前前月 YoY</span>
                    <span className="text-sm font-mono font-black text-gray-200">
                        {data.revenueList[2] ? `${data.revenueList[2].yoy}%` : "資料不足"}
                    </span>
                </div>
            </div>

            <div className="p-2.5 bg-slate-950/50 rounded-lg border border-slate-800 text-[10px] text-gray-500 leading-relaxed font-medium">
                趨勢判斷：營收加速 (YoY 持續擴大) 是基本面最強的驅動力。若 YoY 開始縮減即為警戒信號。
            </div>
        </div>

        {/* Global Ranks & Score */}
        <div className="md:col-span-3 flex flex-col gap-4">
            
            <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-5 flex-1 space-y-4">
                <div className="flex items-center gap-2">
                    <Award className="w-4 h-4 text-amber-500" />
                    <h4 className="text-xs font-bold text-gray-200 uppercase tracking-wider">產業排名與數據</h4>
                </div>

                <div className="space-y-3">
                    <div className="bg-black/20 p-3 rounded-xl border border-slate-800">
                        <span className="text-[10px] text-gray-500 block font-bold uppercase">產業分類</span>
                        <span className="text-sm font-bold text-indigo-400">{data.industry}</span>
                        <div className="flex items-center justify-between mt-1">
                            <span className="text-[10px] text-gray-600">樣本總數：{data.industryTotalStocks} 檔</span>
                            {data.industry === "未分類" && <span className="text-[9px] text-rose-500/70 animate-pulse underline">請手動分類以計算強度</span>}
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        <div className="bg-black/20 p-2.5 rounded-xl border border-slate-800 text-center">
                            <span className="text-[8px] text-gray-500 block font-bold uppercase">產業排名</span>
                            <span className="text-sm font-mono font-black text-white">{data.industryGlobalRank || "-"} / {data.totalIndustries || "-"}</span>
                        </div>
                        <div className="bg-black/20 p-2.5 rounded-xl border border-slate-800 text-center">
                            <span className="text-[8px] text-gray-500 block font-bold uppercase">產業強度 RS</span>
                            <span className={`text-sm font-mono font-black ${data.industryStrength && data.industryStrength >= 80 ? "text-emerald-400" : "text-amber-400"}`}>{data.industryStrength || "-"}</span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <div className="bg-black/20 p-2.5 rounded-xl border border-slate-800 flex justify-between items-center px-4">
                            <span className="text-[10px] text-gray-500 font-bold uppercase">產業內 RS 排名</span>
                            <span className="text-sm font-mono font-black text-white">{data.industryRsRanking} / {data.industryTotalStocks}</span>
                        </div>
                        <div className="bg-black/20 p-2.5 rounded-xl border border-slate-800 flex justify-between items-center px-4">
                            <span className="text-[10px] text-gray-500 font-bold uppercase">產業內 SEPA 排名</span>
                            <span className="text-sm font-mono font-black text-emerald-400">{data.industrySepaRanking} / {data.industryTotalStocks}</span>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-indigo-950/10 border border-indigo-500/20 rounded-xl p-5 flex items-center justify-between relative overflow-hidden group">
                <div className="absolute right-[-10px] bottom-[-10px] text-indigo-500/5 font-black text-6xl group-hover:scale-110 transition-transform">FIX</div>
                <div className="space-y-1 relative z-10">
                    <span className="text-[10px] text-indigo-400 font-black uppercase tracking-widest">Fundamental Score</span>
                    <div className="flex items-baseline gap-2">
                        <span className={`text-4xl font-mono font-black tracking-tighter ${getScoreColor(data.fundamentalScore)}`}>{data.fundamentalScore}</span>
                        <span className="text-xs text-gray-500 font-bold">/ 100</span>
                    </div>
                    <div className="mt-1">
                        {getRatingBadge(data.fundamentalRating)}
                    </div>
                </div>
                <div className="w-12 h-12 rounded-full border-4 border-indigo-500/20 flex items-center justify-center relative z-10">
                   <div 
                     className={`w-full h-full rounded-full border-4 border-t-indigo-500 border-r-indigo-500 border-b-transparent border-l-transparent animate-[spin_3s_linear_infinite] absolute`}
                     style={{ borderTopColor: data.fundamentalScore >= 80 ? '#10b981' : (data.fundamentalScore >= 50 ? '#f59e0b' : '#ef4444') }}
                   ></div>
                   <Activity className={`w-5 h-5 ${getScoreColor(data.fundamentalScore)}`} />
                </div>
            </div>

        </div>

      </div>
    </div>
  );
}
