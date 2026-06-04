import React from 'react';
import { CrawlerLog } from '../types';
import { Terminal, Shield, CheckCircle, XCircle } from 'lucide-react';

interface LogConsoleProps {
  logs: CrawlerLog[];
}

export const LogConsole: React.FC<LogConsoleProps> = ({ logs }) => {
  return (
    <div className="bg-[#0D0D0F] rounded-sm border border-[#2A2A2E] p-4 font-mono text-xs shadow-inner" id="log_console_wrapper">
      <div className="flex items-center justify-between border-b border-[#2A2A2E] pb-3 mb-3">
        <div className="flex items-center gap-2 text-gray-400">
          <Terminal className="w-4 h-4 text-[#D4AF37]" />
          <span className="font-serif italic font-semibold text-[#E0E0E0] text-sm">系統即時作業日誌 (Operation Log Summary)</span>
        </div>
      </div>

      <div className="space-y-2 max-h-52 overflow-y-auto pr-1 select-none">
        {logs.length === 0 ? (
          <div className="text-gray-600 py-6 text-center italic">
            [系統就緒] 尚無最近作業紀錄。請執行爬網比對以載入作業日誌。
          </div>
        ) : (
          logs.map((log) => {
            const isSuccess = log.status === 'success';
            return (
              <div 
                key={log.id} 
                className={`p-2.5 rounded-sm border leading-relaxed ${
                  isSuccess 
                    ? 'bg-emerald-950/10 border-[#2A2A2E] text-emerald-400/90' 
                    : 'bg-rose-950/10 border-[#2A2A2E] text-rose-400/90'
                }`}
              >
                <div className="flex items-start md:items-center justify-between gap-2 flex-col md:flex-row">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-gray-300 uppercase tracking-wider font-mono bg-[#161618] px-1.5 py-0.5 border border-[#2A2A2E] rounded-sm text-[10px]">
                      {log.etfId}
                    </span>
                    <span className="text-gray-300 font-sans">{log.message}</span>
                  </div>
                  <span className="text-[10px] text-gray-500 shrink-0 font-mono">
                    {new Date(log.timestamp).toLocaleTimeString('zh-TW', { hour12: false })}
                  </span>
                </div>

                {log.diffSummary && (
                  <div className="mt-1.5 pt-1.5 border-t border-[#2A2A2E]/40 flex gap-4 text-[10px] text-gray-400">
                    <span>
                      新增: <strong className="text-emerald-400 font-mono">{log.diffSummary.addedCount}</strong>
                    </span>
                    <span>
                      刪除: <strong className="text-rose-400 font-mono">{log.diffSummary.removedCount}</strong>
                    </span>
                    <span>
                      重新平衡: <strong className="text-[#D4AF37] font-mono">{log.diffSummary.changedCount}</strong>
                    </span>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
