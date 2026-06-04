import React, { useState } from 'react';
import { Holding, ETFDiff } from '../types';
import { BarChart3, Scale, TrendingUp, Info } from 'lucide-react';

interface HoldingsChartProps {
  etfId: string;
  holdings: Holding[];
  diff: ETFDiff | null;
  isLoading?: boolean;
}

export const HoldingsChart: React.FC<HoldingsChartProps> = ({ etfId, holdings, diff, isLoading }) => {
  const [activeTab, setActiveTab] = useState<'weights' | 'changes'>('weights');

  // Filter top 10 holdings by weight
  const top10 = [...holdings]
    .sort((a, b) => (b.weight || 0) - (a.weight || 0))
    .slice(0, 10);

  const maxWeight = top10.length > 0 ? (top10[0].weight || 1) : 1;

  // Filter rebalances (weight changes)
  const changes = diff?.changed
    ? [...diff.changed]
        .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))
        .slice(0, 10)
    : [];

  const maxChange = changes.length > 0
    ? Math.max(...changes.map(c => Math.abs(c.diff)))
    : 1;

  const totalFundValue = holdings.reduce((sum, h) => sum + (h.market_value || 0), 0);

  return (
    <div className="bg-[#0D0D0F] rounded-sm border border-[#2A2A2E] p-5 shadow-xl font-sans" id="holdings_chart_wrapper">
      {/* Chart Headers */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[#2A2A2E] pb-4 mb-5">
        <div>
          <h3 className="font-serif font-semibold text-lg text-[#E0E0E0] flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-[#D4AF37]" />
            <span>數據視覺化儀表板</span>
            <span className="text-xs font-mono font-normal text-gray-500 uppercase tracking-wider bg-[#161618] px-2 py-0.5 border border-[#2A2A2E] rounded-sm">
              {etfId}
            </span>
          </h3>
          <p className="text-xs text-gray-500 mt-0.5">即時分析前十大持股比重分配與近期成分股重新平衡變動</p>
        </div>

        {/* Tab selection */}
        <div className="flex bg-[#161618] p-0.5 border border-[#2A2A2E] rounded-sm shrink-0 self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('weights')}
            className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'weights'
                ? 'bg-[#8A6D3B]/20 border border-[#8A6D3B]/40 text-[#D4AF37]'
                : 'text-gray-400 hover:text-zinc-200 border border-transparent'
            }`}
          >
            <TrendingUp className="w-3.5 h-3.5" />
            權重佔比 TOP 10
          </button>
          <button
            onClick={() => {
              if (!diff) {
                alert("尚未計算今日異動分析！請先執行單獨同步或一鍵同步。");
                return;
              }
              setActiveTab('changes');
            }}
            disabled={!diff || changes.length === 0}
            className={`px-3 py-1.5 text-xs font-medium rounded-sm transition-all flex items-center gap-1.5 ${
              !diff || changes.length === 0
                ? 'opacity-30 cursor-not-allowed text-gray-600'
                : 'cursor-pointer'
            } ${
              activeTab === 'changes'
                ? 'bg-[#8A6D3B]/20 border border-[#8A6D3B]/40 text-[#D4AF37]'
                : 'text-gray-400 hover:text-zinc-200 border border-transparent'
            }`}
          >
            <Scale className="w-3.5 h-3.5" />
            權重異動 ({changes.length})
          </button>
        </div>
      </div>

      {activeTab === 'weights' ? (
        <div className="space-y-4">
          {/* Metadata banner */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 bg-[#161618]/40 border border-[#2A2A2E]/60 p-3 rounded-sm mb-2 text-xs">
            <div>
              <span className="text-gray-500 font-mono block">監控標的</span>
              <span className="text-gray-200 font-bold">{etfId}</span>
            </div>
            <div>
              <span className="text-gray-500 font-mono block">追蹤總檔數</span>
              <span className="text-gray-200 font-bold">{holdings.length} 檔成分股</span>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <span className="text-gray-500 font-mono block">估計成分市值</span>
              <span className="text-[#D4AF37] font-mono font-bold">
                {totalFundValue > 0 ? `NT$ ${totalFundValue.toLocaleString('zh-TW', { maximumFractionDigits: 0 })}` : '隨成分異動中'}
              </span>
            </div>
          </div>

          {/* Bar Chart list */}
          <div className="space-y-3.5">
            {isLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2">
                <div className="w-5 h-5 border-2 border-[#D4AF37] border-t-transparent rounded-full animate-spin"></div>
                <span className="text-gray-500 text-xs font-mono">載入權重佔比圖表中...</span>
              </div>
            ) : top10.length === 0 ? (
              <div className="py-10 text-center text-gray-500 text-xs italic">
                尚無持股資料，請點擊同步按鈕載入。
              </div>
            ) : (
              top10.map((h, index) => {
                const ratio = ((h.weight || 0) / maxWeight) * 100;
                return (
                  <div key={h.holding_symbol} className="space-y-1 group">
                    <div className="flex justify-between items-baseline text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] w-4 text-gray-500 font-bold text-center">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <a
                          href={`https://www.google.com/finance/beta/quote/${encodeURIComponent(String(h.holding_symbol).split('.')[0].trim())}:TPE?hl=zh-TW`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-[#D4AF37] font-semibold bg-[#161618] px-1.5 py-0.5 border border-[#2A2A2E] rounded-sm text-[10px] hover:text-white hover:bg-[#D4AF37]/20 transition-all cursor-pointer"
                          title="另開視窗觀看 Google Finance 報價詳細"
                        >
                          {h.holding_symbol}
                        </a>
                        <a
                          href={`https://www.google.com/finance/beta/quote/${encodeURIComponent(String(h.holding_symbol).split('.')[0].trim())}:TPE?hl=zh-TW`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-gray-200 font-semibold truncate hover:text-[#D4AF37] hover:underline transition-colors cursor-pointer"
                          title="另開視窗觀看 Google Finance 報價詳細"
                        >
                          {h.holding_name}
                        </a>
                      </div>
                      <div className="flex items-center gap-3">
                        {h.market_value ? (
                          <span className="font-mono text-[10px] text-gray-500 hidden md:inline">
                            估 NT$ {Math.round(h.market_value / 1000000).toLocaleString()}M
                          </span>
                        ) : null}
                        <span className="font-mono font-black text-gray-100 group-hover:text-[#D4AF37] transition-colors">
                          {h.weight !== null ? `${h.weight.toFixed(2)}%` : '-'}
                        </span>
                      </div>
                    </div>
                    {/* Progress Track */}
                    <div className="w-full bg-[#161618] h-2.5 rounded-sm overflow-hidden border border-[#2A2A2E]/50">
                      <div
                        className="bg-gradient-to-r from-[#8A6D3B] to-[#D4AF37] h-full transition-all duration-700 ease-out rounded-sm"
                        style={{ width: `${ratio}%` }}
                      ></div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="flex items-center gap-1.5 text-[10px] text-gray-500 mt-4 leading-relaxed font-mono">
            <Info className="w-3.5 h-3.5 text-[#8A6D3B]" />
            <span>前十大成分股約佔整體資金分配比重 {top10.reduce((sum, h) => sum + (h.weight || 0), 0).toFixed(2)}%。</span>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-[#161618]/30 border border-[#2A2A2E]/60 p-3 rounded-sm mb-2 text-xs">
            <span className="text-gray-500 font-serif italic block">成分股重平衡變動分析 (成員佔比重配調幅排行)</span>
            <span className="text-gray-300 font-light mt-0.5 block">
              本視圖顯示今日最新權重與昨日快照的誤差波動 (以下單位為百分點 %)。
            </span>
          </div>

          <div className="space-y-4">
            {changes.map((c, index) => {
              const isUp = c.diff >= 0;
              const absDiff = Math.abs(c.diff);
              const barWidth = (absDiff / maxChange) * 100;

              return (
                <div key={c.symbol} className="space-y-1">
                  <div className="flex justify-between items-baseline text-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono text-[10px] text-gray-500">{index + 1}.</span>
                      <a
                        href={`https://www.google.com/finance/beta/quote/${encodeURIComponent(String(c.symbol).split('.')[0].trim())}:TPE?hl=zh-TW`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-[#D4AF37] font-semibold hover:text-white hover:underline transition-colors cursor-pointer"
                        title="另開視窗觀看 Google Finance 報價詳細"
                      >
                        {c.symbol}
                      </a>
                      <a
                        href={`https://www.google.com/finance/beta/quote/${encodeURIComponent(String(c.symbol).split('.')[0].trim())}:TPE?hl=zh-TW`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-gray-300 font-medium truncate max-w-[120px] sm:max-w-none hover:text-[#D4AF37] hover:underline transition-colors cursor-pointer"
                        title="另開視窗觀看 Google Finance 報價詳細"
                      >
                        {c.name}
                      </a>
                    </div>
                    <div className="flex items-center gap-1.5 font-mono">
                      <span className="text-gray-500 text-[10px]">({c.oldWeight?.toFixed(2)}% → {c.newWeight?.toFixed(2)}%)</span>
                      <span className={`font-bold ${isUp ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {isUp ? '▲' : '▼'} {isUp ? '+' : ''}{c.diff.toFixed(2)}%
                      </span>
                    </div>
                  </div>

                  {/* Dual Divergence track bar */}
                  <div className="w-full h-3 flex items-center relative gap-[1px]">
                    {/* Left half: Negative Changes */}
                    <div className="w-1/2 bg-[#161618]/20 h-2 flex justify-end">
                      {!isUp && (
                        <div 
                          className="bg-emerald-500 h-full rounded-sm transition-all duration-700 ease-out" 
                          style={{ width: `${barWidth}%` }}
                        ></div>
                      )}
                    </div>
                    {/* Divider line */}
                    <div className="w-[1px] h-3.5 bg-[#4c4c52] z-10 shrink-0"></div>
                    {/* Right half: Positive Changes */}
                    <div className="w-1/2 bg-[#161618]/20 h-2 flex justify-start">
                      {isUp && (
                        <div 
                          className="bg-[#D4AF37] h-full rounded-sm transition-all duration-700 ease-out" 
                          style={{ width: `${barWidth}%` }}
                        ></div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="text-[10px] text-gray-500 border-t border-[#2A2A2E] pt-3 flex items-center gap-3">
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-[#D4AF37] rounded-sm"></span>
              權重增加 (金流調入偏多)
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2 h-2 bg-emerald-500 rounded-sm"></span>
              權重減少 (金流調出偏空)
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
