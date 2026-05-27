/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { KLine, StockAnalysis } from "../types";

interface KLineChartProps {
  stock: StockAnalysis;
}

export default function KLineChart({ stock }: KLineChartProps) {
  const [rangeDays, setRangeDays] = useState<number>(120); // default show last 120 days
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 420 });

  // Handle responsiveness of parent element sizing
  useEffect(() => {
    if (!containerRef.current) return;
    const resizeObserver = new ResizeObserver((entries) => {
      for (let entry of entries) {
        const { width, height } = entry.contentRect;
        setDimensions({
          width: Math.max(width, 350),
          height: Math.min(Math.max(window.innerHeight * 0.45, 320), 460)
        });
      }
    });
    resizeObserver.observe(containerRef.current);
    return () => resizeObserver.disconnect();
  }, []);

  const totalKlines = stock.klines;
  const klines = totalKlines.slice(-rangeDays);

  if (klines.length === 0) return <div className="text-gray-400 p-8 text-center text-sm font-mono">No chart data available.</div>;

  // Compute boundaries for charting coordinates
  let maxPrice = -Infinity;
  let minPrice = Infinity;
  let maxVolume = 0;

  klines.forEach((k) => {
    if (k.high > maxPrice) maxPrice = k.high;
    if (k.low < minPrice) minPrice = k.low;
    if (k.volume > maxVolume) maxVolume = k.volume;
    
    // Check moving averages
    if (k.ma50 && k.ma50 > maxPrice) maxPrice = k.ma50;
    if (k.ma50 && k.ma50 < minPrice) minPrice = k.ma50;
    if (k.ma150 && k.ma150 > maxPrice) maxPrice = k.ma150;
    if (k.ma150 && k.ma150 < minPrice) minPrice = k.ma150;
    if (k.ma200 && k.ma200 > maxPrice) maxPrice = k.ma200;
    if (k.ma200 && k.ma200 < minPrice) minPrice = k.ma200;
  });

  // Always project pivot lines, stop losses, and 52W metrics to chart spacing if they exist
  const overlayLevels = [stock.buyPoint, stock.stopLoss, stock.high52Week, stock.low52Week];
  overlayLevels.forEach(level => {
    if (level > maxPrice) maxPrice = level;
    if (level < minPrice) minPrice = level;
  });

  // Add 4% buffer margin on top and bottom price projections
  const priceRange = maxPrice - minPrice;
  maxPrice += priceRange * 0.05;
  minPrice -= priceRange * 0.05;

  // Chart Layout Config
  const margin = { top: 35, right: 65, bottom: 90, left: 20 };
  const chartWidth = dimensions.width - margin.left - margin.right;
  const chartHeight = dimensions.height - margin.top - margin.bottom;

  // Helper coordinate mapper
  const getX = (index: number) => {
    return margin.left + (index / (klines.length - 1)) * chartWidth;
  };

  const getY = (val: number) => {
    return margin.top + (1 - (val - minPrice) / (maxPrice - minPrice)) * chartHeight;
  };

  const getVolY = (vol: number) => {
    // Volume graph sits in the bottom area (about 18% of the main price axis)
    const volHeight = chartHeight * 0.22;
    const originY = dimensions.height - margin.bottom + 5;
    return originY - (vol / maxVolume) * volHeight;
  };

  // Build SVG path strings for MA lines
  let path50 = "";
  let path150 = "";
  let path200 = "";

  klines.forEach((k, idx) => {
    const x = getX(idx);
    if (k.ma50) {
      const y = getY(k.ma50);
      path50 += (path50 === "" ? "M " : " L ") + `${x} ${y}`;
    }
    if (k.ma150) {
      const y = getY(k.ma150);
      path150 += (path150 === "" ? "M " : " L ") + `${x} ${y}`;
    }
    if (k.ma200) {
      const y = getY(k.ma200);
      path200 += (path200 === "" ? "M " : " L ") + `${x} ${y}`;
    }
  });

  // Hover detection
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    const svgElem = e.currentTarget;
    const rect = svgElem.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const relativeX = clientX - margin.left;
    
    if (relativeX < 0 || relativeX > chartWidth) {
      setHoveredIdx(null);
      return;
    }

    const index = Math.round((relativeX / chartWidth) * (klines.length - 1));
    if (index >= 0 && index < klines.length) {
      setHoveredIdx(index);
    } else {
      setHoveredIdx(null);
    }
  };

  const handleMouseLeave = () => {
    setHoveredIdx(null);
  };

  // Generate localized date markers
  const dateTicks: { x: number; label: string }[] = [];
  const tickCount = Math.min(6, klines.length);
  const interval = Math.floor(klines.length / tickCount);
  for (let idx = 0; idx < klines.length; idx += interval) {
    dateTicks.push({
      x: getX(idx),
      label: klines[idx].date.substring(5), // exclude year for spacing
    });
  }

  // Active hover info card properties
  const activeIdx = hoveredIdx !== null ? hoveredIdx : klines.length - 1;
  const activeK = klines[activeIdx];

  // Colors based on T or market country
  const colorUp = "fill-emerald-500 stroke-emerald-500";
  const colorDown = "fill-rose-500 stroke-rose-500";

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 shadow-sm relative overflow-hidden flex flex-col h-full select-none" id="stock-chart">
      {/* Header Display Info */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/80 pb-3 mb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5">
            <span className="font-mono text-xs text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded border border-indigo-500/10 uppercase font-bold tracking-wider">{stock.ticker}</span>
            <h3 className="font-sans font-bold text-gray-100">{stock.name}</h3>
            <span className={`text-xs ml-1 px-1.5 py-0.5 rounded ${stock.changePercent >= 0 ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/10" : "bg-rose-500/10 text-rose-400 border border-rose-500/10"}`}>
              {stock.changePercent >= 0 ? "+" : ""}{stock.changePercent.toFixed(2)}%
            </span>
          </div>
          {/* Prices overlay bar */}
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 font-mono text-[11px] text-gray-400/95 leading-none pt-1">
            <span>開:<span className="text-gray-200 ml-0.5">{activeK.open}</span></span>
            <span>高:<span className="text-emerald-400 ml-0.5">{activeK.high}</span></span>
            <span>低:<span className="text-rose-400 ml-0.5">{activeK.low}</span></span>
            <span>收:<span className="text-gray-200 ml-0.5 font-semibold">{activeK.close}</span></span>
            <span className="hidden sm:inline text-gray-500">|</span>
            <span className="hidden sm:inline">量:<span className="text-indigo-400 ml-0.5">{activeK.volume.toLocaleString()}</span></span>
            {activeK.ma50 && <span className="text-indigo-300">MA50:<span className="ml-0.5 text-indigo-200">{activeK.ma50}</span></span>}
            {activeK.ma150 && <span className="text-amber-300">MA150:<span className="ml-0.5 text-amber-200">{activeK.ma150}</span></span>}
            {activeK.ma200 && <span className="text-teal-300">MA200:<span className="ml-0.5 text-teal-200">{activeK.ma200}</span></span>}
            <span className="text-gray-500 ml-1">({activeK.date})</span>
          </div>
        </div>

        {/* Chart bounds action triggers */}
        <div className="flex items-center gap-1 bg-slate-950 px-1 py-1 rounded-lg border border-slate-800">
          <button
            onClick={() => setRangeDays(60)}
            className={`font-mono text-[10px] uppercase font-bold px-2 py-1 rounded transition-colors ${rangeDays === 60 ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-gray-200"}`}
          >
            60D
          </button>
          <button
            onClick={() => setRangeDays(120)}
            className={`font-mono text-[10px] uppercase font-bold px-2 py-1 rounded transition-colors ${rangeDays === 120 ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-gray-200"}`}
          >
            120D
          </button>
          <button
            onClick={() => setRangeDays(250)}
            className={`font-mono text-[10px] uppercase font-bold px-2 py-1 rounded transition-colors ${rangeDays === 250 ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-gray-200"}`}
          >
            250D
          </button>
        </div>
      </div>

      {/* Main SVG Plot Stage */}
      <div className="relative flex-1 w-full" ref={containerRef}>
        <svg
          width={dimensions.width}
          height={dimensions.height}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
          className="absolute inset-0 cursor-crosshair overflow-visible"
        >
          {/* Horizontal Grid guidelines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
            const val = minPrice + pct * (maxPrice - minPrice);
            const y = getY(val);
            return (
              <g key={idx}>
                <line
                  x1={margin.left}
                  y1={y}
                  x2={dimensions.width - margin.right}
                  y2={y}
                  stroke="#1e293b"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                />
                <text
                  x={dimensions.width - margin.right + 6}
                  y={y + 3}
                  className="font-mono text-[10px] fill-gray-400"
                  textAnchor="start"
                >
                  {Math.round(val * 10) / 10}
                </text>
              </g>
            );
          })}

          {/* Core Technical Guidelines Overlay (Pivot buy, stopLoss bands, 52W landmarks) */}
          {/* 1. Pivot Line */}
          <line
            x1={margin.left}
            y1={getY(stock.buyPoint)}
            x2={dimensions.width - margin.right}
            y2={getY(stock.buyPoint)}
            className="stroke-emerald-500/80"
            strokeWidth="1.5"
            strokeDasharray="5 3"
          />
          <text
            x={margin.left + 5}
            y={getY(stock.buyPoint) - 4}
            className="font-sans text-[10px] font-bold fill-emerald-400 bg-slate-900/90"
          >
            Pivot 突破買點 ({stock.buyPoint})
          </text>

          {/* 2. Stop Loss Line */}
          <line
            x1={margin.left}
            y1={getY(stock.stopLoss)}
            x2={dimensions.width - margin.right}
            y2={getY(stock.stopLoss)}
            className="stroke-rose-500/80"
            strokeWidth="1.5"
            strokeDasharray="5 3"
          />
          <text
            x={margin.left + 5}
            y={getY(stock.stopLoss) + 11}
            className="font-sans text-[10px] font-bold fill-rose-400 bg-slate-900/90"
          >
            初始停損線 ({stock.stopLoss})
          </text>

          {/* 52W High indicators */}
          {rangeDays === 250 && (
            <>
              <line
                x1={margin.left}
                y1={getY(stock.high52Week)}
                x2={dimensions.width - margin.right}
                y2={getY(stock.high52Week)}
                stroke="#475569"
                strokeWidth="1"
                strokeDasharray="3 5"
              />
              <text
                x={dimensions.width - margin.right - 10}
                y={getY(stock.high52Week) - 4}
                className="font-mono text-[9px] fill-slate-400 text-right"
                textAnchor="end"
              >
                52W高點: {stock.high52Week}
              </text>

              <line
                x1={margin.left}
                y1={getY(stock.low52Week)}
                x2={dimensions.width - margin.right}
                y2={getY(stock.low52Week)}
                stroke="#475569"
                strokeWidth="1"
                strokeDasharray="3 5"
              />
              <text
                x={dimensions.width - margin.right - 10}
                y={getY(stock.low52Week) + 10}
                className="font-mono text-[9px] fill-slate-400 text-right"
                textAnchor="end"
              >
                52W低點: {stock.low52Week}
              </text>
            </>
          )}

          {/* 3. Volatility contraction (VCP) markings overlay */}
          {stock.status === "接近買點" && stock.ticker === "2330.TW" && (
            <g className="opacity-70 pointer-events-none">
              {/* Overlay arches detailing physical dimensions of contractions */}
              <path d={`M ${getX(klines.length - 80)} ${getY(activeK.close * 1.01)} Q ${getX(klines.length - 70)} ${getY(activeK.close * 1.08)} ${getX(activeIdx - 55)} ${getY(activeK.close * 0.98)}`} fill="none" stroke="#6366f1" strokeWidth="1" strokeDasharray="3 2" />
              <path d={`M ${getX(klines.length - 55)} ${getY(activeK.close * 0.99)} Q ${getX(klines.length - 40)} ${getY(activeK.close * 1.04)} ${getX(activeIdx - 20)} ${getY(activeK.close * 0.985)}`} fill="none" stroke="#6366f1" strokeWidth="1" strokeDasharray="3 2" />
              <path d={`M ${getX(klines.length - 20)} ${getY(activeK.close * 0.992)} Q ${getX(klines.length - 10)} ${getY(activeK.close * 1.012)} ${getX(activeIdx - 1)} ${getY(activeK.close * 0.995)}`} fill="none" stroke="#6366f1" strokeWidth="1" strokeDasharray="3 2" />
              <text x={getX(klines.length - 73)} y={getY(activeK.close * 1.09)} className="font-mono text-[9px] fill-indigo-400">22%</text>
              <text x={getX(klines.length - 43)} y={getY(activeK.close * 1.05)} className="font-mono text-[9px] fill-indigo-400">11%</text>
              <text x={getX(klines.length - 13)} y={getY(activeK.close * 1.02)} className="font-mono text-[9px] fill-indigo-400">3.5%</text>
              <text x={getX(klines.length - 45)} y={margin.top + 1} className="font-sans text-[9px] text-gray-400 font-semibold bg-slate-950/70 py-1 px-1 rounded-sm">VCP Contracting</text>
            </g>
          )}

          {/* Candle Bars and Volumes Plotting */}
          {klines.map((day, idx) => {
            const isUp = day.close >= day.open;
            const candleColor = isUp ? colorUp : colorDown;
            const x = getX(idx);
            
            // Candle dimensions (adaptive width based on bars count)
            const candleGapFactor = rangeDays === 60 ? 0.72 : rangeDays === 120 ? 0.6 : 0.45;
            const candleWidth = Math.max(1.8, (chartWidth / klines.length) * candleGapFactor);

            const yOpen = getY(day.open);
            const yClose = getY(day.close);
            const yHigh = getY(day.high);
            const yLow = getY(day.low);

            const topY = Math.min(yOpen, yClose);
            const bottomY = Math.max(yOpen, yClose);
            const height = Math.max(0.8, bottomY - topY);

            const volHeightY = getVolY(day.volume);
            const volBaseY = dimensions.height - margin.bottom + 5;
            const volBarHeight = Math.max(1, volBaseY - volHeightY);

            return (
              <g key={idx} className={day.volume === activeK.volume ? "opacity-100" : "opacity-92"}>
                {/* 1. Tail Wick */}
                <line
                  x1={x}
                  y1={yHigh}
                  x2={x}
                  y2={yLow}
                  className={isUp ? "stroke-emerald-500/80" : "stroke-rose-500/80"}
                  strokeWidth="1.2"
                />
                {/* 2. Solid Body Rect */}
                <rect
                  x={x - candleWidth / 2}
                  y={topY}
                  width={candleWidth}
                  height={height}
                  className={candleColor}
                  strokeWidth="0"
                  rx="0.5"
                />
                {/* 3. Matching volume column */}
                <rect
                  x={x - candleWidth / 2}
                  y={volHeightY}
                  width={candleWidth}
                  height={volBarHeight}
                  className={isUp ? "fill-emerald-500/30" : "fill-rose-500/30"}
                  strokeWidth="0"
                />
              </g>
            );
          })}

          {/* Smooth overlay pathways for MA50, MA150, MA200 curves */}
          {path200 && <path d={path200} fill="none" stroke="#14b8a6" strokeWidth="1.5" className="opacity-90" />}
          {path150 && <path d={path150} fill="none" stroke="#f59e0b" strokeWidth="1.5" className="opacity-90" />}
          {path50 && <path d={path50} fill="none" stroke="#6366f1" strokeWidth="1.8" className="opacity-95" />}

          {/* Interactive Mouse Hover lines tracker (crosshair) */}
          {hoveredIdx !== null && (
            <g>
              {/* x dimension line */}
              <line
                x1={getX(hoveredIdx)}
                y1={margin.top}
                x2={getX(hoveredIdx)}
                y2={dimensions.height - margin.bottom + 5}
                stroke="#64748b"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              {/* y dimension line */}
              <line
                x1={margin.left}
                y1={getY(activeK.close)}
                x2={dimensions.width - margin.right}
                y2={getY(activeK.close)}
                stroke="#64748b"
                strokeWidth="1"
                strokeDasharray="3 3"
              />
              {/* Floating highlighted trackers points */}
              <circle cx={getX(hoveredIdx)} cy={getY(activeK.close)} r="4" fill="#a5b4fc" stroke="#6366f1" strokeWidth="1.5" />
            </g>
          )}

          {/* Date scale label anchors */}
          {dateTicks.map((tick, i) => (
            <g key={i}>
              <line
                x1={tick.x}
                y1={dimensions.height - margin.bottom + 6}
                x2={tick.x}
                y2={dimensions.height - margin.bottom + 11}
                stroke="#334155"
                strokeWidth="1"
              />
              <text
                x={tick.x}
                y={dimensions.height - margin.bottom + 23}
                className="font-mono text-[10px] fill-gray-500"
                textAnchor="middle"
              >
                {tick.label}
              </text>
            </g>
          ))}

          {/* Technical color keys (Legends) */}
          <g transform={`translate(${margin.left}, ${dimensions.height - 20})`} className="font-mono text-[10px] fill-gray-400">
            <rect x="0" y="-8" width="8" height="8" fill="#6366f1" rx="1" />
            <text x="12" y="0">MA50</text>

            <rect x="65" y="-8" width="8" height="8" fill="#f59e0b" rx="1" />
            <text x="77" y="0">MA150</text>

            <rect x="135" y="-8" width="8" height="8" fill="#14b8a6" rx="1" />
            <text x="147" y="0">MA200</text>

            <circle cx="215" cy="-4" r="4.5" fill="none" stroke="#10b981" strokeWidth="1.2" strokeDasharray="2 1" />
            <text x="227" y="0">Pivot 臨界買點</text>

            <circle cx="340" cy="-4" r="4.5" fill="none" stroke="#f43f5e" strokeWidth="1.2" strokeDasharray="2 1" />
            <text x="352" y="0">初始退路停損價</text>
          </g>
        </svg>
      </div>
    </div>
  );
}
