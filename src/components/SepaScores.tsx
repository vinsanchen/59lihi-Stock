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
      weight: weights.trendTemplate,
      color: "from-indigo-500 to-violet-500",
      description: "核對均線多頭排列及上升指針條件。",
    },
    {
      name: "RS 相對強度 (Relative Strength)",
      value: score.rsStrength,
      weight: weights.rsStrength,
      color: "from-blue-500 to-indigo-500",
      description: `相較於全市場板塊的相對升幅表現 (RS值: ${stock.rsRanking})。`,
    },
    {
      name: "VCP 整理形態 (VCP Structure)",
      value: score.vcpPattern,
      weight: weights.vcpPattern,
      color: "from-teal-500 to-emerald-500",
      description: "波動震幅收緊(T)及底部籌碼鞏固完整度。",
    },
    {
      name: "成交量結構 (Vol Dry-up)",
      value: score.volumeDryUp,
      weight: weights.volumeDryUp,
      color: "from-amber-500 to-orange-500",
      description: `拉回及收緊過程中是否展現顯著量縮。`,
    },
    {
      name: "風險回報比 (Risk/Reward)",
      value: score.riskReward,
      weight: weights.riskReward,
      color: "from-emerald-500 to-teal-500",
      description: `停損窄幅程度與進場點契合度 (風險: ${stock.riskPercent.toFixed(1)}%)。`,
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
      </div>

      {/* Grid containing Donut score and detailed metrics */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-center">
        {/* Total score ring wheel */}
        <div className="md:col-span-4 flex flex-col items-center justify-center p-3 bg-slate-950/40 rounded-xl border border-slate-800/40">
          <div className="relative w-32 h-32">
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="40" fill="none" stroke="#1e293b" strokeWidth="8" />
              <circle
                cx="50" cy="50" r="40" fill="none"
                className={`${getDialColor(score.total).split(" ")[1]} transition-all duration-700 ease-out`}
                strokeWidth="8"
                strokeDasharray={`${2 * Math.PI * 40}`}
                strokeDashoffset={`${2 * Math.PI * 40 * (1 - score.total / 100)}`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`font-mono text-3xl font-extrabold leading-none ${getDialColor(score.total).split(" ")[0]}`}>
                {score.total}
              </span>
              <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mt-1">SEPA Score</span>
            </div>
          </div>
        </div>

        {/* Categories Bar progress sliders */}
        <div className="md:col-span-8 space-y-4">
          {subCategories.map((cat, idx) => {
            const ratioPct = getPercentage(cat.value, cat.weight);

            return (
              <div key={idx} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-sans">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-gray-200">{cat.name}</span>
                  </div>
                  <div className="font-mono text-gray-300 font-medium">
                    <span className="text-gray-500 text-[10px] mr-2">權重: {cat.weight}%</span>
                    <span className="text-indigo-400 font-semibold">{cat.value}</span>
                    <span className="text-slate-600"> / </span>
                    <span className="text-slate-400">{cat.weight}</span>
                  </div>
                </div>

                {/* Progress track */}
                <div className="w-full h-2.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800/80">
                  <div
                    className={`h-full rounded-full bg-gradient-to-r ${cat.color} transition-all duration-500 ease-out`}
                    style={{ width: `${ratioPct}%` }}
                  />
                </div>
                <p className="text-[10px] text-gray-500 leading-snug">{cat.description}</p>
              </div>
            );
          })}
        </div>
      </div>

      {/* SEPA Hard Constraints Verification banner */}
      <div className="bg-[#1f2937]/15 border border-indigo-500/20 rounded-xl p-3.5 space-y-2 text-[11px] text-gray-400">
        <div className="font-extrabold text-indigo-300 flex items-center gap-1.5 uppercase tracking-widest text-[9.5px]">
          🛡️ Mark Minervini SEPA® 綜合演算核心機制
        </div>
        <ul className="list-disc list-inside space-y-1.5 pl-1 text-[10.5px] leading-relaxed">
          <li>
            <strong className="text-gray-200">美股與台股分開百分位數 (1-99 Percentile)</strong>：
            台美雙市獨立計算。每檔個股的 RS 相對強度是在其所屬市場 (US 或 TW) 中，針對所有活躍成分股進行價格強度排序後得出的真實百分位落點。
          </li>
          <li>
            <strong className="text-gray-200">非 RS 獨大，尊重多維度限制</strong>：
            RS Rank 僅佔綜合分數中的 <strong className="text-indigo-400 font-bold">20% 權重</strong>。高 RS 之落後股若未通過趨勢模板 (Trend Template)、不具備 VCP 收縮、或高檔過度延伸 (風險報酬比不佳)，將會因系統懲罰機制而無法進入 Top 20，甚至自動被分類至「不符合」名單。
          </li>
        </ul>
      </div>
    </div>
  );
}
