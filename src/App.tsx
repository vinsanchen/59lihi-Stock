/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  TrendingUp,
  Search,
  SlidersHorizontal,
  RefreshCw,
  Layers,
  Settings,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  ArrowUpDown,
  Flame,
  Star,
  ChevronRight,
  BarChart3,
  Lock,
  ShieldCheck,
  Award,
  Globe2,
  Maximize2,
  Filter,
  ClipboardList,
  Calendar,
  Bookmark,
  Activity,
  Ban,
  Sparkles
} from "lucide-react";
import { StockAnalysis, SepaWeights, FilterSettings, LiquidityParameters } from "./types";
import { DataProvider, DEFAULT_WEIGHTS } from "./services/DataProvider";
import KLineChart from "./components/KLineChart";
import SepaScores from "./components/SepaScores";
import TrendTemplateCheck from "./components/TrendTemplateCheck";
import FundamentalAnalysis from "./components/FundamentalAnalysis";
import IndustryManager from "./components/IndustryManager";
import SuperPerformanceManagement from "./components/SuperPerformanceManagement";

// Legendary Mark Minervini principles to rotate
const MINERVINI_QUOTES = [
  "「專注於在大盤修正期間抗跌、甚至逆勢創高的股票。那些就是未來的超級強勢股。」",
  "「在股市中獲勝的關鍵，是在你做錯時賠得最少。紀律第一，不要讓回撤破壞你的帳戶。」",
  "「我不參與盲目的投機。我只交易符合我 SEPA 趨勢模板、VCP 收斂成熟的完美型態起跑點。」",
  "「絕對不要讓一個原本浮盈豐厚的強勢股，最後倒貼變成虧損。保護你的本金是交易者的天職！」",
  "「限制每次進場交易的最大下行風險（停損 4% - 8%）。不投降的人，市場最終會給予其豐厚回報。」",
  "「一般散戶買進深陷泥沼的低價垃圾股；而頂尖操盤手則在高位買進波動度緊縮、創新高的領先群。」"
];

const TOP_INDUSTRIES = [
  { name: "半導體", avgSepa: 0, breakoutRate: 0, leaders: [] },
  { name: "PCB / ABF", avgSepa: 0, breakoutRate: 0, leaders: [] },
  { name: "AI 伺服器", avgSepa: 0, breakoutRate: 0, leaders: [] },
  { name: "電源 / 功率半導體", avgSepa: 0, breakoutRate: 0, leaders: [] },
  { name: "散熱", avgSepa: 0, breakoutRate: 0, leaders: [] }
];

import { FirebaseProvider, useAuth } from "./components/FirebaseProvider";
import LoginScreen from "./components/LoginScreen";

import { auth } from "./lib/firebase";

export default function AppWrapper() {
  return (
    <FirebaseProvider>
      <AppContent />
    </FirebaseProvider>
  );
}

function AppContent() {
  const { user, loading: authLoading } = useAuth();
  const [token, setToken] = useState<string | undefined>();
  const [activeTab, setActiveTab] = useState<"tw" | "us" | "single" | "watchlist" | "settings" | "industry">("watchlist");

  useEffect(() => {
    if (user) {
      user.getIdToken().then(setToken);
    } else {
      setToken(undefined);
    }
  }, [user]);
  const [showSidebar, setShowSidebar] = useState<boolean>(() => {
    try {
      return localStorage.getItem("sepa_show_sidebar") !== "false";
    } catch {
      return true;
    }
  });
  const [selectedTicker, setSelectedTicker] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [selectedWatchCategory, setSelectedWatchCategory] = useState<string>("ALL");
  const [watchMarketFilter, setWatchMarketFilter] = useState<"ALL" | "TW" | "US">("ALL");
  const [weights, setWeights] = useState<SepaWeights>(DEFAULT_WEIGHTS);
  
  // Weights adjustment transient UI state
  const [tempWeights, setTempWeights] = useState<SepaWeights>({ ...DEFAULT_WEIGHTS });
  const [weightsError, setWeightsError] = useState<string | null>(null);

  // Liquidity parameter state with local storage persistence
  const [liquidityParams, setLiquidityParams] = useState<LiquidityParameters>(() => {
    try {
      const saved = localStorage.getItem("sepa_liquidity_params");
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn("Could not load sepa_liquidity_params from localStorage", e);
    }
    return {
      minPrice: 20,
      minTurnover: 50000000,   // 最低日成交金額 5000 萬元
      minAvgVolume: 1000000,  // 最低日均成交量 1000 張 (1,000,000 股)
      excludeEtf: true,
      excludeWarrants: true,
      excludePreferred: true,
      excludeEmerging: true,
      require200Days: true
    };
  });

  const [tempLiquidity, setTempLiquidity] = useState<LiquidityParameters>({ ...liquidityParams });

  useEffect(() => {
    setTempLiquidity(liquidityParams);
  }, [liquidityParams]);

  // Data storage
  const [twStocks, setTwStocks] = useState<StockAnalysis[]>([]);
  const [usStocks, setUsStocks] = useState<StockAnalysis[]>([]);
  const [activeKlines, setActiveKlines] = useState<any[]>([]);
  const [loadingKlines, setLoadingKlines] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string>("");
  const [poolCount, setPoolCount] = useState<number>(0);
  const [refreshing, setRefreshing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  // Filter systems
  const [twFilters, setTwFilters] = useState<FilterSettings>({
    searchQuery: "",
    marketFilter: "ALL", // "ALL" | "上市" | "上櫃"
    statusFilter: "ALL",
    minScore: 0,
    sortField: "sepaScoreTotal",
    sortOrder: "desc"
  });

  const [usFilters, setUsFilters] = useState<FilterSettings>({
    searchQuery: "",
    marketFilter: "ALL", // "ALL" | "NASDAQ" | "NYSE"
    statusFilter: "ALL",
    minScore: 0,
    sortField: "sepaScoreTotal",
    sortOrder: "desc"
  });

  // Quote index state
  const [quoteIdx, setQuoteIdx] = useState(0);

  // Gemini AI detailed Analysis cache
  const [aiReportCache, setAiReportCache] = useState<{ [ticker: string]: string }>({});
  const [aiLoading, setAiLoading] = useState(false);

  // Fundamental data cache
  const [fundamentalCache, setFundamentalCache] = useState<{ [ticker: string]: any }>({});
  const [fundamentalLoading, setFundamentalLoading] = useState(false);

  // Initialize stocks lists using live API
  useEffect(() => {
    let active = true;
    let pollInterval: any = null;

    const loadData = async (isForced = false) => {
      if (!token) return;
      try {
        const result = await DataProvider.loadFromAPI(isForced, weights, token);
        if (active) {
          const tw = DataProvider.getTwStocks(weights);
          const us = DataProvider.getUsStocks(weights);
          setTwStocks(tw);
          setUsStocks(us);
          setLastUpdated(DataProvider.getLastUpdated());
          setPoolCount(DataProvider.getStockPoolCount());
          setSyncMessage(result.message || null);
          setRefreshing(result.isSyncing);

          // Only set default ticker ONCE if nothing is selected
          if (!selectedTicker && !hasInitialized.current) {
            const first = tw[0] || us[0];
            if (first) {
              setSelectedTicker(first.ticker);
              hasInitialized.current = true;
            }
          }
          setError(null);
        }
      } catch (err: any) {
        if (active) {
          setError(err.message || "市場資料同步失敗，請檢查資料來源。");
          setRefreshing(false);
        }
      }
    };

    loadData();
    pollInterval = setInterval(() => loadData(false), 5000);

    return () => {
      active = false;
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [weights]);

  // Quote auto-cycler
  useEffect(() => {
    if (!selectedTicker) return;
    
    let active = true;
    const fetchK = async () => {
      if (!token) return;
      setLoadingKlines(true);
      const k = await DataProvider.fetchKlines(selectedTicker, token);
      if (active) {
        setActiveKlines(k);
        setLoadingKlines(false);
      }
    };
    
    fetchK();
    return () => { active = false; };
  }, [selectedTicker]);

  // Fundamental data fetcher (triggered only on single view)
  useEffect(() => {
    if (activeTab !== "single" || !selectedTicker) return;
    if (fundamentalCache[selectedTicker]) return;

    let active = true;
    const loadFundamentals = async () => {
      if (!token) return;
      setFundamentalLoading(true);
      try {
        const data = await DataProvider.fetchFundamentals(selectedTicker, token);
        if (active && data) {
          setFundamentalCache(prev => ({ ...prev, [selectedTicker]: data }));
        }
      } catch (e) {
        console.error("Failed to load fundamentals", e);
      } finally {
        if (active) setFundamentalLoading(false);
      }
    };

    loadFundamentals();
    return () => { active = false; };
  }, [activeTab, selectedTicker]);

  useEffect(() => {
    const timer = setInterval(() => {
      setQuoteIdx((prev) => (prev + 1) % MINERVINI_QUOTES.length);
    }, 12000);
    return () => clearInterval(timer);
  }, []);

  const handleRefresh = async () => {
    if (!token || refreshing) return;
    setRefreshing(true);
    setError(null);
    setSyncMessage("要求已送出，正在排隊執行掃描...");
    try {
      console.log("[Frontend] Triggering forced backend rescan and Cache eviction...");
      const result = await DataProvider.loadFromAPI(true, weights, token);
      if (result.success) {
        setSyncMessage(result.message || "正在掃描市場...");
        setRefreshing(result.isSyncing);
        const tw = DataProvider.getTwStocks(weights);
        setTwStocks(tw);
        setUsStocks(DataProvider.getUsStocks(weights));
        setLastUpdated(DataProvider.getLastUpdated());
        setPoolCount(DataProvider.getStockPoolCount());
      }
    } catch (e: any) {
      console.error("[Frontend] Force rescan failed:", e);
      setError(e.message || "市場資料同步失敗，請檢查資料來源。");
      setRefreshing(false);
    }
  };

  const prevActiveStock = useRef<StockAnalysis | null>(null);
  const hasInitialized = useRef(false);

  // Get active stock for details tab
  const activeStock = useMemo(() => {
    if (!selectedTicker) {
      if (prevActiveStock.current) return prevActiveStock.current;
      const defaultStock = twStocks[0] || usStocks[0];
      if (defaultStock) prevActiveStock.current = defaultStock;
      return defaultStock;
    }

    const normalizedSelected = selectedTicker.toUpperCase();
    const cleanSelected = normalizedSelected.split(".")[0];

    // Priority 1: Exact match in current state
    let match = [...twStocks, ...usStocks].find(s => 
      s.ticker.toUpperCase() === normalizedSelected || 
      s.ticker.split(".")[0].toUpperCase() === cleanSelected
    );
    
    // Priority 2: Fallback to DataProvider cache
    if (!match) {
      match = DataProvider.getStockByTicker(selectedTicker);
    }

    // Priority 3: Persistence - If we had a stock with this ticker before, keep it
    if (!match && prevActiveStock.current) {
      const prev = prevActiveStock.current;
      if (prev.ticker.toUpperCase() === normalizedSelected || 
          prev.ticker.split(".")[0].toUpperCase() === cleanSelected) {
        match = prev;
      }
    }

    if (match) {
      prevActiveStock.current = match;
    }
    
    return match || null;
  }, [selectedTicker, twStocks, usStocks]);

  const tsmcStock = useMemo(() => {
    return twStocks.find(s => s.ticker === "2330");
  }, [twStocks]);

  // Handle row clicking on tables
  const inspectStock = (ticker: string) => {
    setSelectedTicker(ticker);
    setActiveTab("single");
  };

  // Trigger Gemini AI proxy analysis on server
  const fetchAiAnalysis = async (stock: StockAnalysis) => {
    if (!token || aiReportCache[stock.ticker]) return; // already analyzed/cached
    setAiLoading(true);
    setAiReportCache((prev) => ({ ...prev, [stock.ticker]: "分析產生中，請稍候..." }));

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({ stock }),
      });
      const data = await response.json();
      if (data && data.analysis) {
        setAiReportCache((prev) => ({ ...prev, [stock.ticker]: data.analysis }));
      } else {
        throw new Error("Invalid response format");
      }
    } catch (err) {
      console.error(err);
      setAiReportCache((prev) => ({
        ...prev,
        [stock.ticker]: "⚠️ 數據演算連線中斷。請點擊按鈕重試。"
      }));
    } finally {
      setAiLoading(false);
    }
  };

  // Apply visual weights logic
  const handleSaveWeights = (e: React.FormEvent) => {
    e.preventDefault();
    const sum = tempWeights.trendTemplate +
      tempWeights.rsStrength +
      tempWeights.vcpPattern +
      tempWeights.volumeDryUp +
      tempWeights.riskReward;

    if (sum !== 100) {
      setWeightsError(`❌ 各權重因數總和必須為 100% (當前數值: ${sum}%)`);
      return;
    }

    setWeightsError(null);
    setWeights({ ...tempWeights });
    // Visual success indicator
    alert("✅ 權重因數設定已更新！系統所有股票的 SEPA 分數已即時重新計算排序。");
  };

  const handleResetWeights = () => {
    setTempWeights({ ...DEFAULT_WEIGHTS });
    setWeightsError(null);
  };

  const handleSaveLiquidity = (e: React.FormEvent) => {
    e.preventDefault();
    setLiquidityParams({ ...tempLiquidity });
    try {
      localStorage.setItem("sepa_liquidity_params", JSON.stringify(tempLiquidity));
    } catch (_) {}
    alert("✅ 篩選參數設定已套用！所有股票的流動性過濾已即時重新計算。");
  };

  const handleResetLiquidity = () => {
    const defaultParams = {
      minPrice: 20,
      minTurnover: 50000000,
      minAvgVolume: 1000000,
      excludeEtf: true,
      excludeWarrants: true,
      excludePreferred: true,
      excludeEmerging: true,
      require200Days: true
    };
    setTempLiquidity(defaultParams);
    setLiquidityParams(defaultParams);
    try {
      localStorage.setItem("sepa_liquidity_params", JSON.stringify(defaultParams));
    } catch (_) {}
    alert("✅ 已恢復預設流動性過濾條件！");
  };

  // Safe weights change helper
  const updateTempWeight = (field: keyof SepaWeights, val: number) => {
    setTempWeights((prev) => ({
      ...prev,
      [field]: isNaN(val) ? 0 : val
    }));
  };

  // Filtering lists logic
  const processStocks = (list: StockAnalysis[], filters: FilterSettings, isTw: boolean) => {
    let result = [...list];

    // Apply adjustable dynamic liquidity parameters (especially for Taiwan stocks as requested)
    if (isTw) {
      result = result.filter((s) => {
        // 1. RS Ranking - Strict SEPA requirement
        if (s.rsRanking < 70) return false;

        // 2. 最低股價 (minPrice)
        if (s.lastClose < liquidityParams.minPrice) return false;

        // 2. 最低日成交金額 (minTurnover = lastClose * volume)
        const dailyTurnoverAmount = s.lastClose * s.volume;
        if (dailyTurnoverAmount < liquidityParams.minTurnover) return false;

        // 3. 最低日均成交量 (minAvgVolume, e.g. 1000張 = 1,000,000股)
        if (s.avgVolume20 < liquidityParams.minAvgVolume) return false;

        // 4. 排除 ETF
        if (liquidityParams.excludeEtf) {
          const nameUpper = s.name.toUpperCase();
          const tickerClean = s.ticker.split(".")[0];
          const isEtf = nameUpper.includes("ETF") || tickerClean.startsWith("00") || s.subIndustry === "ETF" || s.mainIndustry === "ETF" || s.marketType === "ETF";
          if (isEtf) return false;
        }

        // 5. 排除權證
        if (liquidityParams.excludeWarrants) {
          const tickerClean = s.ticker.split(".")[0];
          const isWarrant = s.name.includes("購") || s.name.includes("售") || tickerClean.length >= 6;
          if (isWarrant) return false;
        }

        // 6. 排除特別股
        if (liquidityParams.excludePreferred) {
          const tickerClean = s.ticker.split(".")[0];
          const isPreferred = s.name.includes("特") || /[a-zA-Z]$/.test(tickerClean);
          if (isPreferred) return false;
        }

        // 7. 排除興櫃
        if (liquidityParams.excludeEmerging) {
          const isEmerging = s.marketType === "興櫃" || s.marketType === "ROT" || s.marketType === "Emerging";
          if (isEmerging) return false;
        }

        // 8. 最近 200 日資料完整
        if (liquidityParams.require200Days) {
          const count = s.klineCount || (s.klines ? s.klines.length : 0);
          if (count < 200) return false;
        }

        return true;
      });
    }

    // Search query ticker/name
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase().trim();
      result = result.filter(
        (s) =>
          s.ticker.toLowerCase().includes(query) ||
          s.name.toLowerCase().includes(query)
      );
    }

    // Market selection filter & Industry classification
    if (filters.marketFilter !== "ALL") {
      const sector = filters.marketFilter;
      if (["電子類", "金融類", "傳產類"].includes(sector)) {
        result = result.filter((s) => s.mainIndustry === sector);
      } else if (["半導體", "AI 伺服器", "PCB / ABF", "散熱", "電源 / 功率半導體"].includes(sector)) {
        result = result.filter((s) => s.subIndustry === sector);
      } else {
        result = result.filter((s) => s.marketType === sector);
      }
    }

    // Status filter
    if (filters.statusFilter !== "ALL") {
      result = result.filter((s) => s.status === filters.statusFilter);
    }

    // Min Score filter
    if (filters.minScore > 0) {
      result = result.filter((s) => s.sepaScore.total >= filters.minScore);
    }

    // Sort engine
    result.sort((a, b) => {
      let valA: any = 0;
      let valB: any = 0;

      if (filters.sortField === "sepaScoreTotal" || filters.sortField === "") {
        valA = a.sepaScore.total;
        valB = b.sepaScore.total;
      } else {
        valA = a[filters.sortField as keyof StockAnalysis];
        valB = b[filters.sortField as keyof StockAnalysis];
      }

      // Check strings vs numbers for stable sorting
      if (typeof valA === "string") {
        return filters.sortOrder === "asc"
          ? valA.localeCompare(valB)
          : valB.localeCompare(valA);
      } else {
        return filters.sortOrder === "asc" ? valA - valB : valB - valA;
      }
    });

    // We only show Top 20 as requested by spec
    return result.slice(0, 20);
  };

  const filteredTwStocks = useMemo(() => processStocks(twStocks, twFilters, true), [twStocks, twFilters, liquidityParams]);
  const filteredUsStocks = useMemo(() => processStocks(usStocks, usFilters, false), [usStocks, usFilters, liquidityParams]);

  // Combine TW and US stocks for the SEPA Watchlist view
  const combinedWatchlist = useMemo(() => {
    return [...twStocks, ...usStocks].filter(s => s.watchlistCategory && s.watchlistCategory !== "一般追蹤");
  }, [twStocks, usStocks]);

  const filteredWatchlist = useMemo(() => {
    let list = [...combinedWatchlist];
    
    // Market filter logic
    if (watchMarketFilter !== "ALL") {
      list = list.filter(stock => {
        return watchMarketFilter === "TW" ? stock.country === "TW" : stock.country === "US";
      });
    }

    if (selectedWatchCategory === "ALL") {
      return list;
    }
    return list.filter(s => s.watchlistCategory === selectedWatchCategory);
  }, [combinedWatchlist, selectedWatchCategory, watchMarketFilter]);

  const sortedWatchlist = useMemo(() => {
    return [...filteredWatchlist].sort((a, b) => {
      const dayA = a.consecutiveDays || 0;
      const dayB = b.consecutiveDays || 0;
      return dayB - dayA; // Display highest consecutive days first
    });
  }, [filteredWatchlist]);

  // 今日最強產業 (Today's Strongest Industries) calculations
  const topSegments = useMemo(() => {
    const list = [
      { name: "AI 伺服器", label: "AI Server", description: "組裝/伺服器板塊" },
      { name: "PCB / ABF", label: "PCB / ABF", description: "載板與高頻板" },
      { name: "電源 / 功率半導體", label: "Power / BBU", description: "電源供應、BBU模組" },
      { name: "散熱", label: "Thermal Tech", description: "液冷 & 水冷散熱" },
      { name: "半導體", label: "CoWoS / Foundry", description: "先進封裝與晶圓代工" }
    ];

    const mapped = list.map((industry) => {
      // Prioritize subIndustry, fallback to mainIndustry containing the name
      const stocks = twStocks.filter((s) => s.subIndustry === industry.name || s.mainIndustry?.includes(industry.name));
      if (stocks.length === 0) {
        return {
          ...industry,
          avgSepa: 0,
          breakoutCount: 0,
          avgChange: 0,
          avgVolRatio: 0,
          score: 0
        };
      }

      // 1. Avg SEPA
      const avgSepa = stocks.reduce((acc, s) => acc + (s.sepaScore?.total || 0), 0) / stocks.length;
      
      // 2. Breakouts (passed trend template OR status is "已突破" / "接近買點")
      const breakoutCount = stocks.filter((s) => s.status === "已突破" || s.status === "接近買點" || s.trendTemplate?.passed).length;
      
      // 3. Price change strength (average changePercent)
      const avgChange = stocks.reduce((acc, s) => acc + (s.changePercent || 0), 0) / stocks.length;
      
      // 4. Volume strength (volume / avgVolume20)
      const avgVolRatio = stocks.reduce((acc, s) => acc + ((s.volume / (s.avgVolume20 || 1)) || 0), 0) / stocks.length;

      // Overall composite score formula
      const score = Math.round((avgSepa * 0.45) + (breakoutCount * 12) + (avgChange * 9) + (avgVolRatio * 14));

      return {
        ...industry,
        avgSepa: Math.round(avgSepa * 10) / 10,
        breakoutCount,
        avgChange: Math.round(avgChange * 100) / 100,
        avgVolRatio: Math.round(avgVolRatio * 10) / 10,
        score
      };
    });

    // Sort descending by calculated strength score
    return mapped.sort((a, b) => b.score - a.score);
  }, [twStocks]);

  // Handle Sort header trigger
  const handleThSort = (tab: "tw" | "us", field: keyof StockAnalysis | "sepaScoreTotal") => {
    if (tab === "tw") {
      setTwFilters((prev) => ({
        ...prev,
        sortField: field,
        sortOrder: prev.sortField === field && prev.sortOrder === "desc" ? "asc" : "desc"
      }));
    } else {
      setUsFilters((prev) => ({
        ...prev,
        sortField: field,
        sortOrder: prev.sortField === field && prev.sortOrder === "desc" ? "asc" : "desc"
      }));
    }
  };

  // Helper styles for colors based on SEPA stock states
  const getStatusBadge = (status: StockAnalysis["status"]) => {
    switch (status) {
      case "接近買點":
        return <span className="px-2 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 text-[11px] font-bold rounded-md">接近買點</span>;
      case "已突破":
        return <span className="px-2 py-1 bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 text-[11px] font-bold rounded-md">已突破</span>;
      case "突破回撤":
        return <span className="px-2 py-1 bg-teal-500/15 text-teal-400 border border-teal-500/30 text-[11px] font-bold rounded-md">突破回撤</span>;
      case "可觀察":
        return <span className="px-2 py-1 bg-sky-500/10 text-sky-400 border border-sky-500/20 text-[11px] font-bold rounded-md">可觀察</span>;
      case "過度延伸，不建議追":
        return <span className="px-2 py-1 bg-rose-500/10 text-rose-400 border border-rose-500/30 text-[11px] font-bold rounded-md">過度延伸</span>;
      case "型態尚未完成":
        return <span className="px-2 py-1 bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[11px] font-bold rounded-md">型態未熟</span>;
      default:
        return <span className="px-2 py-1 bg-slate-800/80 text-slate-400 border border-slate-700/50 text-[11px] font-medium rounded-md">不符合</span>;
    }
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
    } catch (e) {
      console.error("Logout failed", e);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#0D1117] flex items-center justify-center font-sans">
        <div className="flex flex-col items-center gap-4">
          <RefreshCw className="w-8 h-8 text-indigo-500 animate-spin" />
          <p className="text-gray-500 text-sm font-black uppercase tracking-widest">系統初始化中...</p>
        </div>
      </div>
    );
  }

  if (!user || !token) {
    return <LoginScreen />;
  }

  return (
    <div className="min-h-screen bg-[#0B0E14] text-[#E6EDF3] flex flex-col font-sans select-none antialiased">
      
      {/* Top Glassmorphism Navigation Bar */}
      <header className="sticky top-0 z-50 bg-[#161B22]/80 backdrop-blur-md border-b border-[#30363D] px-4 md:px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        
        {/* Logo and tabs links */}
        <div className="flex items-center gap-4 md:gap-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center font-black text-xs text-white shadow-inner select-none tracking-wider">59LH</div>
            <div className="flex flex-col">
              <span className="font-bold text-sm tracking-tight text-white">59LiHi 大師投資系統</span>
              <span className="text-[10px] text-gray-500 font-mono tracking-wider leading-none">High-Probability Master Investing Engine</span>
            </div>
          </div>
          
          <nav className="flex items-center bg-black/30 p-0.5 rounded-lg border border-[#30363D]">
            <button
              onClick={() => setActiveTab("tw")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all ${
                activeTab === "tw"
                  ? "bg-[#238636] text-white shadow-sm"
                  : "text-[#8B949E] hover:text-[#E6EDF3]"
              }`}
            >
              台股 59LiHi Top 20
            </button>
            <button
              onClick={() => setActiveTab("us")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all ${
                activeTab === "us"
                  ? "bg-[#238636] text-white shadow-sm"
                  : "text-[#8B949E] hover:text-[#E6EDF3]"
              }`}
            >
              美股 59LiHi Top 20
            </button>
            <button
              onClick={() => setActiveTab("watchlist")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold tracking-wide flex items-center gap-1 transition-all ${
                activeTab === "watchlist"
                  ? "bg-indigo-600 text-white shadow-sm border border-indigo-500"
                  : "text-[#8B949E] hover:text-[#E6EDF3]"
              }`}
            >
              <ClipboardList className="w-3.5 h-3.5 text-indigo-400" />
              <span>59LiHi 觀察池</span>
            </button>
            <button
              onClick={() => setActiveTab("single")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all ${
                activeTab === "single"
                  ? "bg-slate-800 text-white shadow-sm border border-slate-700"
                  : "text-[#8B949E] hover:text-[#E6EDF3]"
              }`}
            >
              單股詳細分析
            </button>
            <button
              onClick={() => setActiveTab("industry")}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold tracking-wide transition-all ${
                activeTab === "industry"
                  ? "bg-slate-800 text-white shadow-sm border border-slate-700"
                  : "text-[#8B949E] hover:text-[#E6EDF3]"
              }`}
            >
              產業分類
            </button>
            <button
              onClick={() => setActiveTab("settings")}
              className={`p-1.5 rounded-md text-xs transition-colors ${
                activeTab === "settings" ? "bg-slate-800 text-indigo-400" : "text-[#8B949E] hover:text-white"
              }`}
              title="系統設定"
            >
              <Settings className="w-4 h-4" />
            </button>
          </nav>
        </div>

        {/* Sync panel actions */}
        <div className="flex items-center gap-4">
          <div className="hidden sm:block text-right">
            <span className="text-[9px] uppercase tracking-wider text-gray-500 font-bold block leading-tight">最後掃描更新</span>
            <span className="text-xs font-mono text-[#8B949E] font-medium block leading-tight">{lastUpdated}</span>
            {refreshing && syncMessage && (
              <span className="text-[9px] text-indigo-400 animate-pulse font-medium block mt-0.5">● {syncMessage}</span>
            )}
          </div>

          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 bg-[#238636] hover:bg-[#2eab47] active:scale-95 disabled:opacity-50 text-white px-3.5 py-2 rounded-lg text-xs font-bold transition-all shadow-md select-none"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "掃描演算中..." : "重新掃描市場"}
          </button>
        </div>
      </header>

      {/* Main Full-stack Workspace Layout Grid */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden relative">
        
        {/* Left Side informative panel rail */}
        {showSidebar && (
          <aside className="w-full lg:w-72 bg-[#161B22]/65 border-b lg:border-b-0 lg:border-r border-[#30363D] p-4 flex flex-col gap-6 shrink-0 overflow-y-auto lg:max-h-[calc(100vh-65px)] animate-in slide-in-from-left duration-300">
            
            {/* Sync Progress Indicator if refreshing */}
            {refreshing && (
            <div className="bg-indigo-500/10 border border-indigo-500/20 p-3 rounded-lg space-y-2 animate-pulse">
              <div className="flex items-center justify-between text-[10px] text-indigo-400 font-bold">
                <span className="flex items-center gap-1">
                  <RefreshCw className="w-3 h-3 animate-spin" /> 背景同步中
                </span>
                <span>掃描中...</span>
              </div>
              <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500 animate-[sync-progress_10s_ease-in-out_infinite]" style={{ width: '40%' }}></div>
              </div>
              <p className="text-[10px] text-gray-400 font-medium leading-tight">
                {syncMessage || "正在背景分批獲取最新數據... 獲取完成後將自動刷新。"}
              </p>
              <p className="text-[9px] text-gray-500 italic">
                由於交易所流量限制，完整更新約需 5~10 分鐘。
              </p>
            </div>
          )}
          
          {/* Context Dynamic Filter panel */}
          {(activeTab === "tw" || activeTab === "us") && (
            <section className="bg-black/30 p-4 rounded-xl border border-[#30363D] space-y-4">
              <h3 className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                <SlidersHorizontal className="w-3.5 h-3.5" />
                篩選過濾與排序
              </h3>

              {/* Ticker Search input */}
              <div className="space-y-1.5">
                <label className="text-xs text-gray-400 block font-semibold">股票搜尋</label>
                <div className="relative">
                  <input
                    type="text"
                    value={activeTab === "tw" ? twFilters.searchQuery : usFilters.searchQuery}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (activeTab === "tw") {
                        setTwFilters((prev) => ({ ...prev, searchQuery: val }));
                      } else {
                        setUsFilters((prev) => ({ ...prev, searchQuery: val }));
                      }
                    }}
                    placeholder="代號或名稱..."
                    className="w-full bg-slate-950 border border-[#30363D] rounded-lg text-xs py-2 pl-8 pr-3 text-white placeholder-gray-600 focus:outline-none focus:border-indigo-500 transition-colors"
                  />
                  <Search className="w-3.5 h-3.5 text-gray-500 absolute left-2.5 top-2.5" />
                </div>
              </div>

              {/* Market segments selector */}
              {activeTab === "tw" ? (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-400 block font-semibold">上市產業分類</label>
                    <select
                      value={twFilters.marketFilter}
                      onChange={(e) => setTwFilters((prev) => ({ ...prev, marketFilter: e.target.value }))}
                      className="w-full bg-slate-950 border border-[#30363D] rounded-lg text-xs p-2 text-gray-200 outline-none focus:border-indigo-500 focus:bg-slate-950 transition-all font-sans"
                    >
                      <option value="ALL">全部上市股</option>
                      <option value="電子類">電子類</option>
                      <option value="金融類">金融類</option>
                      <option value="傳產類">傳產類</option>
                      <option value="半導體">半導體</option>
                      <option value="AI 伺服器">AI 伺服器</option>
                      <option value="PCB / ABF">PCB / ABF</option>
                      <option value="散熱">散熱</option>
                      <option value="電源 / 功率半導體">電源 / 功率半導體</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between p-2 pb-2.5 bg-emerald-950/10 rounded-lg border border-emerald-900/30 text-[11px]">
                    <div className="flex items-start gap-1.5 cursor-default leading-none">
                      <div className="mt-0.5 w-3 h-3 rounded bg-emerald-500/20 border border-emerald-400 flex items-center justify-center text-emerald-400 text-[8px] font-bold">✓</div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-gray-200 font-bold">只顯示成交量足夠股票</span>
                        <span className="text-[9px] text-gray-500 font-normal">日均成交 &ge; 3 億 | 股價 &ge; 30 元</span>
                      </div>
                    </div>
                    <span className="text-[8.5px] text-emerald-400 font-mono bg-emerald-500/10 px-1 rounded-sm font-bold border border-emerald-500/20 shrink-0">開啟</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <label className="text-xs text-gray-400 block font-semibold">上市交易所</label>
                  <select
                    value={usFilters.marketFilter}
                    onChange={(e) => setUsFilters((prev) => ({ ...prev, marketFilter: e.target.value }))}
                    className="w-full bg-slate-950 border border-[#30363D] rounded-lg text-xs p-2 text-gray-200 outline-none focus:border-indigo-500 transition-all font-sans"
                  >
                    <option value="ALL">所有美股交易所</option>
                    <option value="NASDAQ">Nasdaq</option>
                    <option value="NYSE">NYSE</option>
                  </select>
                </div>
              )}

              {/* Status categories filter */}
              <div className="space-y-1.5">
                <label className="text-xs text-gray-400 block font-semibold">操作狀態篩選</label>
                <select
                  value={activeTab === "tw" ? twFilters.statusFilter : usFilters.statusFilter}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (activeTab === "tw") {
                      setTwFilters((prev) => ({ ...prev, statusFilter: val }));
                    } else {
                      setUsFilters((prev) => ({ ...prev, statusFilter: val }));
                    }
                  }}
                  className="w-full bg-slate-950 border border-[#30363D] rounded-lg text-xs p-2 text-gray-200 outline-none focus:border-indigo-500 transition-all font-sans"
                >
                  <option value="ALL">顯示全部狀態</option>
                  <option value="接近買點">接近買點 (Near Pivot)</option>
                  <option value="已突破">已突破 (Breakout)</option>
                  <option value="可觀察">可觀察 (Watch)</option>
                  <option value="過度延伸，不建議追">過度延伸，不追</option>
                  <option value="型態尚未完成">型態尚未完成</option>
                  <option value="不符合">不符合 (Non-compliant)</option>
                </select>
              </div>

              {/* Min SEPA Score threshold */}
              <div className="space-y-2 pt-1.5">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-400 font-semibold">最小 SEPA 綜合分數</span>
                  <span className="font-mono text-indigo-400 font-semibold">{activeTab === "tw" ? twFilters.minScore : usFilters.minScore} 分</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="95"
                  value={activeTab === "tw" ? twFilters.minScore : usFilters.minScore}
                  onChange={(e) => {
                    const val = parseInt(e.target.value);
                    if (activeTab === "tw") {
                      setTwFilters((prev) => ({ ...prev, minScore: val }));
                    } else {
                      setUsFilters((prev) => ({ ...prev, minScore: val }));
                    }
                  }}
                  className="w-full h-1 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500"
                />
              </div>
            </section>
          )}

          {/* Minervini Tip wisdom element */}
          <section className="mt-auto hidden lg:block">
            <div className="p-4 rounded-xl border border-emerald-900/30 bg-emerald-950/10 space-y-2 relative overflow-hidden group">
              <div className="absolute right-[-10px] bottom-[-10px] opacity-10 font-bold font-sans text-5xl text-emerald-500 group-hover:scale-115 transition-transform">SEPA</div>
              
              <div className="flex items-center gap-1.5 text-[10px] text-emerald-500 uppercase font-black tracking-wider leading-none">
                <Star className="w-3.5 h-3.5 fill-emerald-500 stroke-0" />
                MINERVINI 原則語錄
              </div>
              <p className="text-[11px] leading-relaxed text-emerald-100/70 italic font-medium transition-opacity animate-fade-in">
                {MINERVINI_QUOTES[quoteIdx]}
              </p>
              
              <div className="flex gap-1 pt-1 justify-end">
                {MINERVINI_QUOTES.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setQuoteIdx(i)}
                    className={`w-1.5 h-1.5 rounded-full transition-colors ${i === quoteIdx ? "bg-emerald-500" : "bg-emerald-500/20"}`}
                  />
                ))}
              </div>
            </div>
          </section>
        </aside>
      )}

        {/* Dynamic Workspace Container Section */}
        <section className={`flex-grow overflow-auto p-4 md:p-6 flex flex-col gap-6 transition-all duration-300 ${!showSidebar ? "w-full" : ""}`}>

          {/* TOP DASHBOARD HEADER: Market Indices */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 shrink-0">
            <div className="bg-[#161B22] p-3 rounded-xl border border-[#30363D] flex flex-col justify-center">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-bold text-gray-500 uppercase">Taiwan Index</span>
                <span className={`font-mono font-bold flex items-center text-xs ${DataProvider.getTaiex().changePercent >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {DataProvider.getTaiex().changePercent >= 0 ? "+" : ""}{DataProvider.getTaiex().changePercent.toFixed(2)}% {DataProvider.getTaiex().changePercent >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                </span>
              </div>
              <div className="font-mono text-lg font-black text-gray-100 tracking-tight">
                {DataProvider.getTaiex().price.toLocaleString("zh-TW")}
              </div>
            </div>

            <div className="bg-[#161B22] p-3 rounded-xl border border-[#30363D] flex flex-col justify-center">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-bold text-gray-500 uppercase">Nasdaq 100</span>
                <span className={`font-mono font-bold flex items-center text-xs ${DataProvider.getNasdaq().changePercent >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                  {DataProvider.getNasdaq().changePercent >= 0 ? "+" : ""}{DataProvider.getNasdaq().changePercent.toFixed(2)}% {DataProvider.getNasdaq().changePercent >= 0 ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                </span>
              </div>
              <div className="font-mono text-lg font-black text-gray-100 tracking-tight">
                {DataProvider.getNasdaq().price.toLocaleString("en-US")}
              </div>
            </div>

            <div className="bg-[#161B22] p-3 rounded-xl border border-[#30363D] flex flex-col justify-center">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase">TSMC (2330)</span>
                <span className={`font-mono font-bold flex items-center text-xs ${tsmcStock ? (tsmcStock.changePercent >= 0 ? "text-emerald-400" : "text-rose-400") : "text-emerald-400"}`}>
                  {tsmcStock ? (tsmcStock.changePercent >= 0 ? "+" : "") + tsmcStock.changePercent.toFixed(2) + "%" : "--%"}
                </span>
              </div>
              <div className="font-mono text-lg font-black text-gray-100 tracking-tight">
                {tsmcStock ? tsmcStock.lastClose + " 元" : "---"}
              </div>
            </div>

            <div className="bg-[#161B22] p-3 rounded-xl border border-[#30363D] flex flex-col justify-center">
              <div className="flex justify-between items-center mb-1">
                <span className="text-[10px] font-bold text-gray-500 uppercase">Momentum Scope</span>
                <span className="text-amber-400 font-mono font-black text-xs">
                  {Math.round((twStocks.filter(s => s.sepaScore.total >= 75).length / Math.max(1, twStocks.length)) * 1000) / 10}%
                </span>
              </div>
              <div className="text-[11px] text-gray-400 font-bold">
                強向股: {twStocks.length} 檔
              </div>
            </div>
          </div>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/20 p-4 rounded-xl flex items-center gap-3 text-rose-400 text-sm animate-in fade-in slide-in-from-top-4 duration-300">
              <AlertTriangle className="w-5 h-5 shrink-0" />
              <p className="font-medium">{error}</p>
              <button 
                onClick={handleRefresh}
                className="ml-auto px-3 py-1.5 bg-rose-500/20 hover:bg-rose-500/30 rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5"
                disabled={refreshing}
              >
                <RefreshCw className={`w-3 h-3 ${refreshing ? "animate-spin" : ""}`} />
                重試同步
              </button>
            </div>
          )}

          {/* TAB 1: TAIWAN STOCK SEPA TOP 20 */}
          {activeTab === "tw" && (
            <div className="space-y-6 flex-1 flex flex-col" id="tw-tab">
              
              {/* 1. 資料狀態列 (Data Status / Active Parameters Summary) */}
              <div className="bg-indigo-950/15 border border-indigo-900/40 p-4 rounded-xl space-y-2">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                    </span>
                    <span className="font-bold text-gray-200">當前台股過濾條件：</span>
                    <span className="text-gray-400 text-xs">最低股價 &ge; {liquidityParams.minPrice} 元</span>
                    <span className="text-gray-600">|</span>
                    <span className="text-gray-400 text-xs">最低日均量 &ge; {liquidityParams.minAvgVolume / 1000} 張</span>
                    <span className="text-gray-600">|</span>
                    <span className="text-gray-400 text-xs">最低日成交金額 &ge; {(liquidityParams.minTurnover / 10000000).toFixed(1).replace(".0","")} 千萬元</span>
                  </div>
                  <div className="text-[10px] text-gray-400 font-mono italic shrink-0">
                    最後更新：{lastUpdated || "同步中..."}
                  </div>
                </div>

                {/* Authenticity Metadata Bar */}
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-indigo-300 bg-indigo-500/5 px-3 py-2 rounded-lg border border-indigo-500/10">
                  <div className="flex items-center gap-1 font-bold text-indigo-400">
                    <ShieldCheck className="w-3 h-3" /> 資料真實性驗證：
                  </div>
                  <div className="flex items-center gap-1">股票池來源：<span className="text-gray-300 font-mono">TWSE (上市)</span></div>
                  <div className="flex items-center gap-1">掃描數量：<span className="text-gray-300 font-mono">{poolCount || "---"} 檔</span></div>
                  <div className="flex items-center gap-1">數據源：<span className="text-gray-300 font-mono">Yahoo / FinMind</span></div>
                  <div className="flex items-center gap-1 text-emerald-400 font-bold bg-emerald-500/10 px-1.5 rounded">Mock Data：禁用 (真實數據)</div>
                </div>
                
                {/* Note mandated by spec */}
                <div className="text-xs text-amber-205/90 leading-relaxed font-sans border-t border-indigo-900/20 pt-2 flex items-start gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                  <p>
                    <strong>流動性提示：</strong>流動性條件是為了排除成交量太低、難以進出的股票，並非 SEPA 原文標準。SEPA 核心仍以趨勢樣板、RS 強度、VCP 型態與風險報酬比為主。
                  </p>
                </div>
              </div>

              {/* Header Title segment (2. 今日上市股 SEPA Top 20) */}
              <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-[#30363D] pb-3">
                <div className="space-y-1">
                  <h2 className="text-lg font-extrabold text-white flex items-center gap-2">
                    <Globe2 className="w-4 h-4 text-emerald-500" />
                    今日上市股 59LiHi Top 20 領先股
                  </h2>
                  <p className="text-[11px] text-gray-400">
                    基於 Mark Minervini 經典 SEPA 趨勢模型演算法，根據即時數據篩選出符合特徵的前 20 名台股強勢領先股。
                  </p>
                </div>
                
                <div className="flex flex-wrap gap-1.5 text-[9px] text-gray-400/90 font-medium shrink-0">
                  <span className="px-2 py-0.5 bg-slate-950 border border-[#30363D] rounded-md font-semibold text-emerald-400">TWSE 上市股限定</span>
                  <span className="px-2 py-0.5 bg-slate-950 border border-[#30363D] rounded-md font-semibold font-mono">RS &ge; 70</span>
                  <span className="px-2 py-0.5 bg-slate-950 border border-[#30363D] rounded-md font-semibold font-mono">股價 &ge; {liquidityParams.minPrice} 元</span>
                </div>
              </div>

              {/* Data Table */}
              <div className="flex-1 bg-[#161B22] rounded-xl border border-[#30363D] shadow-xl overflow-hidden flex flex-col min-h-[400px]">
                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#010409] border-b border-[#30363D] text-gray-400 font-bold select-none text-[11px] tracking-wider uppercase">
                        <th className="py-2 px-3 text-center w-10">#</th>
                        <th className="py-2 px-2 cursor-pointer hover:bg-slate-900/60 transition-colors" onClick={() => handleThSort("tw", "ticker")}>
                          <div className="flex items-center gap-1">代號 <ArrowUpDown className="w-3 h-3 text-slate-500" /></div>
                        </th>
                        <th className="py-2 px-2">名稱</th>
                        <th className="py-2 px-2 cursor-pointer hover:bg-slate-900/60 transition-colors text-right" onClick={() => handleThSort("tw", "lastClose")}>
                          <div className="flex items-center justify-end gap-1">收盤價 <ArrowUpDown className="w-3 h-3 text-slate-500" /></div>
                        </th>
                        <th className="py-2 px-2 cursor-pointer hover:bg-slate-900/60 transition-colors text-right" onClick={() => handleThSort("tw", "changePercent")}>
                          <div className="flex items-center justify-end gap-1">漲跌幅 <ArrowUpDown className="w-3 h-3 text-slate-500" /></div>
                        </th>
                        <th className="py-2 px-2 cursor-pointer hover:bg-slate-900/60 transition-colors text-right" onClick={() => handleThSort("tw", "sepaScoreTotal")}>
                          <div className="flex items-center justify-end gap-1 text-emerald-400">59LiHi <ArrowUpDown className="w-3 h-3 text-emerald-600" /></div>
                        </th>
                        <th className="py-2 px-2 cursor-pointer hover:bg-slate-900/60 transition-colors text-center" onClick={() => handleThSort("tw", "rsRanking")}>
                          <div className="flex items-center justify-center gap-1 text-indigo-400">RS Rank <ArrowUpDown className="w-3 h-3 text-indigo-600" /></div>
                        </th>
                        <th className="py-2 px-2 text-center">趨勢驗證</th>
                        <th className="py-2 px-2 text-right text-emerald-300">建議 Pivot</th>
                        <th className="py-2 px-2">型態判斷</th>
                        <th className="py-2 px-2 text-right text-[10px]">停損(風險%)</th>
                        <th className="py-2 px-3 text-center">狀態</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#30363D]/60 whitespace-nowrap">
                      {filteredTwStocks.length === 0 ? (
                        <tr>
                          <td colSpan={12} className="py-12 text-center text-gray-500 font-sans">
                            <AlertTriangle className="w-8 h-8 mx-auto text-amber-500 mb-2 opacity-50" />
                            未找到符合篩選因數的個股標的。
                          </td>
                        </tr>
                      ) : (
                        filteredTwStocks.map((stock, idx) => {
                          const isPositive = stock.changePercent >= 0;
                          return (
                            <tr
                              key={stock.ticker}
                              onClick={() => inspectStock(stock.ticker)}
                              className="hover:bg-slate-900/80 cursor-pointer transition-all border-b border-[#30363D]/40 group"
                            >
                              <td className="py-1.5 px-3 text-center font-mono text-gray-500 font-bold group-hover:text-white">
                                {idx + 1}
                              </td>
                              <td className="py-1.5 px-2 font-mono font-bold text-gray-300 group-hover:text-indigo-400 transition-colors">
                                {stock.ticker.split(".")[0]}
                              </td>
                              <td className="py-1.5 px-2 font-semibold text-white">
                                <div className="flex items-center gap-1">
                                  <span className="text-[13px]">{stock.name}</span>
                                  <span className="text-[9px] text-gray-500 bg-slate-950 px-1 py-0 rounded font-normal font-sans text-center">
                                    {stock.marketType}
                                  </span>
                                </div>
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono font-semibold text-gray-200">
                                {stock.lastClose.toFixed(2)}
                              </td>
                              <td className={`py-1.5 px-2 text-right font-mono font-semibold ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
                                {isPositive ? "+" : ""}{stock.changePercent.toFixed(2)}%
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono font-extrabold text-[#3FB950] bg-emerald-500/5">
                                {stock.sepaScore.total}
                              </td>
                              <td className="py-1.5 px-2 text-center font-mono font-extrabold text-indigo-400">
                                {stock.rsRanking}
                              </td>
                              <td className="py-1.5 px-2 text-center">
                                {stock.trendTemplate.passed ? (
                                  <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/20 uppercase tracking-widest leading-none">
                                    PASS
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-bold text-gray-500 bg-slate-800/80 px-1 py-0.5 rounded uppercase tracking-widest leading-none">
                                    FAIL
                                  </span>
                                )}
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono font-bold text-emerald-400">
                                {stock.buyPoint}
                              </td>
                              <td className="py-1.5 px-2 text-gray-300 font-medium">
                                <span className="font-semibold text-indigo-300 text-[11px]">{stock.pattern}</span>
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono text-gray-400">
                                <span className="text-rose-400 font-bold">{stock.stopLoss}</span>
                                <span className="text-[9px] text-gray-500 ml-1">({stock.riskPercent}%)</span>
                              </td>
                              <td className="py-1.5 px-3 text-center">
                                {getStatusBadge(stock.status)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="bg-[#010409] px-4 py-2 border-t border-[#30363D] flex justify-between items-center text-[10px] text-gray-500">
                  <span>✨ 點擊任何個股列直接進入「單股剖析」獲取詳細K線圖與完整操作建言</span>
                  <span>顯示台股最佳篩選 20 檔強勢代表</span>
                </div>
              </div>

              {/* 今日最強產業 Top 5 Dashboard */}
              <div className="space-y-3 mt-6 bg-[#161B22]/40 p-5 rounded-2xl border border-[#30363D]/60 shadow-sm">
                <div className="flex items-center justify-between mb-1">
                  <h3 className="text-[10px] font-extrabold text-indigo-400 uppercase tracking-widest flex items-center gap-1.5">
                    <Flame className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                    今日最強產業 Top 5 主流領頭羊 (點擊過濾 SEPA 上市名單)
                  </h3>
                  <span className="text-[10px] text-gray-500 italic">依 SEPA 均值、突破數、今日強度及量能強度權重計分</span>
                </div>
                
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                  {topSegments.slice(0, 5).map((ind, idx) => {
                    const isSelect = twFilters.marketFilter === ind.name;
                    const isChangePos = ind.avgChange >= 0;
                    return (
                      <button
                        key={ind.name}
                        onClick={() => {
                          setTwFilters((prev) => ({
                            ...prev,
                            marketFilter: isSelect ? "ALL" : ind.name
                          }));
                        }}
                        className={`text-left p-3.5 rounded-xl border transition-all relative overflow-hidden select-none cursor-pointer flex flex-col justify-between h-[115px] ${
                          isSelect
                            ? "bg-emerald-950/20 border-emerald-500/80 shadow-[0_0_15px_rgba(16,185,129,0.15)]"
                            : "bg-[#0d1117] hover:bg-[#161B22] border-[#30363D]/70 hover:border-slate-600"
                        }`}
                      >
                        {/* Decorative Rank corner index */}
                        <span className="absolute right-2 top-1.5 font-mono text-xs font-black text-gray-700/60 select-none">
                          #{idx + 1}
                        </span>
                        
                        <div>
                          <div className="font-bold text-[12px] text-white leading-tight pr-4">{ind.name}</div>
                          <div className="text-[8.5px] text-gray-500 font-mono tracking-wider italic leading-none mt-0.5">{ind.label}</div>
                        </div>

                        <div className="mt-auto space-y-0.5 w-full">
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="text-gray-400 text-[8.5px] font-medium uppercase tracking-tight">SEPA 均分</span>
                            <span className="font-bold font-mono text-emerald-400 text-[11px]">{ind.avgSepa}</span>
                          </div>
                          
                          <div className="flex justify-between items-center text-[10px]">
                            <span className="text-gray-400 text-[8.5px] font-medium uppercase tracking-tight">突破家數</span>
                            <span className="font-sans font-extrabold text-amber-500 text-[10px]">
                              🔥 {ind.breakoutCount}
                            </span>
                          </div>

                          <div className="flex justify-between items-center text-[9px] font-mono pt-1.5 mt-1 border-t border-slate-800/60 leading-none">
                            <span className={isChangePos ? "text-emerald-400 font-bold" : "text-rose-400 font-bold"}>
                              {isChangePos ? "+" : ""}{ind.avgChange}%
                            </span>
                            <span className="text-gray-500 text-[8px] font-bold">x{ind.avgVolRatio} VOL</span>
                          </div>
                        </div>
                        
                        {/* Selected background indicator */}
                        {isSelect && (
                          <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-emerald-500" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}


          {/* TAB 2: AMERICAN STOCK SEPA TOP 20 */}
          {activeTab === "us" && (
            <div className="space-y-6 flex-1 flex flex-col" id="us-tab">
              
              {/* Data Status Summary Bar */}
              <div className="bg-indigo-950/15 border border-indigo-900/40 p-4 rounded-xl space-y-2">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 text-xs">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="flex h-2 w-2 relative">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500"></span>
                    </span>
                    <span className="font-bold text-gray-200">US Market Filters Active:</span>
                    <span className="text-gray-400 text-xs"> NASDAQ/NYSE Universe</span>
                    <span className="text-gray-600 font-mono">|</span>
                    <span className="text-gray-400 text-xs">RS Ranking &ge; 70</span>
                  </div>
                  <div className="text-[10px] text-gray-400 font-mono italic shrink-0">
                    US Feed: Delayed 15min / Daily Bars
                  </div>
                </div>
              </div>

              {/* Data Table */}
              <div className="flex-1 bg-[#161B22] rounded-xl border border-[#30363D] shadow-xl overflow-hidden flex flex-col min-h-[400px]">
                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#010409] border-b border-[#30363D] text-gray-400 font-bold select-none text-[11px] tracking-wider uppercase">
                        <th className="py-2 px-3 text-center w-10">Rank</th>
                        <th className="py-2 px-2 cursor-pointer hover:bg-slate-900/60 transition-colors" onClick={() => handleThSort("us", "ticker")}>
                          <div className="flex items-center gap-1">Ticker <ArrowUpDown className="w-3 h-3 text-slate-500" /></div>
                        </th>
                        <th className="py-2 px-2">Company Name</th>
                        <th className="py-2 px-2 cursor-pointer hover:bg-slate-900/60 transition-colors text-right" onClick={() => handleThSort("us", "lastClose")}>
                          <div className="flex items-center justify-end gap-1">Close <ArrowUpDown className="w-3 h-3 text-slate-500" /></div>
                        </th>
                        <th className="py-2 px-2 cursor-pointer hover:bg-slate-900/60 transition-colors text-right" onClick={() => handleThSort("us", "changePercent")}>
                          <div className="flex items-center justify-end gap-1">Change % <ArrowUpDown className="w-3 h-3 text-slate-500" /></div>
                        </th>
                        <th className="py-2 px-2 cursor-pointer hover:bg-slate-900/60 transition-colors text-right" onClick={() => handleThSort("us", "sepaScoreTotal")}>
                          <div className="flex items-center justify-end gap-1 text-emerald-400">59LiHi <ArrowUpDown className="w-3 h-3 text-emerald-600" /></div>
                        </th>
                        <th className="py-2 px-2 cursor-pointer hover:bg-slate-900/60 transition-colors text-center" onClick={() => handleThSort("us", "rsRanking")}>
                          <div className="flex items-center justify-center gap-1 text-indigo-400">RS Rank <ArrowUpDown className="w-3 h-3 text-indigo-600" /></div>
                        </th>
                        <th className="py-2 px-2 text-center">Trend Template</th>
                        <th className="py-2 px-2">Pattern</th>
                        <th className="py-2 px-2 text-right">Pivot Point</th>
                        <th className="py-2 px-2 text-right text-[10px]">Stop Loss (Risk %)</th>
                        <th className="py-2 px-3 text-center">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#30363D]/60">
                      {filteredUsStocks.length === 0 ? (
                        <tr>
                          <td colSpan={12} className="py-12 text-center text-gray-500 font-sans">
                            <AlertTriangle className="w-8 h-8 mx-auto text-amber-500 mb-2 opacity-50" />
                            No matching US equities tickers observed inside the sandbox filters.
                          </td>
                        </tr>
                      ) : (
                        filteredUsStocks.map((stock, idx) => {
                          const isPositive = stock.changePercent >= 0;
                          return (
                            <tr
                              key={stock.ticker}
                              onClick={() => inspectStock(stock.ticker)}
                              className="hover:bg-slate-900/80 cursor-pointer transition-all border-b border-[#30363D]/40 group"
                            >
                              {/* Index Rank Number */}
                              <td className="py-1.5 px-3 text-center font-mono text-gray-500 font-bold group-hover:text-white">
                                {idx + 1}
                              </td>

                              {/* Ticker */}
                              <td className="py-1.5 px-2 font-mono font-bold text-gray-300 group-hover:text-indigo-400 transition-colors uppercase">
                                {stock.ticker}
                              </td>

                              {/* Name and segment label */}
                              <td className="py-1.5 px-2 font-semibold text-white">
                                <div className="flex items-center gap-1">
                                  <span className="text-[13px]">{stock.name}</span>
                                  <span className="text-[9px] text-gray-500 bg-slate-950 px-1 py-0 rounded font-normal font-sans text-center">
                                    {stock.marketType}
                                  </span>
                                </div>
                              </td>

                              {/* Close */}
                              <td className="py-1.5 px-2 text-right font-mono text-gray-200">
                                ${stock.lastClose.toFixed(2)}
                              </td>

                              {/* Change Pct */}
                              <td className={`py-1.5 px-2 text-right font-mono font-semibold ${isPositive ? "text-emerald-400" : "text-rose-400"}`}>
                                {isPositive ? "+" : ""}{stock.changePercent.toFixed(2)}%
                              </td>

                              {/* SEPA Score */}
                              <td className="py-1.5 px-2 text-right font-mono font-extrabold text-[#3FB950] bg-emerald-500/5">
                                {stock.sepaScore.total}
                              </td>

                              {/* RS Ranking */}
                              <td className="py-1.5 px-2 text-center font-mono font-extrabold text-indigo-400">
                                {stock.rsRanking}
                              </td>

                              {/* Trend Template bool status */}
                              <td className="py-1.5 px-2 text-center">
                                {stock.trendTemplate.passed ? (
                                  <span className="text-[9px] font-bold text-emerald-400 bg-emerald-500/10 px-1 py-0.5 rounded border border-emerald-500/20 uppercase tracking-widest leading-none">
                                    PASS
                                  </span>
                                ) : (
                                  <span className="text-[9px] font-bold text-gray-550 bg-slate-800/80 px-1 py-0.5 rounded uppercase tracking-widest leading-none">
                                    FAIL
                                  </span>
                                )}
                              </td>

                              {/* VCP pattern details description */}
                              <td className="py-1.5 px-2 text-gray-300 font-medium font-sans">
                                <span className="text-[11px] font-semibold text-indigo-300">{stock.pattern}</span>
                              </td>

                              {/* Buy point */}
                              <td className="py-1.5 px-2 text-right font-mono font-bold text-emerald-400">
                                ${stock.buyPoint}
                              </td>

                              {/* Stop Loss (Risk %) */}
                              <td className="py-1.5 px-2 text-right font-mono text-gray-400">
                                <span className="text-rose-400 font-bold">${stock.stopLoss}</span>
                                <span className="text-[9px] text-gray-500 ml-1">({stock.riskPercent}%)</span>
                              </td>

                              {/* Operational Status Tag badge */}
                              <td className="py-1.5 px-3 text-center text-[11px] font-semibold">
                                {getStatusBadge(stock.status)}
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="bg-[#010409] px-4 py-2 border-t border-[#30363D] flex justify-between items-center text-[10px] text-gray-500 font-mono">
                  <span>* Notice: US market calculations reflect NASDAQ/NYSE delayed data arrays</span>
                  <span>Ranked top {filteredUsStocks.length} compliant tickers</span>
                </div>
              </div>

            </div>
          )}


          {/* TAB: SEPA WATCHLIST 觀察池 */}
          {activeTab === "watchlist" && (
            <div className="space-y-6 animate-fade-in" id="watchlist-tab">
              
              {/* Main Banner */}
              <div className="bg-gradient-to-r from-slate-900 to-indigo-950/70 p-6 rounded-2xl border border-indigo-500/20 shadow-2xl relative overflow-hidden">
                <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
                  <ClipboardList className="w-40 h-40 text-violet-400" />
                </div>
                <div className="max-w-3xl space-y-2 flex flex-col">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="flex flex-col gap-1.5">
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/10 border border-indigo-400/30 text-indigo-400 w-fit">
                        <Sparkles className="w-3.5 h-3.5 animate-pulse text-indigo-400" />
                        <span>59LiHi 趨勢觀察池</span>
                      </div>
                      <h1 className="text-2xl font-black text-white tracking-tight sm:text-3xl">
                        59LiHi 強勢龍頭持續追蹤系統
                      </h1>
                    </div>
                    
                    <div className="flex items-center gap-1 bg-black/40 p-1.5 rounded-xl border border-slate-700/50">
                      <button 
                        onClick={() => setWatchMarketFilter("ALL")}
                        className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${watchMarketFilter === "ALL" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "text-gray-500 hover:text-white"}`}
                      >
                        ALL 全部
                      </button>
                      <button 
                        onClick={() => setWatchMarketFilter("TW")}
                        className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${watchMarketFilter === "TW" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "text-gray-500 hover:text-white"}`}
                      >
                        TW 台股
                      </button>
                      <button 
                        onClick={() => setWatchMarketFilter("US")}
                        className={`px-3 py-1.5 text-[10px] font-black uppercase rounded-lg transition-all ${watchMarketFilter === "US" ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/20" : "text-gray-500 hover:text-white"}`}
                      >
                        US 美股
                      </button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-300 leading-relaxed max-w-xl">
                    本池採用 Mark Minervini 強勢股第二階段追蹤機制，<strong>不因單日排名波動而將潛力龍頭立刻刪除</strong>。
                    本系統動態監測大勢與個股連續符合天數，並即時按市場地位與型態變化將其分類，為其量身打造起跑樞紐。
                  </p>
                </div>
              </div>

              {/* Stat Bento / Category Select Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {/* 0.全部 */}
                <button 
                  onClick={() => setSelectedWatchCategory("ALL")}
                  className={`p-4 rounded-xl border cursor-pointer text-left transition-all block w-full focus:outline-none ${
                    selectedWatchCategory === "ALL" 
                      ? "bg-indigo-950/20 border-indigo-500 shadow-md shadow-indigo-500/5 ring-1 ring-indigo-500/30" 
                      : "bg-[#161B22] border-[#30363D] hover:border-gray-600"
                  }`}
                >
                  <div className="flex justify-between items-start w-full">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Bookmark className="w-4 h-4 text-indigo-400" />
                        <span className="font-bold text-sm text-gray-205">全部監控標的</span>
                      </div>
                      <p className="text-xs text-gray-400">目前強勢池中正在持續追蹤的所有股票標的。</p>
                    </div>
                    <span className="font-mono text-xl font-black text-gray-100 bg-slate-950 px-2 py-0.5 rounded-md">
                      {combinedWatchlist.length}
                    </span>
                  </div>
                </button>

                {/* 1.核心觀察股 */}
                <button 
                  onClick={() => setSelectedWatchCategory("核心觀察股")}
                  className={`p-4 rounded-xl border cursor-pointer text-left transition-all block w-full focus:outline-none ${
                    selectedWatchCategory === "核心觀察股" 
                      ? "bg-violet-950/20 border-violet-500 shadow-md shadow-violet-500/5 ring-1 ring-violet-500/30" 
                      : "bg-[#161B22] border-[#30363D] hover:border-gray-600"
                  }`}
                >
                  <div className="flex justify-between items-start w-full">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-violet-400" />
                        <span className="font-bold text-sm text-violet-300">核心觀察股 (Core)</span>
                      </div>
                      <p className="text-xs text-gray-400 font-sans leading-tight">最近 2~6 週持續符合 SEPA 條件且 RS 持續強勢。</p>
                    </div>
                    <span className="font-mono text-xl font-black text-violet-400 bg-slate-950 px-2 py-0.5 rounded-md">
                      {combinedWatchlist.filter(s => s.watchlistCategory === "核心觀察股").length}
                    </span>
                  </div>
                </button>

                {/* 2.接近買點 */}
                <button 
                  onClick={() => setSelectedWatchCategory("接近買點")}
                  className={`p-4 rounded-xl border cursor-pointer text-left transition-all block w-full focus:outline-none ${
                    selectedWatchCategory === "接近買點" 
                      ? "bg-emerald-950/20 border-emerald-500 shadow-md shadow-emerald-500/5 ring-1 ring-emerald-500/30" 
                      : "bg-[#161B22] border-[#30363D] hover:border-gray-600"
                  }`}
                >
                  <div className="flex justify-between items-start w-full">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Activity className="w-4 h-4 text-emerald-400" />
                        <span className="font-bold text-sm text-emerald-300">接近買點 (Near Pivot)</span>
                      </div>
                      <p className="text-xs text-gray-400 font-sans leading-tight">距離 Pivot 臨界點小於 5%，VCP 進入最後收斂。</p>
                    </div>
                    <span className="font-mono text-xl font-black text-emerald-400 bg-slate-950 px-2 py-0.5 rounded-md">
                      {combinedWatchlist.filter(s => s.watchlistCategory === "接近買點").length}
                    </span>
                  </div>
                </button>

                {/* 3.今日突破 */}
                <button 
                  onClick={() => setSelectedWatchCategory("今日突破")}
                  className={`p-4 rounded-xl border cursor-pointer text-left transition-all block w-full focus:outline-none ${
                    selectedWatchCategory === "今日突破" 
                      ? "bg-amber-955/35 border-amber-500 shadow-md shadow-amber-500/5 ring-1 ring-amber-500/30" 
                      : "bg-[#161B22] border-[#30363D] hover:border-gray-600"
                  }`}
                >
                  <div className="flex justify-between items-start w-full">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Flame className="w-4 h-4 text-amber-500" />
                        <span className="font-bold text-sm text-amber-300">今日突破 (Breakout)</span>
                      </div>
                      <p className="text-xs text-gray-400 font-sans leading-tight font-normal">今日正式帶量突破 Pivot 起跑臨界點，進攻訊號。</p>
                    </div>
                    <span className="font-mono text-xl font-black text-amber-500 bg-slate-950 px-2 py-0.5 rounded-md">
                      {combinedWatchlist.filter(s => s.watchlistCategory === "今日突破").length}
                    </span>
                  </div>
                </button>

                {/* 4.過度延伸 */}
                <button 
                  onClick={() => setSelectedWatchCategory("過度延伸")}
                  className={`p-4 rounded-xl border cursor-pointer text-left transition-all block w-full focus:outline-none ${
                    selectedWatchCategory === "過度延伸" 
                      ? "bg-cyan-950/20 border-cyan-500 shadow-md shadow-cyan-500/5 ring-1 ring-cyan-500/30" 
                      : "bg-[#161B22] border-[#30363D] hover:border-gray-600"
                  }`}
                >
                  <div className="flex justify-between items-start w-full">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <ArrowUpRight className="w-4 h-4 text-cyan-400" />
                        <span className="font-bold text-sm text-cyan-300">過度延伸 (Extended)</span>
                      </div>
                      <p className="text-xs text-gray-400 font-sans leading-tight">已高於 Pivot 買點 5% 以上，此時建倉回吐風險高。</p>
                    </div>
                    <span className="font-mono text-xl font-black text-cyan-400 bg-slate-950 px-2 py-0.5 rounded-md">
                      {combinedWatchlist.filter(s => s.watchlistCategory === "過度延伸").length}
                    </span>
                  </div>
                </button>

                {/* 5.失敗型態 */}
                <button 
                  onClick={() => setSelectedWatchCategory("失敗型態")}
                  className={`p-4 rounded-xl border cursor-pointer text-left transition-all block w-full focus:outline-none ${
                    selectedWatchCategory === "失敗型態" 
                      ? "bg-rose-955/20 border-rose-500 shadow-md shadow-rose-500/5 ring-1 ring-rose-500/30" 
                      : "bg-[#161B22] border-[#30363D] hover:border-gray-600"
                  }`}
                >
                  <div className="flex justify-between items-start w-full">
                    <div className="space-y-1">
                      <div className="flex items-center gap-1.5">
                        <Ban className="w-4 h-4 text-rose-500" />
                        <span className="font-bold text-sm text-rose-300">失敗型態 (Failed Setup)</span>
                      </div>
                      <p className="text-xs text-gray-400 font-sans leading-tight">跌破自定停損線、跌破 50MA 均線或跌破 Pivot。</p>
                    </div>
                    <span className="font-mono text-xl font-black text-rose-500 bg-slate-950 px-2 py-0.5 rounded-md">
                      {combinedWatchlist.filter(s => s.watchlistCategory === "失敗型態").length}
                    </span>
                  </div>
                </button>
              </div>

                  {/* Main List Table Container */}
                  <div className="bg-[#161B22] rounded-xl border border-[#30363D] shadow-xl overflow-hidden flex flex-col min-h-[400px]">
                <div className="p-4 border-b border-[#30363D] flex flex-wrap items-center justify-between gap-3 bg-[#010409]">
                  <div>
                    <h3 className="font-extrabold text-sm text-white flex items-center gap-2">
                      <ClipboardList className="w-4 h-4 text-indigo-400" />
                      <span>
                        {selectedWatchCategory === "ALL" ? "全部監控股票清單" : `「${selectedWatchCategory}」分類追蹤`}
                      </span>
                    </h3>
                    <p className="text-[11px] text-gray-400 mt-0.5">
                      配合「持續符合天數」做篩選，天數多代表趨勢穩固，不因單日排名下降而立刻消失。
                    </p>
                  </div>
                  
                  <div className="text-xs text-gray-500 flex items-center gap-1.5 font-mono">
                    <Calendar className="w-3.5 h-3.5 text-gray-600" />
                    <span>資料即時狀態（最後掃描）：{lastUpdated}</span>
                  </div>
                </div>

                <div className="overflow-x-auto flex-1">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[#010409] border-b border-[#30363D] text-gray-400 font-bold select-none text-[11px] tracking-wider uppercase">
                        <th className="py-2 px-3 text-center w-10">#</th>
                        <th className="py-2 px-2">市場</th>
                        <th className="py-2 px-2">代號</th>
                        <th className="py-2 px-2">名稱</th>
                        <th className="py-2 px-2 text-right">當前收盤</th>
                        <th className="py-2 px-2 text-right">單日漲跌</th>
                        <th className="py-2 px-3 text-center">持續入選天數</th>
                        <th className="py-2 px-2 text-center">觀察分類</th>
                        <th className="py-2 px-2 text-center">Pivot 建立日期</th>
                        <th className="py-2 px-2 text-center">Pivot 狀態</th>
                        <th className="py-2 px-2 text-right text-emerald-300">建議 Pivot</th>
                        <th className="py-2 px-2 text-right text-gray-500">原始 Pivot</th>
                        <th className="py-2 px-2 text-center">59LiHi 總分</th>
                        <th className="py-2 px-2">當前收斂型態</th>
                        <th className="py-2 px-2 text-right">距離買點</th>
                        <th className="py-2 px-3 text-center">操作診斷</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#30363D]/60 pb-16 whitespace-nowrap">
                      {sortedWatchlist.length === 0 ? (
                        <tr>
                          <td colSpan={16} className="py-16 text-center text-gray-500 font-sans">
                            <AlertTriangle className="w-8 h-8 mx-auto text-amber-500 mb-2 opacity-50" />
                            目前本篩選分組下暫無符合的觀察個股標的。
                          </td>
                        </tr>
                      ) : (
                        sortedWatchlist.map((stock, idx) => {
                          const isPositive = stock.changePercent >= 0;
                          
                          // Determine watchlist category styling
                          let catBadgeStyle = "bg-gray-950 text-gray-400 border border-gray-800";
                          if (stock.watchlistCategory === "核心觀察股") {
                            catBadgeStyle = "bg-violet-950/40 text-violet-400 border border-violet-850/65";
                          } else if (stock.watchlistCategory === "接近買點") {
                            catBadgeStyle = "bg-emerald-950/40 text-emerald-400 border border-emerald-850/65";
                          } else if (stock.watchlistCategory === "今日突破") {
                            catBadgeStyle = "bg-amber-955/40 text-amber-505 border border-amber-850/65";
                          } else if (stock.watchlistCategory === "過度延伸") {
                            catBadgeStyle = "bg-cyan-950/40 text-cyan-400 border border-cyan-850/65";
                          } else if (stock.watchlistCategory === "失敗型態") {
                            catBadgeStyle = "bg-rose-955/40 text-rose-500 border border-rose-850/65";
                          }
                          
                          return (
                            <tr 
                              key={stock.ticker}
                              onClick={() => {
                                setSelectedTicker(stock.ticker);
                                setActiveTab("single");
                              }}
                              className="hover:bg-slate-900/80 cursor-pointer transition-all border-b border-[#30363D]/30 group"
                            >
                              {/* Row rank order */}
                              <td className="py-1.5 px-3 text-center font-mono text-gray-500 font-bold group-hover:text-white">
                                {idx + 1}
                              </td>

                              {/* Market type */}
                              <td className="py-1.5 px-2 text-center text-[10px]">
                                {stock.country === "TW" ? (
                                  <span className="px-1.5 py-0.2 rounded font-bold bg-emerald-950/40 text-emerald-400 border border-emerald-800/30">台股</span>
                                ) : (
                                  <span className="px-1.5 py-0.2 rounded font-bold bg-blue-950/40 text-blue-400 border border-blue-800/30">美股</span>
                                )}
                              </td>

                              {/* Ticker code */}
                              <td className="py-1.5 px-2 font-mono font-bold text-gray-300 group-hover:text-indigo-400 transition-colors uppercase">
                                {stock.ticker.split(".")[0]}
                              </td>

                              {/* Name */}
                              <td className="py-1.5 px-2 font-semibold text-white">
                                <div className="flex items-center gap-1">
                                  <span className="text-[13px]">{stock.name}</span>
                                  {stock.consecutiveDays && stock.consecutiveDays >= 15 && (
                                    <span className="text-[8px] bg-indigo-950/20 text-indigo-400 border border-indigo-900/30 px-1 py-0 rounded font-sans scale-90">強勢</span>
                                  )}
                                </div>
                              </td>

                              {/* Last Close price */}
                              <td className="py-1.5 px-2 text-right font-mono font-black text-gray-105">
                                {stock.country === "TW" ? `${stock.lastClose} 元` : `$${stock.lastClose}`}
                              </td>

                              {/* Day percentage changes */}
                              <td className={`py-1.5 px-2 text-right font-mono font-semibold ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {isPositive ? `+${stock.changePercent.toFixed(2)}%` : `${stock.changePercent.toFixed(2)}%`}
                              </td>

                              {/* Consecutive tracked days */}
                              <td className="py-1.5 px-3 text-center">
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full font-mono text-[10px] font-black bg-emerald-950/40 text-emerald-400 border border-emerald-500/10 shadow-sm leading-none">
                                  連續符合 {stock.consecutiveDays || 1} 天
                                </span>
                              </td>

                              {/* Watchlist Category label */}
                              <td className="py-1.5 px-2 text-center">
                                <span className={`px-1.5 py-0.2 rounded text-[9px] font-black ${catBadgeStyle}`}>
                                  {stock.watchlistCategory}
                                </span>
                              </td>

                              {/* Pivot Metadata */}
                              <td className="py-1.5 px-2 text-center font-mono text-[10px] text-gray-400">
                                {stock.pivotCreationDate || "--"}
                              </td>
                              <td className="py-1.5 px-2 text-center">
                                <span className={`px-1 py-0.2 rounded-[3px] text-[9px] font-bold ${
                                  stock.pivotStatus === "Fixed" ? "bg-amber-500/10 text-amber-500 border border-amber-500/20" :
                                  stock.pivotStatus === "Breakout" ? "bg-emerald-500/10 text-emerald-500 border border-emerald-500/20" :
                                  "bg-slate-800 text-gray-400"
                                }`}>
                                  {stock.pivotStatus === "Fixed" ? "已鎖定" : 
                                   stock.pivotStatus === "Breakout" ? "已突破" : "計算中"}
                                </span>
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono text-gray-100 font-bold">
                                {stock.country === "TW" ? `${stock.buyPoint} 元` : `$${stock.buyPoint}`}
                              </td>
                              <td className="py-1.5 px-2 text-right font-mono text-gray-500 text-[10px]">
                                {stock.originalPivot ? (stock.country === "TW" ? `${stock.originalPivot} 元` : `$${stock.originalPivot}`) : "--"}
                              </td>

                              {/* SEPA aggregate score */}
                              <td className="py-1.5 px-2 text-center text-[11px]">
                                <span className="text-gray-100 font-mono font-bold bg-slate-950 border border-slate-700 px-1.5 rounded">
                                  {stock.sepaScore?.total || 75}
                                </span>
                              </td>

                              {/* Convergence pattern metadata */}
                              <td className="py-1.5 px-2">
                                <div className="text-gray-200 font-semibold text-[11px] leading-tight">{stock.pattern}</div>
                                <div className="text-[9px] text-gray-500 truncate max-w-[150px] leading-tight" title={stock.vcpPhaseDesc}>
                                  {stock.vcpPhaseDesc}
                                </div>
                              </td>

                              {/* Distance percentage from pivot buy points */}
                              <td className="py-1.5 px-2 text-right font-mono text-[11px]">
                                {stock.pctToBuyPoint > 0 ? (
                                  <span className="text-amber-400 font-bold">{stock.pctToBuyPoint.toFixed(1)}%</span>
                                ) : stock.pctToBuyPoint === 0 ? (
                                  <span className="text-emerald-400 font-black">臨界突破點</span>
                                ) : (
                                  <span className="text-emerald-500 font-medium">{Math.abs(stock.pctToBuyPoint).toFixed(1)}% 已超越</span>
                                )}
                              </td>

                              {/* Switch diagnostics tab action button */}
                              <td className="py-1.5 px-3 text-center">
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedTicker(stock.ticker);
                                    setActiveTab("single");
                                  }}
                                  className="px-2 py-0.5 text-[9px] font-bold text-white bg-slate-800 hover:bg-indigo-600 rounded border border-slate-700 cursor-pointer hover:border-indigo-500 transition-all flex items-center gap-1 mx-auto"
                                >
                                  <span>診斷</span>
                                  <ChevronRight className="w-2.5 h-2.5 text-slate-400" />
                                </button>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>

                <div className="bg-[#010409] px-4 py-3 border-t border-[#30363D] flex flex-wrap justify-between items-center text-[10px] text-gray-500 font-mono gap-2">
                  <span>* 提示：高連續天數股票為「強大市場勢能 (Market Momentum)」之鐵證。遇大盤回檔時應優先選擇此類結構。</span>
                  <span>當前分組共呈現 {filteredWatchlist.length} 檔強勢股標的</span>
                </div>
              </div>
            </div>
          )}


          {/* TAB 3: SINGLE STOCK DETAILED DEEP REPORT */}
          {activeTab === "single" && (
            <div className="space-y-6 animate-fade-in" id="single-tab">
              {!activeStock ? (
                 <div className="bg-[#161B22] p-12 rounded-2xl border border-[#30363D] flex flex-col items-center justify-center text-center space-y-4">
                    <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center border border-slate-800">
                      <Search className="w-8 h-8 text-gray-600" />
                    </div>
                    <div className="space-y-1">
                       <h3 className="text-gray-200 font-bold">尚未選擇股票標的</h3>
                       <p className="text-gray-500 text-xs">請從「強勢股清單」或「監控清單」點擊股票，或使用代碼查詢。</p>
                    </div>
                    <button 
                      onClick={() => setActiveTab("watchlist")}
                      className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg"
                    >
                      前往監控清單
                    </button>
                 </div>
              ) : (
                <>
              {/* Target stock micro switcher header */}
              <div className="bg-[#161B22] p-4 rounded-xl border border-[#30363D] flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <Maximize2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  <span className="text-xs text-gray-400 font-medium">快速切換分析標的：</span>
                  <div className="flex flex-wrap gap-1.5">
                    {/* Combine top items of tw & us stocks for quick clicking */}
                    {twStocks.slice(0, 6).concat(usStocks.slice(0, 4)).map((s) => (
                      <button
                        key={s.ticker}
                        onClick={() => setSelectedTicker(s.ticker)}
                        className={`font-mono text-xs px-2.5 py-1 rounded-md border font-extrabold tracking-wide transition-all ${
                          s.ticker === activeStock.ticker
                            ? "bg-emerald-600 text-white border-emerald-500"
                            : "bg-black/40 text-gray-400 border-slate-800 hover:text-white"
                        }`}
                      >
                        {s.ticker.includes(".TW") ? s.ticker.split(".")[0] : s.ticker}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Direct text lookup switcher input */}
                <div className="flex items-center gap-2">
                  <label className="text-xs text-none font-semibold text-gray-400 hidden sm:inline">自訂代碼查詢:</label>
                  <input
                    type="text"
                    value={selectedTicker}
                    onChange={(e) => setSelectedTicker(e.target.value.toUpperCase())}
                    placeholder="例如: 2330.TW 或 NVDA"
                    className="bg-black border border-[#30363D] rounded-lg text-xs py-1.5 px-3 w-36 text-center font-mono font-bold tracking-widest text-[#a5b4fc] placeholder-gray-600 outline-none focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* General snapshot header profile card */}
              <div className="bg-slate-950/40 p-5 rounded-2xl border border-[#30363D] flex flex-wrap items-center justify-between gap-6 relative overflow-hidden">
                <div className="absolute top-0 right-0 py-1 px-4 text-[9px] font-black uppercase font-mono tracking-wider bg-indigo-500/10 text-indigo-400 rounded-bl border-l border-b border-indigo-500/10">SUPER STOCK ANALYTICS MATRIX</div>
                
                <div className="space-y-1.5">
                  <div className="flex items-baseline gap-2">
                    <span className="font-mono text-xs text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/10 tracking-widest uppercase font-black">
                      {activeStock.ticker}
                    </span>
                    <h2 className="text-2xl font-black text-white tracking-tight">{activeStock.name}</h2>
                    <span className="text-xs text-gray-400 font-sans">({activeStock.country === "TW" ? "台股上市櫃" : "美國股市"})</span>
                  </div>
                  
                  {/* General market attributes */}
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-400 font-medium">
                    <span>市場類型: <strong className="text-indigo-300 font-semibold">{activeStock.marketType}</strong></span>
                    <span>20日平均張量: <strong className="text-gray-200 font-mono">{(activeStock.avgVolume20 / 1000).toFixed(0)}K (張)</strong></span>
                    <span>當前狀態: <strong className="text-gray-200">{activeStock.status}</strong></span>
                  </div>
                </div>

                {/* Real-time price quotes summary */}
                <div className="flex items-center gap-6">
                  <div className="text-right">
                    <div className="text-[10px] text-gray-500 uppercase font-black tracking-wider leading-none">LAST SEC CLOSE</div>
                    <div className="font-mono text-3xl font-extrabold text-white tracking-tighter mt-1">
                      {activeStock.country === "US" ? "$" : ""}{activeStock.lastClose.toFixed(2)}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-[10px] text-gray-500 uppercase font-black tracking-wider leading-none font-mono">24H CHANGE %</div>
                    <div className={`font-mono text-xl font-extrabold leading-none mt-2 flex items-center justify-end ${activeStock.changePercent >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                      {activeStock.changePercent >= 0 ? "+" : ""}{activeStock.changePercent.toFixed(2)}%
                      {activeStock.changePercent >= 0 ? <ArrowUpRight className="w-5 h-5 ml-0.5" /> : <ArrowDownRight className="w-5 h-5 ml-0.5" />}
                    </div>
                  </div>
                </div>
              </div>

              {/* Grid 1: K-Line and SEPA Score */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                
                {/* Responsive Chart Column (7 cols) */}
                <div className="lg:col-span-7 flex flex-col gap-2">
                  <div className="h-[480px]">
                    <KLineChart stock={{ ...activeStock, klines: activeKlines }} />
                  </div>
                  <div className="px-4 py-3 rounded-lg bg-[#161B22]/50 border border-[#30363D] text-[10px] text-gray-550 leading-relaxed font-mono flex items-center gap-1.5">
                    <InfoIcon className="w-3.5 h-3.5 text-gray-400" />
                    滑鼠於圖表中左右移動可即時追蹤讀取每日開高低收等歷史成交量與 3 組主力均線指標之數值變化
                  </div>
                </div>

                {/* Score breakdown segment (5 cols) */}
                <div className="lg:col-span-5">
                  <SepaScores stock={activeStock} customWeights={weights} />
                </div>
              </div>

              {/* Grid 2: Trend Template check panel */}
              <div className="grid grid-cols-1 gap-6">
                <TrendTemplateCheck stock={activeStock} />
              </div>

              {/* Fundamental Analysis Section (Requested Replacement/Addition) */}
              <FundamentalAnalysis 
                data={fundamentalCache[activeStock.ticker] || null} 
                loading={fundamentalLoading && !fundamentalCache[activeStock.ticker]} 
              />

              {/* Grid 3: Battle-Plan Trade Setup card & Gemini AI master analysis report! */}
              <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-stretch">
                
                {/* Left card: Trade planning metrics (7 cols) */}
                <div className="md:col-span-7 bg-[#161B22] border border-[#30363D] rounded-xl p-5 shadow-sm flex flex-col justify-between space-y-6">
                  
                  {/* Header Title item */}
                  <div className="border-b border-slate-800 pb-3">
                    <h4 className="font-sans font-bold text-gray-100 flex items-center gap-2">
                      <SlidersHorizontal className="w-4 h-4 text-indigo-400" />
                      SEPA 實戰戰術與交易計畫設定
                    </h4>
                    <p className="text-gray-500 text-xs mt-0.5">根據第二階段突破策略精確配置的入場、停損防線與保本預防目標</p>
                  </div>

                  {/* Operational indicators segments */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    
                    {/* Pivot point config */}
                    <div className="bg-black/30 p-4 rounded-xl border border-slate-800 space-y-2 relative overflow-hidden">
                      <div className="absolute right-2 top-2 p-1.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/10 text-[9px] font-black leading-none uppercase select-none font-bold">PIVOT LIMIT</div>
                      <span className="text-[10px] text-gray-500 font-bold tracking-wider leading-none uppercase">Pivot 突破買點預設</span>
                      <div className="font-mono text-2xl font-black text-gray-100">
                        {activeStock.country === "US" ? "$" : ""}{activeStock.buyPoint}
                      </div>

                      <div className="flex flex-col gap-1 mt-1 border-t border-slate-800/50 pt-2">
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-gray-500">Pivot 建立日期:</span>
                          <span className="font-mono text-indigo-400 font-bold">{activeStock.pivotCreationDate || "N/A"}</span>
                        </div>
                        <div className="flex justify-between items-center text-[10px]">
                          <span className="text-gray-500">當前 Pivot 狀態:</span>
                          <span className={`font-bold ${
                            activeStock.statusEn === "Breakout" ? "text-amber-500" :
                            activeStock.statusEn === "Near Pivot" ? "text-emerald-400" :
                            "text-gray-300"
                          }`}>{activeStock.status}</span>
                        </div>
                      </div>

                      <p className="text-[10px] text-gray-500 leading-snug mt-2">
                        強勢股突破橫盤整理與浮額洗乾淨後的最高價位 (合理進場區限制在突破點 +5% 內)。
                      </p>
                    </div>

                    {/* Target reasonable buying window */}
                    <div className="bg-black/30 p-4 rounded-xl border border-slate-800 space-y-1.5">
                      <span className="text-[10px] text-gray-500 font-bold tracking-wider leading-none uppercase">合理建立倉位區間</span>
                      <div className="font-mono text-base font-bold text-emerald-400 leading-snug">
                        {activeStock.country === "US" ? "$" : ""}{activeStock.buyPoint} ~ {activeStock.country === "US" ? "$" : ""}{(activeStock.buyPoint * 1.05).toFixed(2)}
                      </div>
                      <span className="text-[10px] text-gray-500 bg-emerald-500/10 py-0.5 px-2 rounded-full border border-emerald-500/20 font-sans inline-block mt-1 font-bold">
                        上限 Pivot +5% 追擊
                      </span>
                      <p className="text-[10px] text-gray-500 leading-snug mt-1">
                        若價格超出突破價格 5% 以上，買入阻力大幅上升，切勿高熱量盲目追擊。
                      </p>
                    </div>

                    {/* Initial protective stop loss price */}
                    <div className="bg-black/30 p-4 rounded-xl border border-slate-800 space-y-1.5 relative overflow-hidden">
                      <div className="p-1 px-1.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/10 text-[9px] font-bold absolute right-2 top-2 leading-none uppercase">STOP LOSS</div>
                      <span className="text-[10px] text-gray-500 font-bold tracking-wider leading-none uppercase">初始撤退防守停損點</span>
                      <div className="font-mono text-2xl font-black text-rose-500">
                        {activeStock.country === "US" ? "$" : ""}{activeStock.stopLoss}
                      </div>
                      <p className="text-[10px] text-rose-400/90 leading-snug font-semibold bg-rose-950/15 p-1 rounded">
                        單筆交易最大估算風險: {activeStock.riskPercent.toFixed(2)}%
                      </p>
                      <p className="text-[10px] text-gray-500 leading-snug">
                        若收盤價失守此防衛欄，代表本次 VCP 突破結構徹底宣告失敗，應依照無二紀律無條件清倉避難！
                      </p>
                    </div>

                    {/* Expected R ratio targets */}
                    <div className="bg-black/30 p-4 rounded-xl border border-slate-800 space-y-1.5">
                      <span className="text-[10px] text-gray-500 font-bold tracking-wider leading-none uppercase">風險回報比 (期望值目標)</span>
                      <div className="space-y-1 mt-1 font-mono text-xs">
                        <div className="flex justify-between">
                          <span className="text-gray-400">第一目標價 (2R 報酬):</span>
                          <span className="font-bold text-gray-100">{activeStock.country === "US" ? "$" : ""}{activeStock.targetPrice1}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-400">第二目標價 (3R 報酬):</span>
                          <span className="font-bold text-gray-100">{activeStock.country === "US" ? "$" : ""}{activeStock.targetPrice2}</span>
                        </div>
                      </div>
                      <p className="text-[10px] text-gray-500 leading-snug pt-1">
                        平均获利幅度必须是停损风险的 2 到 3 倍以上。如此即使你的交易勝率僅 40%，期望值仍將維持高度上行！
                      </p>
                    </div>

                  </div>

                  {/* Quantitative Distance calculation and suggestion alerts */}
                  <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-850 space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-gray-200">當前距離 Pivot 突破點差值：</span>
                      <span className={`font-mono font-bold text-sm px-2.5 py-0.5 rounded ${
                        activeStock.pctToBuyPoint > 5 ? "bg-amber-500/10 text-amber-500" :
                        activeStock.pctToBuyPoint > 0 ? "bg-indigo-500/10 text-indigo-400" :
                        "bg-emerald-500/10 text-emerald-400"
                      }`}>
                        {activeStock.pctToBuyPoint > 0 ? `+${activeStock.pctToBuyPoint}%` : `${activeStock.pctToBuyPoint}%`}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed font-sans pt-1">
                      <strong>大師操盤叮嚀</strong>：{activeStock.suggestion}
                    </p>
                  </div>
                </div>

                {/* Right col: Stack cards (5 cols) */}
                <div className="md:col-span-5 flex flex-col gap-6">
                  {/* Gemini AI Smart Commentary */}
                  <div className="bg-[#161B22] border border-[#30363D] rounded-xl p-5 shadow-sm flex flex-col justify-between">
                    <div className="space-y-4">
                      <div className="border-b border-slate-800 pb-3 flex items-center justify-between">
                        <div>
                          <h4 className="font-sans font-bold text-gray-100 flex items-center gap-2">
                            <Flame className="w-4 h-4 text-amber-500 fill-amber-500" />
                            Gemini 戰術大師即時點評
                          </h4>
                          <p className="text-gray-500 text-xs mt-0.5">調用大師思維邏輯對當前個股籌碼、形态进行剖析</p>
                        </div>

                        {/* Spark element helper */}
                        <span className="font-mono text-[9px] bg-slate-950 px-1.5 py-0.5 rounded border border-[#30363D] text-gray-500 font-bold uppercase tracking-wider select-none">Proxy AI</span>
                      </div>

                      {/* Commentary body content */}
                      <div className="bg-slate-950 rounded-xl p-4 border border-slate-900 min-h-[220px] text-xs leading-relaxed max-h-[300px] overflow-y-auto font-sans">
                        {aiReportCache[activeStock.ticker] ? (
                          <div className="whitespace-pre-wrap text-gray-300 font-sans space-y-2">
                            {aiReportCache[activeStock.ticker].split("\n").map((line, idx) => {
                              if (line.startsWith("###")) {
                                return <h5 key={idx} className="font-bold text-gray-100 text-sm mt-3 mb-1 first:mt-0 font-sans">{line.replace("###", "").trim()}</h5>;
                              } else if (line.startsWith("**") && line.endsWith("**")) {
                                return <strong key={idx} className="block text-indigo-400 text-xs mt-2 font-bold font-sans">{line.replace(/\*\*/g, "").trim()}</strong>;
                              } else if (line.startsWith("-")) {
                                return <li key={idx} className="ml-3 list-disc text-gray-300 pl-1 mt-1 font-sans">{line.replace("-", "").trim()}</li>;
                              } else if (line.startsWith(">")) {
                                return <blockquote key={idx} className="border-l-2 border-emerald-500 pl-2 italic text-emerald-400 my-2 font-sans">{line.replace(">", "").trim()}</blockquote>;
                              }
                              return <p key={idx} className="mt-1.5 first:mt-0 font-sans">{line}</p>;
                            })}
                          </div>
                        ) : (
                          <div className="flex flex-col items-center justify-center h-full text-center py-12 text-gray-550 space-y-4">
                            <Lock className="w-8 h-8 text-slate-700 mx-auto" />
                            <div className="space-y-1">
                              <p className="font-bold text-gray-400">研析報告庫未啟用點評</p>
                              <p className="text-[10px] text-gray-500">點擊下方按鈕引導 Gemini AI 對本股進行 59LiHi 大師級深度操盤研判</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Operational execution buttons */}
                    <div className="pt-4 mt-4 border-t border-slate-800 flex justify-end">
                      <button
                        onClick={() => fetchAiAnalysis(activeStock)}
                        disabled={aiLoading || (aiReportCache[activeStock.ticker] && aiReportCache[activeStock.ticker] !== "分析產生中，請稍候..." && aiReportCache[activeStock.ticker] !== "⚠️ 數據演算連線中斷。請點擊按鈕重試。")}
                        className="w-full flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 disabled:scale-100 text-white py-2 px-4 rounded-lg font-bold text-xs transition-all shadow-md select-none"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${aiLoading ? "animate-spin" : ""}`} />
                        {aiLoading ? "Gemini 大師寫作中..." : aiReportCache[activeStock.ticker] ? "已生成大師專屬剖析" : "🚀 要求 Gemini 大師研判個股"}
                      </button>
                    </div>
                  </div>

                  {/* Super Performance Holding Management Card */}
                  <SuperPerformanceManagement stock={activeStock} klines={activeKlines} />
                </div>
              </div>
            </>
          )}
        </div>
      )}


          {/* TAB 4: SYSTEM CONFIGS WEIGHTS */}
          {activeTab === "settings" && (
            <div className="space-y-6 max-w-3xl mx-auto py-4 animate-fade-in" id="settings-tab">
              
              <div className="border-b border-slate-850 pb-3">
                <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
                  <Settings className="w-5 h-5 text-indigo-400" />
                  系統設定與偏好
                </h2>
                <p className="text-xs text-gray-400">
                  調整交易系統權重、佈局顯示以及流動性篩選因子。
                </p>
              </div>

              {/* Layout Adjustment */}
              <div className="bg-[#161B22] p-5 rounded-2xl border border-[#30363D] space-y-4">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 border-b border-[#30363D] pb-3">
                  <Layers className="w-5 h-5 text-indigo-400" />
                  介面佈局設定
                </h3>
                
                <div className="flex items-center justify-between p-2">
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-gray-200 uppercase tracking-tight">顯示側邊篩選面板</span>
                    <span className="text-[10px] text-gray-500">在電腦版開啟或隱藏左側的過濾與大盤監視選單，隱藏後列表會延伸至全螢幕。</span>
                  </div>
                  <button
                    onClick={() => {
                      const val = !showSidebar;
                      setShowSidebar(val);
                      localStorage.setItem("sepa_show_sidebar", String(val));
                    }}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${showSidebar ? "bg-emerald-600" : "bg-slate-700"}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${showSidebar ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>
              </div>

              {/* Form config weights */}
              <form onSubmit={handleSaveWeights} className="bg-[#161B22] p-6 rounded-2xl border border-[#30363D] space-y-6 shadow-sm">
                
                <div className="space-y-4">
                  
                  {/* Category 1: Trend Template */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-gray-200">1. 趨勢樣板檢定符合度 (預設 40%)</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          className="bg-black border border-[#30363D] rounded px-1.5 py-0.5 w-14 font-mono text-center text-xs text-white"
                          value={tempWeights.trendTemplate}
                          min="0"
                          max="100"
                          onChange={(e) => updateTempWeight("trendTemplate", parseInt(e.target.value))}
                        />
                        <span className="text-gray-500">%</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-500">
                      根據 8 大多頭核心均線及 200MA 長期上揚走勢排序對核心動態。
                    </p>
                  </div>

                  {/* Category 2: RS intensity */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-gray-200">2. RS 相對市場強度地位 (預設 20%)</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          className="bg-black border border-[#30363D] rounded px-1.5 py-0.5 w-14 font-mono text-center text-xs text-white"
                          value={tempWeights.rsStrength}
                          min="0"
                          max="100"
                          onChange={(e) => updateTempWeight("rsStrength", parseInt(e.target.value))}
                        />
                        <span className="text-gray-500">%</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-500">
                      考量對大盤強度的防守係數與勝出位能。
                    </p>
                  </div>

                  {/* Category 3: VCP formation tightness */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-gray-200">3. VCP 型態震幅收縮結構 (預設 20%)</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          className="bg-black border border-[#30363D] rounded px-1.5 py-0.5 w-14 font-mono text-center text-xs text-white"
                          value={tempWeights.vcpPattern}
                          min="0"
                          max="100"
                          onChange={(e) => updateTempWeight("vcpPattern", parseInt(e.target.value))}
                        />
                        <span className="text-gray-500">%</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-500">
                      3T、4T 等振幅逐步有序收窄、右側緊縮與浮額洗清程度（主力是否完成鎖定）。
                    </p>
                  </div>

                  {/* Category 4: Volume dry-up */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-gray-200">4. 整理期成交量結構與萎縮乾枯度 (預設 10%)</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          className="bg-black border border-[#30363D] rounded px-1.5 py-0.5 w-14 font-mono text-center text-xs text-white"
                          value={tempWeights.volumeDryUp}
                          min="0"
                          max="100"
                          onChange={(e) => updateTempWeight("volumeDryUp", parseInt(e.target.value))}
                        />
                        <span className="text-gray-500">%</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-500">
                      在價格緊縮低點，市場成交量是否呈低迷乾涸 VDU 特徵。
                    </p>
                  </div>

                  {/* Category 5: Risk / Reward */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-xs">
                      <span className="font-bold text-gray-200">5. 風險報酬期望值比 (預設 10%)</span>
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          className="bg-black border border-[#30363D] rounded px-1.5 py-0.5 w-14 font-mono text-center text-xs text-white"
                          value={tempWeights.riskReward}
                          min="0"
                          max="100"
                          onChange={(e) => updateTempWeight("riskReward", parseInt(e.target.value))}
                        />
                        <span className="text-gray-500">%</span>
                      </div>
                    </div>
                    <p className="text-[11px] text-gray-500">
                      突破點相較於停損點的寬窄度（初始停損越窄、回調性風險越小，分數越高）。
                    </p>
                  </div>

                </div>

                {/* Weights calculated summation check */}
                <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-900 flex justify-between items-center text-xs font-mono font-medium">
                  <span className="text-gray-400">當前各項權重比例加總分數：</span>
                  <span className={`font-bold text-sm ${
                    (tempWeights.trendTemplate + tempWeights.rsStrength + tempWeights.vcpPattern + tempWeights.volumeDryUp + tempWeights.riskReward) === 100
                      ? "text-emerald-400"
                      : "text-rose-500"
                  }`}>
                    {tempWeights.trendTemplate + tempWeights.rsStrength + tempWeights.vcpPattern + tempWeights.volumeDryUp + tempWeights.riskReward} % (需等於 100%)
                  </span>
                </div>

                {/* Submitting Buttons */}
                <div className="flex gap-3 justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleResetWeights}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 font-bold rounded-lg text-xs tracking-wider transition-all select-none"
                  >
                    回復預設預配置
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg text-xs tracking-wider transition-all shadow-md select-none"
                  >
                    保存並套用重算
                  </button>
                </div>

                {/* Real-time warning feedback info */}
                {weightsError && (
                  <div className="text-xs text-rose-500 mt-2 font-mono font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {weightsError}
                  </div>
                )}
              </form>

              {/* 篩選參數設定 Card Component */}
              <form onSubmit={handleSaveLiquidity} className="bg-[#161B22] p-6 rounded-2xl border border-[#30363D] space-y-6 shadow-sm">
                <div className="border-b border-[#30363D] pb-3">
                  <h3 className="text-base font-extrabold text-white flex items-center gap-2">
                    <Filter className="w-5 h-5 text-indigo-400" />
                    台股實戰流動性過濾條件 (篩選參數設定)
                  </h3>
                  <p className="text-xs text-gray-400 mt-1">
                    流動性條件是為了排除成交量太低、難以進出的股票，並非 SEPA 原文標準。
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-300 font-semibold block">最低限制股價 (元)</label>
                    <input
                      type="number"
                      className="w-full bg-[#0d1117] border border-[#30363D] rounded-lg text-xs p-2.5 text-white font-mono outline-none focus:border-indigo-500"
                      value={tempLiquidity.minPrice}
                      min="0"
                      onChange={(e) => setTempLiquidity((prev) => ({ ...prev, minPrice: parseFloat(e.target.value) || 0 }))}
                    />
                    <p className="text-[10px] text-gray-400">低於此股價將過濾（預設：20）</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-300 font-semibold block">最低日成交金額 (萬元)</label>
                    <input
                      type="number"
                      className="w-full bg-[#0d1117] border border-[#30363D] rounded-lg text-xs p-2.5 text-white font-mono outline-none focus:border-indigo-500"
                      value={tempLiquidity.minTurnover / 10000}
                      min="0"
                      onChange={(e) => setTempLiquidity((prev) => ({ ...prev, minTurnover: (parseInt(e.target.value) || 0) * 10000 }))}
                    />
                    <p className="text-[10px] text-gray-400">當日成交金額（萬元為單位，預設：5000萬）</p>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-gray-300 font-semibold block">最低 20 日均成交量 (張 / 1000股)</label>
                    <input
                      type="number"
                      className="w-full bg-[#0d1117] border border-[#30363D] rounded-lg text-xs p-2.5 text-white font-mono outline-none focus:border-indigo-500"
                      value={tempLiquidity.minAvgVolume / 1000}
                      min="0"
                      onChange={(e) => setTempLiquidity((prev) => ({ ...prev, minAvgVolume: (parseInt(e.target.value) || 0) * 1000 }))}
                    />
                    <p className="text-[10px] text-gray-400">均量張數（1張 = 1,000股，預設：1000張）</p>
                  </div>
                </div>

                <div className="space-y-3 pt-2">
                  <span className="text-xs text-gray-300 font-bold block">板塊與類型排除開關</span>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <label className="flex items-center gap-2.5 text-xs text-gray-300 cursor-pointer select-none bg-black/30 p-2.5 rounded-lg border border-slate-900 hover:bg-black/50 transition-all">
                      <input
                        type="checkbox"
                        checked={tempLiquidity.excludeEtf}
                        onChange={(e) => setTempLiquidity((prev) => ({ ...prev, excludeEtf: e.target.checked }))}
                        className="rounded border-[#30363D] text-indigo-600 focus:ring-indigo-500 h-4 w-4 bg-slate-950"
                      />
                      <span>排除指數股票型基金 (排除 ETF)</span>
                    </label>

                    <label className="flex items-center gap-2.5 text-xs text-gray-300 cursor-pointer select-none bg-black/30 p-2.5 rounded-lg border border-slate-900 hover:bg-black/50 transition-all">
                      <input
                        type="checkbox"
                        checked={tempLiquidity.excludeWarrants}
                        onChange={(e) => setTempLiquidity((prev) => ({ ...prev, excludeWarrants: e.target.checked }))}
                        className="rounded border-[#30363D] text-indigo-600 focus:ring-indigo-500 h-4 w-4 bg-slate-950"
                      />
                      <span>排除權證 / 認購售憑證 (排除權證)</span>
                    </label>

                    <label className="flex items-center gap-2.5 text-xs text-gray-300 cursor-pointer select-none bg-black/30 p-2.5 rounded-lg border border-slate-900 hover:bg-black/50 transition-all">
                      <input
                        type="checkbox"
                        checked={tempLiquidity.excludePreferred}
                        onChange={(e) => setTempLiquidity((prev) => ({ ...prev, excludePreferred: e.target.checked }))}
                        className="rounded border-[#30363D] text-indigo-600 focus:ring-indigo-500 h-4 w-4 bg-slate-950"
                      />
                      <span>排除特別股 / 優先股 (排除特別股)</span>
                    </label>

                    <label className="flex items-center gap-2.5 text-xs text-gray-300 cursor-pointer select-none bg-black/30 p-2.5 rounded-lg border border-slate-900 hover:bg-black/50 transition-all">
                      <input
                        type="checkbox"
                        checked={tempLiquidity.excludeEmerging}
                        onChange={(e) => setTempLiquidity((prev) => ({ ...prev, excludeEmerging: e.target.checked }))}
                        className="rounded border-[#30363D] text-indigo-600 focus:ring-indigo-500 h-4 w-4 bg-slate-950"
                      />
                      <span>排除興櫃市場股票 (排除興櫃)</span>
                    </label>

                    <label className="flex items-center gap-2.5 text-xs text-gray-300 cursor-pointer select-none bg-black/30 p-2.5 rounded-lg border border-slate-900 hover:bg-black/50 transition-all col-span-2">
                      <input
                        type="checkbox"
                        checked={tempLiquidity.require200Days}
                        onChange={(e) => setTempLiquidity((prev) => ({ ...prev, require200Days: e.target.checked }))}
                        className="rounded border-[#30363D] text-indigo-600 focus:ring-indigo-500 h-4 w-4 bg-slate-950"
                      />
                      <span>要求最近 200 日交易歷史資料完整</span>
                    </label>
                  </div>
                </div>

                <div className="bg-indigo-950/20 px-4 py-3 rounded-xl border border-indigo-500/20 text-xs text-[#a5b4fc] flex items-start gap-2 select-none">
                  <InfoIcon className="w-4 h-4 shrink-0 text-indigo-400 mt-0.5" />
                  <p className="leading-relaxed font-semibold">
                    流動性條件是為了排除成交量太低、難以進出的股票，並非 SEPA 原文標準。SEPA 核心仍以趨勢樣板、RS 強度、VCP 型態與風險報酬比為主。
                  </p>
                </div>

                <div className="flex gap-3 justify-end pt-2">
                  <button
                    type="button"
                    onClick={handleResetLiquidity}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 font-bold rounded-lg text-xs tracking-wider transition-all select-none text-gray-300"
                  >
                    恢復流動性預設條件
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs tracking-wider transition-all shadow-md select-none"
                  >
                    保存並套用篩選設定
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Industry Mapping Manager */}
          {activeTab === "industry" && (
            <div className="max-w-4xl mx-auto py-6">
               <IndustryManager />
            </div>
          )}

        </section>
      </main>

      {/* Persistent Legal disclaimer bar and state */}
      <footer className="bg-[#010409] border-t border-[#30363D] px-4 md:px-6 py-2.5 flex flex-wrap items-center justify-between gap-4 text-[10px] text-gray-550 z-45 shrink-0">
        <div className="flex items-center gap-4">
          <span>&copy; 2026 59LiHi Master Investing System</span>
          <span className="flex items-center gap-1.5 text-emerald-500 font-bold">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
            系統演算引擎已在線
          </span>
        </div>

        {/* Legal Disclaimer block mandated by spec */}
        <div className="max-w-2xl text-center sm:text-right font-sans text-gray-500 leading-tight">
          ⚠️ <strong>風險提示 / 免責聲明：</strong>
          本系統所有數據篩選與 AI 分析點評僅供學術探討、量化策略示範研究與學習用途使用，不構成任何誘使買入、推薦或具體的投資建議。股票交易具備極高下行風險與本金虧損機率，投資前請務必獨立思考與自行判斷，並確實執行自主風控與停損紀律。
        </div>

        <div className="font-mono text-gray-600 hidden md:block">
          Cluster: Cloud-Run-Prod-TW-1
        </div>
      </footer>
    </div>
  );
}

// Inline fallback icon
function InfoIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <circle cx="12" cy="12" r="10"/>
      <path d="M12 16v-4"/>
      <path d="M12 8h.01"/>
    </svg>
  );
}
