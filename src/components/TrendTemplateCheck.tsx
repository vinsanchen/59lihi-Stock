/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import { Check, X, Info } from "lucide-react";
import { StockAnalysis } from "../types";

interface TrendTemplateCheckProps {
  stock: StockAnalysis;
}

export default function TrendTemplateCheck({ stock }: TrendTemplateCheckProps) {
  const t = stock.trendTemplate;
  const ma50Value = stock.lastMA50 || 0;
  const ma150Value = stock.lastMA150 || 0;
  const ma200Value = stock.lastMA200 || 0;

  // Percentage from 52W low
  const low52WDiff = ((stock.lastClose - stock.low52Week) / stock.low52Week) * 100;
  // Percentage from 52W high
  const high52WDiff = ((stock.high52Week - stock.lastClose) / stock.high52Week) * 100;

  // Let's model the 8 rules with full textual descriptions and live numbers
  const rules = [
    {
      id: 1,
      passed: t.closeAbove50MA,
      title: "收盤價高於 50 日均線",
      formulaKey: "Close > 50MA",
      liveText: `收盤價 ${stock.lastClose} ${t.closeAbove50MA ? ">" : "≤"} 50MA ${ma50Value}`,
      help: "短期股價必須處於上升波段中，50 日移動平均線為關鍵生命線。"
    },
    {
      id: 2,
      passed: t.ma50Above150MA,
      title: "50 日均線高於 150 日均線",
      formulaKey: "50MA > 150MA",
      liveText: `50MA ${ma50Value} ${t.ma50Above150MA ? ">" : "≤"} 150MA ${ma150Value}`,
      help: "短中期籌碼成本必須完全高於中長期成本，反映多頭排序。"
    },
    {
      id: 3,
      passed: t.ma50Above200MA,
      title: "50 日均線高於 200 日均線",
      formulaKey: "50MA > 200MA",
      liveText: `50MA ${ma50Value} ${t.ma50Above200MA ? ">" : "≤"} 200MA ${ma200Value}`,
      help: "確保多頭中期蓄勢動能已形成，不與中長趨勢逆行。"
    },
    {
      id: 4,
      passed: t.ma150Above200MA,
      title: "150 日均線高於 200 日均線",
      formulaKey: "150MA > 200MA",
      liveText: `150MA ${ma150Value} ${t.ma150Above200MA ? ">" : "≤"} 200MA ${ma200Value}`,
      help: "中期與長期均線維持穩健上揚之並列走勢。"
    },
    {
      id: 5,
      passed: t.ma200Rising20Days,
      title: "200 日均線最近呈上升趨勢",
      formulaKey: "200MA Rising",
      liveText: `最近 20 個交易日 200MA 趨勢: ${t.ma200Rising20Days ? "呈上升軌跡" : "持平或下滑"}`,
      help: "200 日均線方向決定「大趨勢階段」。必須至少上升 20 日，代表絕對的第二階段 (Stage 2) 多頭。"
    },
    {
      id: 6,
      passed: t.closeAbove52WLowPct,
      title: "收盤價高於 52 週低點至少 30%",
      formulaKey: "Close vs 52W Low +30%",
      liveText: `高出低點度: +${low52WDiff.toFixed(1)}% (門檻需 ≥ +30.0%)`,
      help: "防止抄底行徑。股票必須已由大底翻揚、獲得顯著主力大戶鎖倉拉抬。"
    },
    {
      id: 7,
      passed: t.closeNear52WHighPct,
      title: "收盤價距離 52 週高點在 25% 內",
      formulaKey: "Close vs 52W High -25%內",
      liveText: `距離高點僅: -${high52WDiff.toFixed(1)}% (門檻需 ≤ -25.0%)`,
      help: "超級強勢股總是處於接近新高的高姿態整理，而不是在深淵打底。"
    },
    {
      id: 8,
      passed: t.rsRankingAbove70,
      title: "RS 位能排名至少 70 以上",
      formulaKey: "RS Ranking ≥ 70",
      liveText: `當前相對強度排名: ${stock.rsRanking} (最好 80 以上)`,
      help: "Relative Strength 必須展現出全市場前 30% (最好前 20%) 的絕佳領頭羊動能。"
    }
  ];

  const totalPassedCount = rules.filter(r => r.passed).length;

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 shadow-sm space-y-4" id="trend-template-panel">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div>
          <h4 className="font-sans font-bold text-gray-100 flex items-center gap-2">
            <span className="p-1 rounded bg-teal-500/10 text-teal-400 text-xs text-center leading-none">Template</span>
            Minervini 趨勢樣板檢定 (Trend Template)
          </h4>
          <p className="text-gray-500 text-xs mt-0.5">篩選出高勝率、正值主升段 (Stage 2) 強勢股的 8 大過濾準則</p>
        </div>

        {/* Master status badge */}
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-gray-400">核對進度:</span>
          <span className={`font-mono text-xs px-2 py-0.5 rounded-full font-bold ${totalPassedCount === 8 ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" : "bg-amber-500/10 text-amber-400 border border-amber-500/20"}`}>
            {totalPassedCount} / 8 通過
          </span>
        </div>
      </div>

      {/* Checklist Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className={`flex items-start gap-3 p-3 rounded-xl border transition-all ${
              rule.passed
                ? "bg-emerald-950/10 border-emerald-900/30 text-emerald-100/90 hover:bg-emerald-950/20"
                : "bg-slate-950/20 border-slate-800/50 text-gray-400 hover:bg-slate-950/45"
            }`}
          >
            {/* Round indicator */}
            <div
              className={`p-1.5 rounded-full shrink-0 flex items-center justify-center ${
                rule.passed
                  ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                  : "bg-slate-800/80 text-gray-500 border border-slate-700/50"
              }`}
            >
              {rule.passed ? (
                <Check className="w-3.5 h-3.5" strokeWidth={3} />
              ) : (
                <X className="w-3.5 h-3.5" strokeWidth={3} />
              )}
            </div>

            {/* Rule descriptive text */}
            <div className="space-y-1">
              <div className="flex items-center flex-wrap gap-x-1.5 md:gap-x-2">
                <span className={`font-sans text-xs font-bold ${rule.passed ? "text-gray-200" : "text-gray-400"}`}>
                  {rule.id}. {rule.title}
                </span>
                <span className="font-mono text-[9px] bg-slate-800/70 text-gray-400 px-1 py-0.2 rounded border border-slate-800/80">
                  {rule.formulaKey}
                </span>
              </div>
              
              {/* Mathematics indicator */}
              <div className="font-mono text-[11px] text-indigo-300 font-medium tracking-snug">
                {rule.liveText}
              </div>

              {/* Explanatory help hover segment */}
              <p className="text-[10px] text-gray-500 leading-snug font-sans pt-0.5">{rule.help}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Closing notice banner */}
      <div className="flex items-start gap-2 p-3 bg-slate-950/50 border border-slate-800 rounded-xl">
        <Info className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
        <p className="text-[11px] text-gray-400 leading-relaxed font-sans">
          <strong>大師操盤紀律</strong>：Mark Minervini 嚴格指出，只有當 **所有 8 項指標全都順利通過 (8/8)** 時，個股方可進入「第二階段多頭整理區」，允許系統演算 SEPA 進場點。任何漏項的股票均屬於偏弱或動能未成熟，交易者應果斷排除。
        </p>
      </div>
    </div>
  );
}
