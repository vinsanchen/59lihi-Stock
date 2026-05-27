/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { StockAnalysis, SepaWeights } from "../types";

interface SepaScoresProps {
  stock: StockAnalysis;
  customWeights?: SepaWeights;
}

export default function SepaScores({ stock, customWeights }: SepaScoresProps) {
  const score = stock.sepaScore;

  // Use weights to show maximum boundaries
  const weights = customWeights || {
    trendTemplate: 40,
    rsStrength: 20,
    vcpPattern: 20,
    volumeDryUp: 10,
    riskReward: 10,
  };

  // Safe division to handle dynamic user configurations (protecting against total = 0 division errors)
  const getPercentage = (val: number, max: number) => {
    if (max <= 0) return 0;
    return Math.min(100, Math.round((val / max) * 100));
  };

  // Dynamic progress meters
  const subCategories = [
    {
      name: "趨勢樣板 (Trend)",
      value: score.trendTemplate,
      max: 40,
      weight: weights.trendTemplate,
      color: "from-indigo-500 to-violet-500",
      description: "核對均線多頭排列及上升指針條件 (100% 多頭加權 40 分)。",
    },
    {
      name: "RS 相對強度 (Relative Strength)",
      value: score.rsStrength,
      max: 20,
      weight: weights.rsStrength,
      color: "from-blue-500 to-indigo-500",
      description: `檢驗相較於全市場板塊的相對升幅表現，RS值: ${stock.rsRanking}。`,
    },
    {
      name: "VCP 整理形態 (VCP Structure)",
      value: score.vcpPattern,
      max: 20,
      weight: weights.vcpPattern,
      color: "from-teal-500 to-emerald-500",
      description: "考量波動震幅收緊(T)及底部籌碼鞏固完整度。",
    },
    {
      name: "成交量結構 (Vol Dry-up)",
      value: score.volumeDryUp,
      max: 10,
      weight: weights.volumeDryUp,
      color: "from-amber-500 to-orange-500",
      description: `拉回及收緊過程中是否展現顯著籌碼枯竭級量縮。`,
    },
    {
      name: "風險回報比 (Risk/Reward)",
      value: score.riskReward,
      max: 10,
      weight: weights.riskReward,
      color: "from-emerald-500 to-teal-500",
      description: `進場臨界契合度、防守停損窄幅程度 (停損: ${stock.riskPercent.toFixed(1)}%)。`,
    },
  ];

  // Helper styles for SEPA scores
  const getDialColor = (tot: number) => {
    if (tot >= 85) return "text-emerald-400 stroke-emerald-500";
    if (tot >= 70) return "text-indigo-400 stroke-indigo-500";
    if (tot >= 50) return "text-amber-400 stroke-amber-500";
    return "text-rose-400 stroke-rose-500";
  };

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-6" id="sepa-scores-panel">
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div>
          <h4 className="font-sans font-bold text-gray-100 flex items-center gap-2">
            <span className="p-1 rounded bg-indigo-500/10 text-indigo-400 text-xs">Score</span>
            SEPA 100 分制綜合量化評級
          </h4>
          <p className="text-gray-500 text-xs mt-0.5">根據 Mark Minervini 強勢股篩選因數演算權重</p>
        </div>

        {/* Score Stamp Rating Badge */}
        <div className="px-3 py-1 rounded bg-slate-950 border border-slate-800">
          <span className="font-mono text-xs text-gray-400">STATUS:</span>
          <span className="font-sans text-[11px] font-bold text-indigo-400 ml-1.5 uppercase tracking-wider">ACTIVE</span>
        </div>
      </div>

      {/* Grid containing Donut score and detailed metrics */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        {/* Total score ring wheel */}
        <div className="md:col-span-4 flex flex-col items-center justify-center p-3 bg-slate-950/40 rounded-xl border border-slate-800/40">
          <div className="relative w-32 h-32">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              {/* Backing grey trail */}
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                stroke="#1e293b"
                strokeWidth="8"
              />
              {/* Foreground progress trail */}
              <circle
                cx="50"
                cy="50"
                r="40"
                fill="none"
                className={`${getDialColor(score.total).split(" ")[1]} transition-all duration-700 ease-out`}
                strokeWidth="8"
                strokeDasharray={`${2 * Math.PI * 40}`}
                strokeDashoffset={`${2 * Math.PI * 40 * (1 - score.total / 100)}`}
                strokeLinecap="round"
              />
            </svg>
            {/* Overlay middle reading text */}
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`font-mono text-3xl font-extrabold leading-none ${getDialColor(score.total).split(" ")[0]}`}>
                {score.total}
              </span>
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-1">SEPA Score</span>
            </div>
          </div>
          <div className="text-center mt-3">
            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
              score.total >= 85 ? "bg-emerald-500/10 text-emerald-400" :
              score.total >= 70 ? "bg-indigo-500/10 text-indigo-400" :
              score.total >= 50 ? "bg-amber-500/10 text-amber-400" : "bg-rose-500/10 text-rose-400"
            }`}>
              {score.total >= 85 ? "極度契合 (Elite)" :
               score.total >= 70 ? "高度契合 (Strong)" :
               score.total >= 50 ? "溫和觀察 (Modest)" : "不符標準 (Weak)"}
            </span>
          </div>
        </div>

        {/* Categories Bar progress sliders */}
        <div className="md:col-span-8 space-y-4">
          {subCategories.map((cat, idx) => {
            const ratioPct = getPercentage(cat.value, cat.max);
            // Current weight ratio display
            const componentContribution = Math.round((cat.value / cat.max) * cat.weight * 10) / 10;

            return (
              <div key={idx} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-sans">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-gray-200">{cat.name}</span>
                    <span className="text-[10px] text-gray-500">權重: {cat.weight}%</span>
                  </div>
                  <div className="font-mono text-gray-300 font-medium">
                    <span className="text-indigo-400 font-semibold">{cat.value}</span>
                    <span className="text-slate-600"> / </span>
                    <span className="text-slate-400">{cat.max}</span>
                    <span className="text-slate-500 text-[10px] ml-1.5">
                      (實佔: <span className="font-semibold text-gray-300">{componentContribution}%</span>)
                    </span>
                  </div>
                </div>

                {/* Progress track */}
                <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800/80">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${cat.color} transition-all duration-500 ease-out`}
                    style={{ width: `${ratioPct}%` }}
                  />
                </div>
                {/* Minor functional description */}
                <p className="text-[10px] text-gray-500 leading-snug">{cat.description}</p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
