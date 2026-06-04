import React from 'react';
import { ETFDiff } from '../types';
import { PlusCircle, MinusCircle, Scaling, HelpCircle, ArrowRight } from 'lucide-react';

interface DiffViewerProps {
  diff: ETFDiff | null;
}

export const DiffViewer: React.FC<DiffViewerProps> = ({ diff }) => {
  if (!diff) {
    return (
      <div className="bg-[#0D0D0F] rounded-sm border border-[#2A2A2E] p-8 text-center text-gray-500 font-sans" id="no_diff_placeholder">
        <HelpCircle className="w-10 h-10 mx-auto mb-2 text-[#8A6D3B]/60" />
        <p className="text-sm">尚未計算異動分析。請點擊上方 [一鍵同步全名單] 或下方 [單獨抓取] 執行比對分析。</p>
      </div>
    );
  }

  const hasChanges = diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0;

  return (
    <div className="space-y-4 font-sans" id="diff_viewer_container">
      {/* Overview Stat cards */}
      <div className="grid grid-cols-3 gap-2 md:grid-cols-3">
        <div className="bg-[#0D0D0F] border border-[#2A2A2E] p-4 rounded-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-widest font-mono">新增成分股</span>
            <p className="text-xl md:text-2xl font-serif italic font-bold text-emerald-400 mt-0.5">{diff.added.length}</p>
          </div>
          <PlusCircle className="text-emerald-500 w-5 h-5 opacity-60" />
        </div>

        <div className="bg-[#0D0D0F] border border-[#2A2A2E] p-4 rounded-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] text-rose-400 font-bold uppercase tracking-widest font-mono">刪除成分股</span>
            <p className="text-xl md:text-2xl font-serif italic font-bold text-rose-400 mt-0.5">{diff.removed.length}</p>
          </div>
          <MinusCircle className="text-rose-500 w-5 h-5 opacity-60" />
        </div>

        <div className="bg-[#0D0D0F] border border-[#2A2A2E] p-4 rounded-sm flex items-center justify-between">
          <div>
            <span className="text-[10px] text-[#D4AF37] font-bold uppercase tracking-widest font-mono">權重異動</span>
            <p className="text-xl md:text-2xl font-serif italic font-bold text-[#D4AF37] mt-0.5">{diff.changed.length}</p>
          </div>
          <Scaling className="text-[#D4AF37] w-5 h-5 opacity-60" />
        </div>
      </div>

      {!hasChanges ? (
        <div className="bg-[#0D0D0F] border border-[#2A2A2E] rounded-sm p-6 text-center text-[#D4AF37] text-sm font-sans flex items-center justify-center gap-2">
          <span>🎉 今日成分股無任何新增/刪除或權重變動，比例完美同步！</span>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Additions List */}
          <div className="bg-[#0D0D0F] rounded-sm border border-[#2A2A2E] p-4">
            <h4 className="text-xs text-emerald-400 font-bold flex items-center gap-1.5 uppercase font-mono tracking-wider mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
              新增成分股 ({diff.added.length})
            </h4>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {diff.added.length === 0 ? (
                <p className="text-xs text-gray-500 py-3">無新增項目</p>
              ) : (
                diff.added.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-[#13231e]/40 border border-[#2A2A2E] p-2 rounded-sm text-xs">
                    <div>
                      <p className="font-semibold text-gray-200">{item.holding_name}</p>
                      <p className="font-mono text-[10px] text-gray-500">{item.holding_symbol}</p>
                    </div>
                    <span className="font-mono font-extrabold text-emerald-400">+{item.weight?.toFixed(2)}%</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Deletions List */}
          <div className="bg-[#0D0D0F] rounded-sm border border-[#2A2A2E] p-4">
            <h4 className="text-xs text-rose-400 font-bold flex items-center gap-1.5 uppercase font-mono tracking-wider mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span>
              刪除成分股 ({diff.removed.length})
            </h4>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {diff.removed.length === 0 ? (
                <p className="text-xs text-gray-500 py-3">無刪除項目</p>
              ) : (
                diff.removed.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center bg-[#25171d]/40 border border-[#2A2A2E] p-2 rounded-sm text-xs">
                    <div>
                      <p className="font-semibold text-gray-200">{item.holding_name}</p>
                      <p className="font-mono text-[10px] text-gray-500">{item.holding_symbol}</p>
                    </div>
                    <span className="font-mono font-extrabold text-rose-400">-{item.weight?.toFixed(2)}%</span>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Weight changes list */}
          <div className="bg-[#0D0D0F] rounded-sm border border-[#2A2A2E] p-4">
            <h4 className="text-xs text-[#D4AF37] font-bold flex items-center gap-1.5 uppercase font-mono tracking-wider mb-3">
              <span className="w-1.5 h-1.5 rounded-full bg-[#D4AF37]"></span>
              主要權重調整 ({diff.changed.length})
            </h4>
            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {diff.changed.length === 0 ? (
                <p className="text-xs text-gray-500 py-3">無權重變動</p>
              ) : (
                diff.changed.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff)).map((item, idx) => {
                  const isUp = item.diff >= 0;
                  return (
                    <div key={idx} className="bg-[#161618] border border-[#2A2A2E] p-2.5 rounded-sm text-xs">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-semibold text-gray-200 text-xs">{item.name}</p>
                          <p className="font-mono text-[9px] text-gray-500">{item.symbol}</p>
                        </div>
                        <span className={`font-mono text-xs font-bold ${isUp ? 'text-rose-500' : 'text-emerald-500'}`}>
                          {isUp ? '+' : ''}{item.diff.toFixed(2)}%
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-1 text-[10px] text-gray-500 font-mono">
                        <span>原 {item.oldWeight?.toFixed(2)}%</span>
                        <ArrowRight className="w-3 h-3 text-gray-600" />
                        <span className="text-gray-200 font-bold">新 {item.newWeight?.toFixed(2)}%</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
