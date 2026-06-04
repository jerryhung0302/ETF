import React, { useState, useMemo, useEffect } from 'react';
import { Holding } from '../types';
import { Search, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';

interface HoldingsTableProps {
  holdings: Holding[];
  asOfDate: string;
  onSelectSymbol?: (symbol: string) => void;
  isLoading?: boolean;
  onSelectETF?: (etfSymbol: string) => void;
}

export const HoldingsTable: React.FC<HoldingsTableProps> = ({ holdings, asOfDate, onSelectSymbol, isLoading, onSelectETF }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [sortField, setSortField] = useState<keyof Holding>('weight');
  const [sortAscending, setSortAscending] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Real-time stock prices tracking states
  const [realtimePrices, setRealtimePrices] = useState<Record<string, { price: number; change_percent: number; status: string }>>({});
  const [isLoadingRealtime, setIsLoadingRealtime] = useState(false);
  const [lastRefreshed, setLastRefreshed] = useState<string>('');

  // Fetch real-time prices for current stock list
  useEffect(() => {
    if (holdings.length === 0) return;

    let isMounted = true;
    const fetchRealtimePrices = async () => {
      setIsLoadingRealtime(true);
      try {
        const symbolsStr = holdings.map(h => h.holding_symbol).join(',');
        const res = await fetch(`/api/realtime-prices?symbols=${encodeURIComponent(symbolsStr)}`);
        if (res.ok && isMounted) {
          const data = await res.json();
          setRealtimePrices(data);
          setLastRefreshed(new Date().toLocaleTimeString('zh-TW', { hour12: false }));
        }
      } catch (err) {
        console.error("Failed to query real-time quotes:", err);
      } finally {
        if (isMounted) {
          setIsLoadingRealtime(false);
        }
      }
    };

    fetchRealtimePrices();

    // Set polling interval every 30 seconds for active real-time updates
    const interval = setInterval(fetchRealtimePrices, 30000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [holdings]);

  // Search filter
  const filteredHoldings = useMemo(() => {
    return holdings.filter(h => 
      h.holding_symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
      h.holding_name.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [holdings, searchTerm]);

  // Sort logic
  const sortedHoldings = useMemo(() => {
    const list = [...filteredHoldings];
    list.sort((a, b) => {
      const aVal = a[sortField];
      const bVal = b[sortField];

      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;

      if (typeof aVal === 'number' && typeof bVal === 'number') {
        return sortAscending ? aVal - bVal : bVal - aVal;
      }
      return sortAscending 
        ? String(aVal).localeCompare(String(bVal))
        : String(bVal).localeCompare(String(aVal));
    });
    return list;
  }, [filteredHoldings, sortField, sortAscending]);

  // Pagination logic
  const paginatedHoldings = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedHoldings.slice(start, start + itemsPerPage);
  }, [sortedHoldings, currentPage]);

  const totalPages = Math.ceil(sortedHoldings.length / itemsPerPage) || 1;

  const toggleSort = (field: keyof Holding) => {
    if (sortField === field) {
      setSortAscending(!sortAscending);
    } else {
      setSortField(field);
      setSortAscending(false);
    }
    setCurrentPage(1);
  };

  const formatNumber = (num: number | null, decimals: number = 2) => {
    if (num === null || num === undefined) return '-';
    return num.toLocaleString('zh-TW', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  };

  return (
    <div className="space-y-4" id="holdings_table_container">
      {/* 獨立搜尋與即時統計控制面板 */}
      <div className="bg-[#000000]/40 rounded-sm border border-[#2A2A2E]/80 p-4 shadow-xl backdrop-blur-md" id="holdings_search_bar_panel">
        <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
          <div className="relative w-full lg:flex-1">
            <input
              type="text"
              placeholder="🔍 快速過濾成分股 / 輸入 ETF 作全球查詢 (輸入如 2330 / 台積電，或輸入 0050 按 Enter 載入)"
              className="w-full bg-[#161618] text-[#E0E0E0] placeholder-gray-600 text-sm pl-10 pr-12 py-2.5 rounded-sm border border-[#2A2A2E] focus:outline-none focus:border-[#D4AF37] focus:ring-1 focus:ring-[#D4AF37]/50 transition-all font-sans"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  const cleaned = searchTerm.toUpperCase().trim();
                  if (cleaned && onSelectETF) {
                    // Detect if the term conforms to standard stock pattern (digits and/or suffixes like .TW)
                    const isEtfSymbolPattern = /^[A-Z0-9.]+$/.test(cleaned) && cleaned.length >= 4 && cleaned.length <= 12;
                    if (isEtfSymbolPattern) {
                      onSelectETF(cleaned);
                      setSearchTerm('');
                    }
                  }
                }
              }}
              id="holding_search_input"
            />
            <Search className="absolute left-3.5 top-3 w-4 h-4 text-[#D4AF37]" />
            {searchTerm && (
              <button
                onClick={() => {
                  setSearchTerm('');
                  setCurrentPage(1);
                }}
                className="absolute right-3 top-2.5 text-[10px] text-gray-400 hover:text-white bg-[#2A2A2E] hover:bg-red-950 font-sans px-2 py-1 rounded transition-colors duration-150 cursor-pointer"
              >
                清除
              </button>
            )}
          </div>
          
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono w-full lg:w-auto justify-between lg:justify-end">
            <div className="flex items-center gap-2">
              <span className="text-gray-500 text-[11px]">熱門搜尋短語:</span>
              <button 
                onClick={() => { setSearchTerm('台積電'); setCurrentPage(1); }} 
                className="px-1.5 py-0.5 bg-[#161618] hover:bg-[#2A2A2E] text-gray-400 hover:text-[#D4AF37] transition-all rounded text-[10px]"
              >
                台積電
              </button>
              <button 
                onClick={() => { setSearchTerm('聯發科'); setCurrentPage(1); }} 
                className="px-1.5 py-0.5 bg-[#161618] hover:bg-[#2A2A2E] text-gray-400 hover:text-[#D4AF37] transition-all rounded text-[10px]"
              >
                聯發科
              </button>
            </div>
            
            <div className="h-4 w-[1px] bg-[#2A2A2E] hidden md:block"></div>
            
            <span className="text-gray-400">
              搜尋結果: <strong className="text-[#D4AF37] font-bold text-sm bg-[#D4AF37]/10 px-2.5 py-0.5 rounded border border-[#D4AF37]/20">{filteredHoldings.length}</strong> / {holdings.length} 檔
            </span>
          </div>
        </div>
      </div>

      <div className="bg-[#0D0D0F] rounded-sm border border-[#2A2A2E] overflow-hidden shadow-xl" id="holdings_table_wrapper">
        {/* Header section */}
        <div className="p-4 border-b border-[#2A2A2E] bg-[#161618]/60 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
          <div>
            <h3 className="font-serif font-semibold text-lg text-[#E0E0E0] flex flex-wrap items-center gap-2">
              成分股持有清單
              <span className="text-xs font-normal text-gray-500 font-mono">
                (as of {asOfDate ? asOfDate.replace(/-/g, '/') : '-'})
              </span>
              {isLoadingRealtime ? (
                <span className="text-[10px] text-[#D4AF37] font-mono animate-pulse bg-[#8A6D3B]/15 px-2 py-0.5 rounded border border-[#8A6D3B]/30 font-bold">
                  即時股價刷新中...
                </span>
              ) : lastRefreshed ? (
                <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-bold">
                  即時同步已就緒 ({lastRefreshed})
                </span>
              ) : null}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">顯示目前 ETF 最新抓取的權重及資金配置資訊，即時報價每 30 秒自動更新</p>
          </div>
        </div>

      {/* Table section */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm border-collapse" id="holdings_details_table">
          <thead>
            <tr className="border-b border-[#2A2A2E] bg-[#0D0D0F] text-xs font-medium text-gray-400 uppercase tracking-wider font-mono">
              <th className="py-3.5 px-4 text-center w-12 text-gray-500">#</th>
              <th className="py-3.5 px-4 cursor-pointer hover:bg-[#161618]/50" onClick={() => toggleSort('holding_symbol')}>
                <div className="flex items-center gap-1">代號 <ArrowUpDown className="w-3.5 h-3.5 text-[#D4AF37]" /></div>
              </th>
              <th className="py-3.5 px-4">名稱</th>
              <th className="py-3.5 px-4 cursor-pointer hover:bg-[#161618]/50 text-right" onClick={() => toggleSort('weight')}>
                <div className="flex items-center justify-end gap-1">今日權重 (%) <ArrowUpDown className="w-3.5 h-3.5 text-[#D4AF37]" /></div>
              </th>
              <th className="py-3.5 px-4 text-right">持有股數</th>
              <th className="py-3.5 px-4 text-right">市值 (TWD)</th>
              <th className="py-3.5 px-4 cursor-pointer hover:bg-[#161618]/50 text-right" onClick={() => toggleSort('current_price')}>
                <div className="flex items-center justify-end gap-1">收盤股價 <ArrowUpDown className="w-3.5 h-3.5 text-[#D4AF37]" /></div>
              </th>
              <th className="py-3.5 px-4 text-right text-gray-400">即時股價</th>
              <th className="py-3.5 px-4 text-right">每日漲跌 (%)</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2A2A2E]/60 font-sans">
            {isLoading ? (
              <tr>
                <td colSpan={9} className="py-12 text-center text-[#D4AF37] font-serif italic text-sm">
                  <div className="flex flex-col items-center gap-2 justify-center">
                    <div className="w-5 h-5 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin"></div>
                    <span className="text-gray-400 font-mono text-xs not-italic">正在即時獲取與解析此 ETF 最新成分股資料...</span>
                  </div>
                </td>
              </tr>
            ) : paginatedHoldings.length === 0 ? (
              <tr>
                <td colSpan={9} className="py-8 text-center text-gray-600 text-sm">
                  未找到符合條件的成分股資料
                </td>
              </tr>
            ) : (
              paginatedHoldings.map((h, i) => {
                const globalIndex = (currentPage - 1) * itemsPerPage + i + 1;
                const isPriceUp = (h.daily_change_percent || 0) >= 0;

                // Lookup real-time prices
                const rtInfo = realtimePrices[h.holding_symbol] || realtimePrices[h.holding_symbol.split('.')[0]];
                const hasRt = rtInfo && rtInfo.price !== 0;

                return (
                  <tr 
                    key={`${h.holding_symbol}-${i}`} 
                    className={`hover:bg-[#161618] transition-colors ${onSelectSymbol ? 'cursor-pointer' : ''}`}
                    onClick={() => {
                      if (onSelectSymbol) {
                        onSelectSymbol(h.holding_symbol);
                        // Optional scroll to the news section
                        const newsEl = document.getElementById('google_finance_news_panel');
                        if (newsEl) {
                          newsEl.scrollIntoView({ behavior: 'smooth' });
                        }
                      }
                    }}
                  >
                    <td className="py-3 px-4 text-center font-mono text-gray-600 font-semibold">{globalIndex}</td>
                    <td className="py-3 px-4 font-mono font-medium text-[#D4AF37]">
                      <div className="flex items-center gap-1.5 animate-fadeIn">
                        <a
                          href={`https://www.google.com/finance/beta/quote/${encodeURIComponent(String(h.holding_symbol).split('.')[0].trim())}:TPE?hl=zh-TW`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="hover:text-white hover:underline transition-all cursor-pointer"
                          title="另開視窗觀看 Google Finance 報價詳細"
                        >
                          {h.holding_symbol}
                        </a>
                        {onSelectSymbol && (
                          <span className="text-[9px] px-1 bg-[#8A6D3B]/20 text-[#D4AF37] border border-[#8A6D3B]/30 rounded tracking-tight">
                            新聞
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-semibold text-[#E0E0E0]">
                      <a
                        href={`https://www.google.com/finance/beta/quote/${encodeURIComponent(String(h.holding_symbol).split('.')[0].trim())}:TPE?hl=zh-TW`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="hover:text-[#D4AF37] hover:underline transition-all cursor-pointer"
                        title="另開視窗觀看 Google Finance 報價詳細"
                      >
                        {h.holding_name}
                      </a>
                    </td>
                    <td className="py-3 px-4 text-right text-white font-mono font-bold">
                      {h.weight !== null ? `${h.weight.toFixed(2)}%` : '-'}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-gray-400">{formatNumber(h.shares, 0)}</td>
                    <td className="py-3 px-4 text-right font-mono text-gray-400">{formatNumber(h.market_value, 0)}</td>
                    <td className="py-3 px-4 text-right font-mono text-gray-300">{formatNumber(h.current_price, 2)}</td>
                    
                    {/* Real-time price column with Taiwan color standard (red for rise, green for fall) */}
                    <td className="py-3 px-4 text-right font-mono">
                      {hasRt ? (
                        <div className="flex flex-col items-end justify-center leading-tight">
                          <span className="text-[#E0E0E0] font-bold text-sm">
                            {formatNumber(rtInfo.price, 2)}
                          </span>
                          <span className={`text-[10px] font-bold flex items-center gap-0.5 ${rtInfo.change_percent >= 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                            {rtInfo.change_percent >= 0 ? '▲' : '▼'}{Math.abs(rtInfo.change_percent).toFixed(2)}%
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-600 text-xs italic">-</span>
                      )}
                    </td>

                    <td className={`py-3 px-4 text-right font-mono font-medium ${isPriceUp ? 'text-rose-500' : 'text-emerald-500'}`}>
                      {h.daily_change_percent !== null 
                        ? `${isPriceUp ? '+' : ''}${h.daily_change_percent?.toFixed(2)}%`
                        : '-'
                      }
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      {totalPages > 1 && (
        <div className="p-3 border-t border-[#2A2A2E] flex justify-between items-center text-xs text-gray-500 font-mono bg-[#0D0D0F]">
          <span>
            共 {sortedHoldings.length} 項資料，第 {currentPage}/{totalPages} 頁
          </span>
          <div className="flex gap-1">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="p-1 px-2.5 bg-[#161618] border border-[#2A2A2E] rounded-sm text-gray-400 hover:text-[#D4AF37] disabled:opacity-30 transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="p-1 px-2.5 bg-[#161618] border border-[#2A2A2E] rounded-sm text-gray-400 hover:text-[#D4AF37] disabled:opacity-30 transition-colors"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
      </div>
    </div>
  );
};
