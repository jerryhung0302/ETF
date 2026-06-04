import React, { useState, useEffect } from 'react';
import { Newspaper, RotateCw, ExternalLink, Search, Flame, ArrowUpRight } from 'lucide-react';

export interface NewsItem {
  title: string;
  url: string;
  source: string;
  time: string;
}

interface FinanceNewsViewerProps {
  selectedSymbol: string;
  onSymbolChange?: (symbol: string) => void;
  trackedList: string[];
}

export const FinanceNewsViewer: React.FC<FinanceNewsViewerProps> = ({
  selectedSymbol,
  onSymbolChange,
  trackedList,
}) => {
  const [news, setNews] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newsSearchTerm, setNewsSearchTerm] = useState('');
  const [customSymbol, setCustomSymbol] = useState('');
  const [activeQuery, setActiveQuery] = useState(selectedSymbol);

  // Fetch news for the active query
  const fetchNews = async (targetSymbol: string) => {
    if (!targetSymbol) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/stock-news?symbol=${encodeURIComponent(targetSymbol)}`);
      if (!res.ok) {
        throw new Error(`伺服器回傳狀態碼 ${res.status}`);
      }
      const data = await res.json();
      setNews(data.news || []);
    } catch (err: any) {
      console.error("Failed to load Google Finance news:", err);
      setError(err.message || "讀取 Google Finance 相關新聞失敗");
    } finally {
      setLoading(false);
    }
  };

  // Sync with selectedSymbol from parent
  useEffect(() => {
    if (selectedSymbol) {
      setActiveQuery(selectedSymbol);
      fetchNews(selectedSymbol);
    }
  }, [selectedSymbol]);

  const handleSearchCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const query = customSymbol.trim().toUpperCase();
    if (!query) return;
    
    // Auto-append .TW if it looks like a Taiwan 4-digit stock symbol
    let finalQuery = query;
    if (/^\d{4}$/.test(query)) {
      finalQuery = `${query}.TW`;
    }

    setActiveQuery(finalQuery);
    if (onSymbolChange) {
      onSymbolChange(finalQuery);
    } else {
      fetchNews(finalQuery);
    }
  };

  const handleQuickTap = (sym: string) => {
    setActiveQuery(sym);
    if (onSymbolChange) {
      onSymbolChange(sym);
    } else {
      fetchNews(sym);
    }
  };

  // Filter news items
  const filteredNews = news.filter(item => {
    const s = newsSearchTerm.toLowerCase();
    return (
      item.title.toLowerCase().includes(s) ||
      item.source.toLowerCase().includes(s)
    );
  });

  return (
    <div className="bg-[#0D0D0F] rounded-sm border border-[#2A2A2E] p-5 shadow-xl space-y-4" id="google_finance_news_panel">
      {/* Header section */}
      <div className="border-b border-[#2A2A2E] pb-3 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h4 className="font-serif font-semibold text-lg text-[#E0E0E0] flex items-center gap-2">
            <Newspaper className="w-5 h-5 text-[#D4AF37]" />
            Google Finance 即時追蹤 • 近一週相關新聞
          </h4>
          <p className="text-xs text-gray-500 mt-1">
            自動採集最新一週有關監控標的、成分板塊、或熱門個股之新聞輿情與市場紀律
          </p>
        </div>

        <button
          onClick={() => fetchNews(activeQuery)}
          disabled={loading}
          className="px-3 py-1.5 bg-[#161618] hover:bg-[#2A2A2E] text-xs font-semibold text-[#D4AF37] rounded-sm border border-[#2A2A2E] flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
        >
          <RotateCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
          刷新輿情
        </button>
      </div>

      {/* Query Selector bar & custom search */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-center">
        {/* Quick Taps for tracked list */}
        <div className="md:col-span-8 flex flex-wrap gap-1.5 items-center">
          <span className="text-xs text-gray-500 font-mono flex items-center gap-1 mr-1">
            <Flame className="w-3 h-3 text-[#D4AF37]" /> 快捷標的:
          </span>
          {trackedList.map(item => {
            const isCurrent = activeQuery === item;
            return (
              <button
                key={item}
                onClick={() => handleQuickTap(item)}
                className={`px-2.5 py-1 text-xs font-mono rounded-sm transition-all border cursor-pointer ${
                  isCurrent
                    ? 'bg-[#8A6D3B]/20 border-[#D4AF37] text-[#D4AF37] font-bold'
                    : 'bg-[#161618] border-[#2A2A2E] text-gray-400 hover:text-white hover:border-gray-500'
                }`}
              >
                {item}
              </button>
            );
          })}
        </div>

        {/* Custom target input search bar */}
        <form onSubmit={handleSearchCustom} className="md:col-span-4 flex gap-1.5">
          <input
            type="text"
            placeholder="輸入其他股號 (如: 2330)"
            value={customSymbol}
            onChange={(e) => setCustomSymbol(e.target.value)}
            className="flex-1 bg-[#161618] text-[#E0E0E0] placeholder-gray-600 text-xs px-3 py-1.5 rounded-sm border border-[#2A2A2E] focus:outline-none focus:border-[#D4AF37] transition-all font-mono"
          />
          <button
            type="submit"
            className="px-3 py-1.5 bg-[#8A6D3B] hover:bg-[#A68852] font-semibold text-xs text-black rounded-sm transition-all cursor-pointer font-mono"
          >
            查詢新聞
          </button>
        </form>
      </div>

      {/* Local Filter for loaded news list */}
      {news.length > 0 && (
        <div className="relative w-full sm:w-80">
          <input
            type="text"
            placeholder="此清單內過濾關鍵字..."
            value={newsSearchTerm}
            onChange={(e) => setNewsSearchTerm(e.target.value)}
            className="w-full bg-[#111113] text-[#E0E0E0] placeholder-gray-600 text-xs pl-8 pr-4 py-1.5 rounded-sm border border-[#212124] focus:outline-none focus:border-gray-500 transition-all"
          />
          <Search className="absolute left-2.5 top-2.5 text-gray-600 w-3 h-3" />
        </div>
      )}

      {/* News Listings Container */}
      <div className="pt-1">
        {loading ? (
          <div className="py-12 text-center text-sm font-serif italic text-gray-500 flex flex-col items-center justify-center gap-2">
            <RotateCw className="w-5 h-5 animate-spin text-[#D4AF37]" />
            正在從 Google Finance 爬網最新即時消息...
          </div>
        ) : error ? (
          <div className="p-4 rounded bg-rose-500/5 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
            <span>⚠️</span>
            <span>{error}</span>
          </div>
        ) : filteredNews.length === 0 ? (
          <div className="py-8 text-center text-xs text-gray-500 italic">
            {news.length > 0 ? "沒有符合該關鍵字的過濾新聞。" : `無 [${activeQuery}] 之相關新聞。您可在上方快捷標的或直接輸入股號查詢。`}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {filteredNews.map((item, idx) => {
              // Ensure correct relative target URL if it's relative
              const href = item.url.startsWith("/") ? `https://www.google.com/finance${item.url}` : item.url;
              return (
                <a
                  key={idx}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group block p-3 bg-[#111113] hover:bg-[#161618] border border-[#1D1D20] hover:border-[#8A6D3B]/40 rounded-sm transition-all duration-200"
                >
                  <div className="flex justify-between items-start gap-2">
                    <h5 className="text-[13px] font-semibold text-gray-300 group-hover:text-[#D4AF37] leading-relaxed line-clamp-2 transition-colors">
                      {item.title}
                    </h5>
                    <ArrowUpRight className="w-3.5 h-3.5 text-gray-650 group-hover:text-[#D4AF37] transition-colors shrink-0 mt-0.5" />
                  </div>
                  
                  <div className="mt-3 flex items-center justify-between text-[11px] font-mono text-gray-500">
                    <span className="bg-[#1D1D20] px-1.5 py-0.5 rounded text-gray-400">
                      {item.source}
                    </span>
                    <span>{item.time}</span>
                  </div>
                </a>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Footer metadata explanation */}
      <div className="text-[10px] text-gray-550 border-t border-[#1D1D20] pt-2 font-mono flex flex-col sm:flex-row justify-between gap-1">
        <span>* 新聞來源取自 Google 引導之即時公開揭露，排序隨市場時間遞移。</span>
        <a 
          href={`https://www.google.com/finance/quote/${activeQuery.replace('.TW', ':TPE')}`} 
          target="_blank" 
          rel="noreferrer" 
          className="text-gray-500 hover:text-[#D4AF37] flex items-center gap-0.5 underline transition-all"
        >
          在 Google Finance 網站上開啟 <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </div>
    </div>
  );
};
