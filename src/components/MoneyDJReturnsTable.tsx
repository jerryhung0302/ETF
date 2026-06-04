import React, { useState, useMemo } from 'react';
import { Search, RotateCw, CheckCircle, ExternalLink, ArrowUpDown, ChevronLeft, ChevronRight } from 'lucide-react';

export interface MoneyDJReturnItem {
  rank: number;
  symbol: string;
  name: string;
  date: string;
  currency: string;
  return_1d: string;
  return_1w: string;
  return_ytd: string;
  return_1m: string;
  return_3m: string;
  return_6m: string;
  return_1y: string;
  return_3y: string;
}

interface MoneyDJReturnsTableProps {
  data: MoneyDJReturnItem[];
  isLoading: boolean;
  lastUpdated: string;
  onRefresh: () => Promise<void>;
  hasSheetId: boolean;
  isSheetSynced: boolean;
}

export const MoneyDJReturnsTable: React.FC<MoneyDJReturnsTableProps> = ({
  data,
  isLoading,
  lastUpdated,
  onRefresh,
  hasSheetId,
  isSheetSynced,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;
  const [sortField, setSortField] = useState<string>('rank');
  const [sortAsc, setSortAsc] = useState<boolean>(true);

  // Helper inside cells to paint red/green for Taiwan standard
  const renderTrendValue = (val: string) => {
    if (!val || val === '-' || val === 'N/A') return <span className="text-gray-500 font-mono text-xs">-</span>;
    const num = parseFloat(val);
    if (isNaN(num)) return <span className="text-gray-400 font-mono text-xs">{val}</span>;
    
    const isUp = num >= 0;
    return (
      <span className={`font-mono text-xs font-bold ${isUp ? 'text-rose-500' : 'text-emerald-500'}`}>
        {isUp ? `+${num.toFixed(2)}%` : `${num.toFixed(2)}%`}
      </span>
    );
  };

  // Toggle column sorting
  const handleSort = (field: string) => {
    if (sortField === field) {
      setSortAsc(!sortAsc);
    } else {
      setSortField(field);
      setSortAsc(true);
    }
    setCurrentPage(1);
  };

  // Filter items
  const filteredData = useMemo(() => {
    return data.filter(item => {
      const s = searchTerm.toLowerCase().trim();
      if (!s) return true;
      return (
        item.symbol.toString().toLowerCase().includes(s) ||
        item.name.toLowerCase().includes(s) ||
        (item.currency && item.currency.toLowerCase().includes(s))
      );
    });
  }, [data, searchTerm]);

  // Sort items
  const sortedData = useMemo(() => {
    return [...filteredData].sort((a: any, b: any) => {
      let aVal = a[sortField];
      let bVal = b[sortField];

      // Parse float values for performance columns
      if (sortField.startsWith('return_') || sortField === 'rank') {
        const aNum = parseFloat(aVal);
        const bNum = parseFloat(bVal);
        aVal = isNaN(aNum) ? (sortAsc ? Infinity : -Infinity) : aNum;
        bVal = isNaN(bNum) ? (sortAsc ? Infinity : -Infinity) : bNum;
      } else {
        aVal = String(aVal);
        bVal = String(bVal);
      }

      if (aVal < bVal) return sortAsc ? -1 : 1;
      if (aVal > bVal) return sortAsc ? 1 : -1;
      return 0;
    });
  }, [filteredData, sortField, sortAsc]);

  // Pagination bounds
  const totalPages = Math.max(Math.ceil(sortedData.length / itemsPerPage), 1);
  const paginatedData = useMemo(() => {
    const startIdx = (currentPage - 1) * itemsPerPage;
    return sortedData.slice(startIdx, startIdx + itemsPerPage);
  }, [sortedData, currentPage]);

  return (
    <div className="bg-[#0D0D0F] rounded-sm border border-[#2A2A2E] overflow-hidden shadow-xl" id="moneydj_returns_section">
      {/* Container header and info details */}
      <div className="p-4 border-b border-[#2A2A2E] bg-[#161618]/60 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h3 className="font-serif font-semibold text-lg text-[#E0E0E0] flex flex-wrap items-center gap-2">
            MoneyDJ 台灣熱門 ETF 各期間報酬率排行
            <span className="text-[10px] text-[#D4AF37] font-mono bg-[#8A6D3B]/10 border border-[#8A6D3B]/20 px-2 py-0.5 rounded font-bold uppercase tracking-wider">
              1W 漲幅排序
            </span>
            {isSheetSynced && hasSheetId && (
              <span className="text-[10px] text-emerald-400 font-mono bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20 font-bold flex items-center gap-1">
                <CheckCircle className="w-3 h-3 text-emerald-400" /> 雲端同步中
              </span>
            )}
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">
            自動串接 MoneyDJ 每日數據檔，追蹤熱門 ETF 在一日、一週、一月、三月、六月、一年等完整期間報酬率排行
          </p>
        </div>

        <div className="flex gap-2 w-full md:w-auto">
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="px-3.5 py-1.5 bg-[#161618] hover:bg-[#2A2A2E] text-xs font-semibold text-[#D4AF37] rounded-sm border border-[#2A2A2E] hover:border-[#D4AF37]/30 transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
          >
            <RotateCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            更新 MoneyDJ 報酬率
          </button>
          
          <a
            href="https://www.moneydj.com/ETF/X/Rank/Rank0001.xdjhtm?eRank=up&eOrd=T800520&ePeriod=1W"
            target="_blank"
            rel="noreferrer"
            className="px-3 py-1.5 bg-[#161618] hover:bg-neutral-800 text-xs text-gray-400 hover:text-white rounded-sm border border-[#2A2A2E] transition-all flex items-center gap-1"
            title="開新視窗檢視 MoneyDJ 原始網站"
          >
            <ExternalLink className="w-3 h-3" />
            MoneyDJ 官網
          </a>
        </div>
      </div>

      {/* Control row with instant search and status description */}
      <div className="p-4 bg-[#111113]/40 border-b border-[#2A2A2E] flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="relative w-full sm:w-72">
          <input
            type="text"
            placeholder="過濾 MoneyDJ 排行... (代碼/名稱)"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentPage(1);
            }}
            className="w-full bg-[#161618] text-[#E0E0E0] placeholder-gray-600 text-xs pl-8 pr-4 py-2 rounded-sm border border-[#2A2A2E] focus:outline-none focus:border-[#D4AF37] transition-all"
          />
          <Search className="absolute left-2.5 top-2.5 text-gray-650 w-3.5 h-3.5 text-[#D4AF37]/70" />
        </div>

        <div className="text-xs text-gray-500 font-mono">
          {lastUpdated ? (
            <span>最後抓取時間：<strong className="text-gray-300">{lastUpdated}</strong> 台北時間 14:00 自動刷新</span>
          ) : (
            <span>尚未抓取今日資料，請點擊右上方按鈕立即更新</span>
          )}
        </div>
      </div>

      {/* Renders Table view */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#161618]/85 text-gray-400 text-[11px] font-mono border-b border-[#2A2A2E] uppercase font-bold tracking-wider">
              <th className="py-3 px-4 text-center cursor-pointer hover:bg-[#161618]" onClick={() => handleSort('rank')}>
                <div className="flex items-center justify-center gap-0.5">排名 <ArrowUpDown className="w-3 h-3" /></div>
              </th>
              <th className="py-3 px-3 cursor-pointer hover:bg-[#161618]" onClick={() => handleSort('symbol')}>
                <div className="flex items-center gap-0.5">代碼 <ArrowUpDown className="w-3 h-3" /></div>
              </th>
              <th className="py-3 px-4 cursor-pointer hover:bg-[#161618]" onClick={() => handleSort('name')}>
                <div className="flex items-center gap-0.5">ETF 名稱 <ArrowUpDown className="w-3 h-3" /></div>
              </th>
              <th className="py-3 px-3 text-center cursor-pointer hover:bg-[#161618]" onClick={() => handleSort('date')}>
                <div className="flex items-center justify-center gap-0.5">日期 <ArrowUpDown className="w-3 h-3" /></div>
              </th>
              <th className="py-3 px-3 text-right cursor-pointer hover:bg-[#161618]" onClick={() => handleSort('return_1d')}>
                <div className="flex items-center justify-end gap-0.5">一日 <ArrowUpDown className="w-3 h-3" /></div>
              </th>
              <th className="py-3 px-3 text-right cursor-pointer hover:bg-[#161618]" onClick={() => handleSort('return_1w')}>
                <div className="flex items-center justify-end gap-0.5">一週 <ArrowUpDown className="w-3 h-3" /></div>
              </th>
              <th className="py-3 px-3 text-right cursor-pointer hover:bg-[#161618]" onClick={() => handleSort('return_ytd')}>
                <div className="flex items-center justify-end gap-0.5">今年以來 <ArrowUpDown className="w-3 h-3" /></div>
              </th>
              <th className="py-3 px-3 text-right cursor-pointer hover:bg-[#161618]" onClick={() => handleSort('return_1m')}>
                <div className="flex items-center justify-end gap-0.5">一個月 <ArrowUpDown className="w-3 h-3" /></div>
              </th>
              <th className="py-3 px-3 text-right cursor-pointer hover:bg-[#161618]" onClick={() => handleSort('return_3m')}>
                <div className="flex items-center justify-end gap-0.5">三個月 <ArrowUpDown className="w-3 h-3" /></div>
              </th>
              <th className="py-3 px-3 text-right cursor-pointer hover:bg-[#161618]" onClick={() => handleSort('return_6m')}>
                <div className="flex items-center justify-end gap-0.5">六個月 <ArrowUpDown className="w-3 h-3" /></div>
              </th>
              <th className="py-3 px-3 text-right cursor-pointer hover:bg-[#161618]" onClick={() => handleSort('return_1y')}>
                <div className="flex items-center justify-end gap-0.5">一年 <ArrowUpDown className="w-3 h-3" /></div>
              </th>
              <th className="py-3 px-3 text-right cursor-pointer hover:bg-[#161618]" onClick={() => handleSort('return_3y')}>
                <div className="flex items-center justify-end gap-0.5">三年 <ArrowUpDown className="w-3 h-3" /></div>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1D1D20]">
            {isLoading ? (
              <tr>
                <td colSpan={12} className="py-12 text-center text-[#D4AF37] font-serif italic text-sm">
                  <div className="flex flex-col items-center gap-2 justify-center">
                    <RotateCw className="w-6 h-6 animate-spin text-[#D4AF37]" />
                    <span>正在獲取 MoneyDJ 實時期間回報與漲跌排名檔案...</span>
                  </div>
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={12} className="py-8 text-center text-gray-600 text-sm">
                  未找到符合過濾條件的 ETF 報酬資料
                </td>
              </tr>
            ) : (
              paginatedData.map((item, idx) => (
                <tr key={`${item.symbol}-${idx}`} className="hover:bg-[#161618]/40 transition-colors">
                  <td className="py-3 px-4 text-center font-mono text-[#D4AF37] font-bold text-xs">{item.rank}</td>
                  <td className="py-3 px-3 font-mono text-xs font-semibold">
                    <a
                      href={`https://www.google.com/finance/beta/quote/${encodeURIComponent(String(item.symbol).split('.')[0].trim())}:TPE?hl=zh-TW`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[#D4AF37] hover:text-white hover:underline transition-colors cursor-pointer flex items-center gap-1"
                      title="另開視窗觀看 Google Finance 報價詳細"
                    >
                      {item.symbol}
                      <ExternalLink className="w-2.5 h-2.5 opacity-40 hover:opacity-100" />
                    </a>
                  </td>
                  <td className="py-3 px-4 text-gray-200 text-xs truncate max-w-[120px]" title={item.name}>
                    <a
                      href={`https://www.google.com/finance/beta/quote/${encodeURIComponent(String(item.symbol).split('.')[0].trim())}:TPE?hl=zh-TW`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:text-[#D4AF37] hover:underline transition-colors cursor-pointer block truncate"
                      title={item.name}
                    >
                      {item.name}
                    </a>
                  </td>
                  <td className="py-3 px-3 text-center font-mono text-gray-500 text-[10px]">{item.date}</td>
                  <td className="py-3 px-3 text-right">{renderTrendValue(item.return_1d)}</td>
                  <td className="py-3 px-3 text-right">{renderTrendValue(item.return_1w)}</td>
                  <td className="py-3 px-3 text-right">{renderTrendValue(item.return_ytd)}</td>
                  <td className="py-3 px-3 text-right">{renderTrendValue(item.return_1m)}</td>
                  <td className="py-3 px-3 text-right">{renderTrendValue(item.return_3m)}</td>
                  <td className="py-3 px-3 text-right">{renderTrendValue(item.return_6m)}</td>
                  <td className="py-3 px-3 text-right">{renderTrendValue(item.return_1y)}</td>
                  <td className="py-3 px-3 text-right">{renderTrendValue(item.return_3y)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Table Pagination row controls */}
      {totalPages > 1 && !isLoading && (
        <div className="p-4 border-t border-[#2A2A2E] bg-[#111113]/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-gray-500 font-mono">
          <div>
            顯示第 <span className="text-gray-300">{(currentPage - 1) * itemsPerPage + 1}</span> 至{' '}
            <span className="text-gray-300">
              {Math.min(currentPage * itemsPerPage, filteredData.length)}
            </span>{' '}
            筆，共 <span className="text-[#D4AF37] font-bold">{filteredData.length}</span> 筆記錄
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
              disabled={currentPage === 1}
              className="p-1.5 rounded bg-[#161618] hover:bg-[#2A2A2E] text-gray-400 hover:text-white border border-[#2A2A2E] disabled:opacity-30 disabled:hover:text-gray-400 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-3 py-1 bg-[#161618] text-[#D4AF37] border border-[#2A2A2E] rounded font-bold text-center">
              {currentPage} / {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
              disabled={currentPage === totalPages}
              className="p-1.5 rounded bg-[#161618] hover:bg-[#2A2A2E] text-gray-400 hover:text-white border border-[#2A2A2E] disabled:opacity-30 disabled:hover:text-gray-400 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
