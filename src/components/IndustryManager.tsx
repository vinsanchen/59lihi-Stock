/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import { Save, Search, Plus, Trash2, Info, Building2, Upload, ListFilter, X, Check } from "lucide-react";
import { DataProvider } from "../services/DataProvider";

interface SimpleStock {
    ticker: string;
    name: string;
}

export default function IndustryManager() {
  const [mapping, setMapping] = useState<{ [ticker: string]: string }>({});
  const [stocks, setStocks] = useState<SimpleStock[]>([]);
  const [newTicker, setNewTicker] = useState("");
  const [newIndustry, setNewIndustry] = useState("");
  const [search, setSearch] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  // Bulk Edit State
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");

  // Quick Unclassified State
  const [showUnclassified, setShowUnclassified] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [mapData, stockList] = await Promise.all([
        DataProvider.getIndustryMapping(),
        DataProvider.fetchStockListSimple()
    ]);
    setMapping(mapData);
    setStocks(stockList);
  };

  const stockNamesMap = useMemo(() => {
    const m = new Map<string, string>();
    stocks.forEach(s => {
        m.set(s.ticker.split(".")[0], s.name);
        m.set(s.ticker, s.name);
    });
    return m;
  }, [stocks]);

  const handleSave = async () => {
    setSaving(true);
    const success = await DataProvider.saveIndustryMapping(mapping);
    if (success) {
      setMsg("✅ 儲存成功！");
      setTimeout(() => setMsg(""), 3000);
    }
    setSaving(false);
  };

  const handleAdd = (ticker: string, industry: string) => {
    if (!ticker || !industry) return;
    const cleanT = ticker.trim().split(".")[0];
    setMapping(prev => ({ ...prev, [cleanT]: industry.trim() }));
    setNewTicker("");
    setNewIndustry("");
  };

  const handleBulkImport = () => {
    const lines = bulkText.split("\n");
    const newEntries: { [ticker: string]: string } = { ...mapping };
    let count = 0;

    lines.forEach(line => {
        const parts = line.split(/[\s, \t]+/).filter(p => p.trim());
        if (parts.length >= 2) {
            const ticker = parts[0].trim().split(".")[0];
            const industry = parts.slice(1).join(" ");
            newEntries[ticker] = industry;
            count++;
        }
    });

    setMapping(newEntries);
    setBulkText("");
    setShowBulk(false);
    setMsg(`✅ 成功匯入 ${count} 筆資料 (記得按下儲存)`);
    setTimeout(() => setMsg(""), 5000);
  };

  const handleRemove = (ticker: string) => {
    const newMapping = { ...mapping };
    delete newMapping[ticker];
    setMapping(newMapping);
  };

  const filteredItems = (Object.entries(mapping) as [string, string][])
    .map(([ticker, industry]) => ({
        ticker,
        industry,
        name: stockNamesMap.get(ticker) || "未知公司"
    }))
    .filter(item => 
        item.ticker.includes(search) || 
        item.industry.toLowerCase().includes(search.toLowerCase()) ||
        item.name.includes(search)
    );

  const unclassifiedStocks = stocks.filter(s => {
      const cleanT = s.ticker.split(".")[0];
      return !mapping[cleanT];
  });

  return (
    <div className="bg-[#0D1117] border border-[#30363D] rounded-xl overflow-hidden animate-fade-in shadow-2xl">
      {/* Header */}
      <div className="p-6 border-b border-[#30363D] flex items-center justify-between bg-slate-900/40">
        <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-500/10 rounded-lg flex items-center justify-center border border-indigo-500/20">
                <Building2 className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
                <h2 className="text-xl font-black text-white">產業分類智慧維護中心</h2>
                <p className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Industry Knowledge Database Manager</p>
            </div>
        </div>
        <div className="flex items-center gap-2">
            <button 
                onClick={() => setShowBulk(!showBulk)}
                className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 text-gray-200 px-4 py-2 rounded-lg font-black text-xs transition-all border border-slate-700"
            >
                <Upload className="w-3.5 h-3.5" /> 批次匯入
            </button>
            <button 
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-gray-700 text-white px-6 py-2 rounded-lg font-black text-sm transition-all shadow-lg shadow-indigo-900/20"
            >
                <Save className="w-4 h-4" />
                {saving ? "系統儲存中..." : "儲存所有變更"}
            </button>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {msg && (
            <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-black rounded-xl flex items-center gap-2 animate-in fade-in slide-in-from-top-1">
                <Check className="w-4 h-4" /> {msg}
            </div>
        )}

        {/* Bulk Modal */}
        {showBulk && (
            <div className="bg-[#161B22] p-6 rounded-2xl border-2 border-indigo-500/30 space-y-4 shadow-3xl animate-in zoom-in-95">
                <div className="flex items-center justify-between">
                    <h3 className="text-sm font-black text-white flex items-center gap-2 uppercase tracking-wider">
                        <Upload className="w-4 h-4 text-indigo-400" /> 批次大量匯入模式
                    </h3>
                    <button onClick={() => setShowBulk(false)} className="text-gray-500 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
                </div>
                <p className="text-[11px] text-gray-400">請輸入「代號 產業名稱」，每一行一筆。例如：<code className="text-indigo-400 mx-1">2330 半導體</code></p>
                <textarea 
                    value={bulkText}
                    onChange={e => setBulkText(e.target.value)}
                    className="w-full h-[200px] bg-black border border-slate-800 rounded-xl p-4 text-sm text-gray-200 font-mono focus:border-indigo-500 outline-none transition-all placeholder:text-gray-700"
                    placeholder="2330 半導體&#10;2382 AI伺服器&#10;3231 散熱"
                />
                <div className="flex justify-end gap-2">
                    <button onClick={() => setShowBulk(false)} className="px-4 py-2 text-xs font-black text-gray-400">取消</button>
                    <button onClick={handleBulkImport} className="bg-indigo-600 hover:bg-indigo-500 text-white px-8 py-2 rounded-lg font-black text-xs shadow-lg shadow-indigo-900/40">確認匯入解析</button>
                </div>
            </div>
        )}

        {/* Add Section */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-[#161B22]/50 p-5 rounded-2xl border border-slate-800/60 transition-all hover:bg-[#161B22] hover:border-slate-700">
            <div className="md:col-span-3">
                <label className="block text-[10px] font-black text-gray-500 uppercase mb-1.5 tracking-widest pl-1">個股代號</label>
                <input 
                    type="text" 
                    value={newTicker}
                    onChange={e => {
                        setNewTicker(e.target.value);
                    }}
                    placeholder="代號 (如: 2330)"
                    className="w-full bg-black border border-slate-800 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none transition-all font-mono text-sm"
                />
                {newTicker && stockNamesMap.has(newTicker.split(".")[0]) && (
                    <div className="mt-1 text-[10px] text-indigo-400 font-bold px-1">
                        🎯 偵測到公司：{stockNamesMap.get(newTicker.split(".")[0])}
                    </div>
                )}
            </div>
            <div className="md:col-span-1 flex items-center justify-center pt-5">
                <Plus className="text-gray-700 w-5 h-5" />
            </div>
            <div className="md:col-span-6">
                <label className="block text-[10px] font-black text-gray-500 uppercase mb-1.5 tracking-widest pl-1">目標產業名稱</label>
                <input 
                    type="text" 
                    value={newIndustry}
                    onChange={e => setNewIndustry(e.target.value)}
                    placeholder="請輸入產業分類 (如: AI、半導體、CoWoS)"
                    className="w-full bg-black border border-slate-800 rounded-xl px-4 py-3 text-white focus:border-indigo-500 outline-none transition-all text-sm"
                />
            </div>
            <div className="md:col-span-2 flex items-end">
                <button 
                    onClick={() => handleAdd(newTicker, newIndustry)}
                    className="w-full bg-indigo-600/10 hover:bg-indigo-600 border border-indigo-500/20 hover:border-indigo-500 text-indigo-400 hover:text-white h-[46px] rounded-xl flex items-center justify-center gap-2 font-black text-xs transition-all shadow-sm"
                >
                    立即加入
                </button>
            </div>
        </div>

        {/* Unclassified Quick List */}
        <div className="space-y-3">
            <button 
                onClick={() => setShowUnclassified(!showUnclassified)}
                className="flex items-center gap-2 text-xs font-black text-gray-400 hover:text-indigo-400 transition-colors uppercase tracking-widest bg-slate-900/40 px-4 py-2 rounded-lg border border-slate-800"
            >
                <ListFilter className="w-3.5 h-3.5" /> 快速列出「未分類」個股 ({unclassifiedStocks.length})
            </button>
            
            {showUnclassified && (
                <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-2 bg-black/40 p-4 rounded-xl border border-slate-800 max-h-[300px] overflow-y-auto custom-scrollbar">
                    {unclassifiedStocks.map(s => (
                        <button 
                            key={s.ticker}
                            onClick={() => {
                                setNewTicker(s.ticker.split(".")[0]);
                                setShowUnclassified(false);
                            }}
                            className="text-left p-2 rounded bg-slate-900 hover:bg-indigo-900/40 border border-slate-800 transition-all group"
                        >
                            <span className="block text-[10px] text-gray-500 font-mono group-hover:text-indigo-300">{s.ticker.split(".")[0]}</span>
                            <span className="block text-[11px] font-black text-gray-300 truncate">{s.name}</span>
                        </button>
                    ))}
                    {unclassifiedStocks.length === 0 && <p className="col-span-full text-center py-4 text-xs text-gray-600 italic">所有標的皆已分類完成！</p>}
                </div>
            )}
        </div>

        {/* Table List */}
        <div className="space-y-4 pt-4 border-t border-slate-800/50">
            <div className="flex items-center justify-between">
                <h3 className="text-sm font-black text-white flex items-center gap-2">
                    分類資產庫 <span className="px-2 py-0.5 bg-slate-800 rounded text-[10px] text-gray-500">{Object.keys(mapping).length} 筆</span>
                </h3>
                <div className="relative">
                    <Search className="w-4 h-4 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input 
                        type="text" 
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="搜尋代號、名稱、或產業分類名稱"
                        className="bg-black border border-slate-800 rounded-xl px-10 py-2.5 text-xs text-white focus:border-indigo-500 outline-none transition-all w-[320px] placeholder:text-gray-700"
                    />
                </div>
            </div>

            <div className="max-h-[600px] overflow-y-auto pr-2 custom-scrollbar">
                <table className="w-full text-left">
                    <thead className="sticky top-0 bg-[#0D1117] z-10 border-b border-slate-800">
                        <tr>
                            <th className="py-4 px-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">標的名稱 (代號)</th>
                            <th className="py-4 px-4 text-[10px] font-black text-gray-500 uppercase tracking-widest">目前產業分類</th>
                            <th className="py-4 px-4 text-right text-[10px] font-black text-gray-500 uppercase tracking-widest">操作</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40">
                        {filteredItems.map((item) => (
                            <tr key={item.ticker} className="group hover:bg-slate-900/30 transition-colors">
                                <td className="py-4 px-4">
                                    <div className="flex flex-col">
                                        <span className="text-sm font-black text-gray-200 group-hover:text-white transition-colors">{item.name}</span>
                                        <span className="text-[11px] font-mono font-bold text-gray-600 group-hover:text-indigo-500/60 transition-colors">{item.ticker}</span>
                                    </div>
                                </td>
                                <td className="py-4 px-4">
                                    <span className="px-3 py-1 bg-indigo-500/5 text-indigo-400 border border-indigo-500/10 rounded-lg text-xs font-bold shadow-sm">
                                        {item.industry}
                                    </span>
                                </td>
                                <td className="py-4 px-4 text-right">
                                    <button 
                                        onClick={() => handleRemove(item.ticker)}
                                        className="text-gray-700 hover:text-rose-500 p-2.5 bg-slate-800/0 hover:bg-rose-500/10 rounded-xl transition-all"
                                        title="移除分類"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {filteredItems.length === 0 && (
                    <div className="py-32 text-center flex flex-col items-center gap-4">
                        <div className="w-16 h-16 bg-slate-900 rounded-full flex items-center justify-center border border-slate-800">
                             <Search className="w-6 h-6 text-slate-700" />
                        </div>
                        <p className="text-gray-600 text-xs italic font-medium">找不到符合條件的分類資料</p>
                    </div>
                )}
            </div>
        </div>
        
        {/* Help Footer */}
        <div className="bg-slate-950/50 border border-slate-800 px-6 py-4 rounded-2xl flex items-center gap-4">
            <Info className="w-5 h-5 text-indigo-400 shrink-0" />
            <div className="space-y-1">
                <h5 className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">資料庫維護核心邏輯</h5>
                <p className="text-[10px] text-gray-500 leading-relaxed font-medium">
                    您的分類會直接影響單股分析頁中的 **Industry Strength (RS)** 計算。
                    <span className="text-gray-400 mx-1 underline">批次匯入</span> 功能支援您從 Excel 或 記事本 直接複製「代碼 名稱」清單進來快速對應。
                </p>
            </div>
        </div>
      </div>
    </div>
  );
}
