import React, { useState, useEffect, useRef } from 'react';
import { User } from 'firebase/auth';
import { 
  initAuth, 
  googleSignIn, 
  logout, 
  createETFSpreadsheet, 
  writeHoldingsToTab, 
  writeMoneyDJReturnsToTab,
  updateSheetValues, 
  appendValuesToSheet, 
  sendGmailAlert 
} from './google-api';
import { Holding, ETFDiff, CrawlerLog, AppConfig } from './types';
import { AuthCard } from './components/AuthCard';
import { HoldingsTable } from './components/HoldingsTable';
import { DiffViewer } from './components/DiffViewer';
import { LogConsole } from './components/LogConsole';
import { HoldingsChart } from './components/HoldingsChart';
import { MoneyDJReturnsTable } from './components/MoneyDJReturnsTable';
import { FinanceNewsViewer } from './components/FinanceNewsViewer';
import { 
  TrendingUp, 
  FileSpreadsheet, 
  Mail, 
  Play, 
  Clock,
  Settings,
  Plus,
  Trash2,
  RefreshCw,
  PlusSquare,
  AlertCircle,
  AlertTriangle,
  Activity,
  Shield,
  Trash
} from 'lucide-react';
import { readValuesFromSheet } from './google-api';

interface ServerErrorLog {
  timestamp: string;
  stock_id: string;
  type: string;
  message: string;
  details?: string;
}

const DEFAULT_ETFS = ["0050.TW", "0056.TW", "00878.TW", "00919.TW", "00929.TW"];

export default function App() {
  // Authorization States
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [needsAuth, setNeedsAuth] = useState(true);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Configuration States
  const [sheetId, setSheetId] = useState<string>(() => localStorage.getItem('etf_sheet_id') || '');
  const [recipientEmails, setRecipientEmails] = useState<string>(() => localStorage.getItem('etf_recipients') || '');
  const [recipientName, setRecipientName] = useState<string>('投資人');
  const [autoSendEmail, setAutoSendEmail] = useState<boolean>(() => localStorage.getItem('etf_auto_email') === 'true');
  const [trackedETFs, setTrackedETFs] = useState<string[]>(() => {
    const saved = localStorage.getItem('etf_tracked_list');
    return saved ? JSON.parse(saved) : DEFAULT_ETFS;
  });
  const [newEtfSymbol, setNewEtfSymbol] = useState('');
  const [deletingEtf, setDeletingEtf] = useState<string | null>(null);

  // App Workspace data
  const [selectedETF, setSelectedETF] = useState<string>(() => trackedETFs[0] || '0050.TW');
  const [holdingsMap, setHoldingsMap] = useState<Record<string, { list: Holding[]; date: string }>>({});
  const [diffMap, setDiffMap] = useState<Record<string, ETFDiff | null>>({});
  const [logs, setLogs] = useState<CrawlerLog[]>(() => {
    const saved = localStorage.getItem('etf_crawler_logs');
    return saved ? JSON.parse(saved) : [];
  });
  
  // Scraper File Error Monitoring States
  const [serverErrors, setServerErrors] = useState<ServerErrorLog[]>([]);

  // Connection testing sentinel diagnostics
  const [isTestingConnections, setIsTestingConnections] = useState(false);
  const [connectionStatuses, setConnectionStatuses] = useState<Record<string, { status: "ok" | "error"; latency: number | null; message: string }> | null>(null);

  const handleTestConnections = async () => {
    setIsTestingConnections(true);
    try {
      const res = await fetch("/api/connection-test");
      if (res.ok) {
        const body = await res.json();
        setConnectionStatuses(body.results || null);
        addSystemLog('system', 'success', '⚡ 異常哨兵：完成最新即時網路連線健康診斷。');
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch (err: any) {
      console.error(err);
      addSystemLog('system', 'failed', `❌ 連線健康診斷失敗: ${err.message}`);
    } finally {
      setIsTestingConnections(false);
    }
  };

  // MoneyDJ Period Returns States
  const [moneydjReturns, setMoneydjReturns] = useState<any[]>(() => {
    const saved = localStorage.getItem('etf_moneydj_returns');
    return saved ? JSON.parse(saved) : [];
  });
  const [isFetchingReturns, setIsFetchingReturns] = useState(false);
  const [returnsLastRefreshed, setReturnsLastRefreshed] = useState<string>(() => {
    return localStorage.getItem('etf_moneydj_returns_time') || '';
  });

  // Google Finance stock news active symbol
  const [activeNewsSymbol, setActiveNewsSymbol] = useState<string>(() => trackedETFs[0] || '0050.TW');

  // Control UI States
  const [isCrawling, setIsCrawling] = useState(false);
  const [isAutoFetching, setIsAutoFetching] = useState<Record<string, boolean>>({});

  // Automatically update news query when selected ETF tab changes
  useEffect(() => {
    if (selectedETF) {
      setActiveNewsSymbol(selectedETF);
    }
  }, [selectedETF]);

  // Automatically fetch ETF holdings if selected ETF is currently empty in state
  useEffect(() => {
    if (!selectedETF) return;
    const cleanSym = selectedETF.toUpperCase().trim();
    const existing = holdingsMap[cleanSym];

    if (!existing || existing.list.length === 0) {
      if (!isCrawling && !isAutoFetching[cleanSym]) {
        setIsAutoFetching(prev => ({ ...prev, [cleanSym]: true }));
        console.log(`[AutoFetch] Data empty/missing for ${cleanSym}. Initiating background sync...`);
        
        (async () => {
          try {
            await processSingleETFCrawl(cleanSym, true);
          } catch (err: any) {
            console.error(`[AutoFetch] Failed to auto-gather constituents for ${cleanSym}:`, err.message);
          } finally {
            setIsAutoFetching(prev => ({ ...prev, [cleanSym]: false }));
          }
        })();
      }
    }
  }, [selectedETF, holdingsMap]);
  const [countdownText, setCountdownText] = useState('00:00:00');
  const [showConfig, setShowConfig] = useState(false);

  // Auto-crawling check timer
  const lastCheckedDateRef = useRef<string>('');

  // Fetch debugging log file from server
  const fetchServerErrors = async () => {
    try {
      const res = await fetch("/api/scraping-errors");
      if (res.ok) {
        const data = await res.json();
        setServerErrors(data);
      }
    } catch (err) {
      console.error("Failed to load server errors log file", err);
    }
  };

  // Push clients/GCP exception logs to the backend file logger
  const reportClientException = async (stockId: string, type: string, message: string, details?: string) => {
    try {
      await fetch("/api/log-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stock_id: stockId, type, message, details })
      });
      fetchServerErrors();
    } catch (err) {
      console.error("Failed to proxy log exception server-side", err);
    }
  };

  const handleClearServerErrors = async () => {
    try {
      const res = await fetch("/api/scraping-errors/clear", { method: "POST" });
      if (res.ok) {
        setServerErrors([]);
        addSystemLog('system', 'success', '🧹 系統異常日誌已手動清除。');
      }
    } catch (err) {
      console.error(err);
    }
  };

  // 1. Setup Firebase authentication logic
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, currentToken) => {
        setUser(currentUser);
        setToken(currentToken);
        setNeedsAuth(false);
      },
      () => {
        setUser(null);
        setToken(null);
        setNeedsAuth(true);
      }
    );
    return () => unsubscribe();
  }, []);

  // Poll errors periodically in background and run connections diagnostics
  useEffect(() => {
    fetchServerErrors();
    handleTestConnections();
    const interval = setInterval(fetchServerErrors, 25000);
    return () => clearInterval(interval);
  }, []);

  // Fetch MoneyDJ period returns on startup if empty
  useEffect(() => {
    if (moneydjReturns.length === 0) {
      fetchMoneyDJReturns();
    }
  }, []);

  // Sync preferred tracked ETFs list from Google Sheet if connected
  useEffect(() => {
    if (token && sheetId) {
      syncTrackedETFsFromGoogleSheet(token, sheetId);
    }
  }, [token, sheetId]);

  // Sync log array with LocalStorage
  useEffect(() => {
    localStorage.setItem('etf_crawler_logs', JSON.stringify(logs));
  }, [logs]);

  // Sync tracked ETFs list and restore cached holdings data on change/startup
  useEffect(() => {
    localStorage.setItem('etf_tracked_list', JSON.stringify(trackedETFs));

    const loadedHoldingsMap: Record<string, { list: Holding[]; date: string }> = {};
    const loadedDiffMap: Record<string, ETFDiff | null> = {};

    trackedETFs.forEach(etf => {
      const etfClean = etf.toUpperCase().trim();
      const cachedHoldings = localStorage.getItem(`etf_last_${etfClean}`);
      if (cachedHoldings) {
        try {
          const list = JSON.parse(cachedHoldings);
          const date = localStorage.getItem(`etf_date_${etfClean}`) || new Date().toISOString().substring(0, 10);
          loadedHoldingsMap[etfClean] = { list, date };
        } catch (e) {
          console.error(`Failed to parse cached holdings for ${etfClean}`, e);
        }
      }

      const cachedDiff = localStorage.getItem(`etf_diff_${etfClean}`);
      if (cachedDiff) {
        try {
          loadedDiffMap[etfClean] = JSON.parse(cachedDiff);
        } catch (e) {
          console.error(`Failed to parse cached diff for ${etfClean}`, e);
        }
      }
    });

    setHoldingsMap(loadedHoldingsMap);
    setDiffMap(loadedDiffMap);
  }, [trackedETFs]);

  // Sync general configs
  useEffect(() => {
    localStorage.setItem('etf_sheet_id', sheetId);
    localStorage.setItem('etf_recipients', recipientEmails);
    localStorage.setItem('etf_auto_email', String(autoSendEmail));
  }, [sheetId, recipientEmails, autoSendEmail]);

  // 2. 14:00 Taipei timezone countdown & scheduling handler
  useEffect(() => {
    const runTimer = () => {
      const now = new Date();
      // Calculate Taipei UTC+8 offset
      const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
      const taipeiNow = new Date(utc + (3600000 * 8));

      // Target daily at 14:00
      const taipeiTarget = new Date(taipeiNow);
      taipeiTarget.setHours(14, 0, 0, 0);

      if (taipeiNow.getTime() >= taipeiTarget.getTime()) {
        taipeiTarget.setDate(taipeiTarget.getDate() + 1);
      }

      const diffMs = taipeiTarget.getTime() - taipeiNow.getTime();
      const hours = Math.floor(diffMs / 3600000);
      const minutes = Math.floor((diffMs % 3600000) / 60000);
      const seconds = Math.floor((diffMs % 60000) / 1000);

      setCountdownText(
        `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      );

      // Auto trigger code block
      // Trigger scan automatically when entering 14:00 of safety check date
      const currentDateString = taipeiNow.toISOString().substring(0, 10);
      const currentHour = taipeiNow.getHours();
      const currentMinute = taipeiNow.getMinutes();

      if (currentHour === 14 && currentMinute === 0 && lastCheckedDateRef.current !== currentDateString) {
        lastCheckedDateRef.current = currentDateString;
        console.log("[Scheduler] 14:00 reached! Auto fetching ETF holdings...");
        handleAutoScheduleExecution();
      }
    };

    runTimer();
    const intervalId = setInterval(runTimer, 1000);
    return () => clearInterval(intervalId);
  }, [trackedETFs, token, sheetId, recipientEmails]);

  // 3. Methods for Scraper operations
  const handleLogin = async () => {
    setIsLoggingIn(true);
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setToken(result.accessToken);
        setNeedsAuth(false);
        addSystemLog('system', 'success', '🔐 Google API Authentication Completed successfully.');
      }
    } catch (err: any) {
      addSystemLog('system', 'failed', `❌ Sign in failed: ${err.message}`);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = async () => {
    try {
      await logout();
      setUser(null);
      setToken(null);
      setNeedsAuth(true);
      addSystemLog('system', 'success', '🔒 Google credentials cleared in safety cache.');
    } catch (err: any) {
      console.error(err);
    }
  };

  const addSystemLog = (etfId: string, status: 'success' | 'failed', message: string, diffSummary?: any) => {
    setLogs(prev => [
      {
        id: Math.random().toString(36).substring(7),
        timestamp: new Date().toISOString(),
        etfId,
        status,
        message,
        diffSummary
      },
      ...prev.slice(0, 49) // Maintain max 50 entries
    ]);
  };

  // Create workspace sheet helper
  const handleCreateNewSheetFile = async () => {
    if (!token) {
      alert("請先完成 [登入 Google 帳戶] 身分授權！");
      return;
    }
    const confirmed = window.confirm("確認要於您的雲端硬碟建立新的 Google 試算表作為資料庫嗎？");
    if (!confirmed) return;

    try {
      const newSheetId = await createETFSpreadsheet(token);
      setSheetId(newSheetId);
      addSystemLog('google', 'success', `📁 Created database Google Sheet. ID: ${newSheetId}`);
      alert("成功建立資料庫試算表！網址與路徑已自動套用至配置設定。");
    } catch (err: any) {
      addSystemLog('google', 'failed', `❌ Sheet creation failed: ${err.message}`);
      alert(`建立試算表錯誤：${err.message}`);
    }
  };

  // 2.5 Synchronize tracked ETF codes to/from Google Spreadsheet (Persistence and Easy Management)
  const syncTrackedETFsFromGoogleSheet = async (currentToken: string, currentSheetId: string) => {
    if (!currentToken || !currentSheetId) return;
    try {
      addSystemLog('google', 'success', '🔄 正在從 Google Sheet 載入與解析您儲存的個人化監控清單...');
      const rows = await readValuesFromSheet(currentToken, currentSheetId, "'Tracked ETFs'!A2:A50");
      if (rows && rows.length > 0) {
        const symbols = rows
          .map(row => row[0])
          .filter((symbol): symbol is string => typeof symbol === 'string' && (symbol.trim().endsWith('.TW') || symbol.trim().endsWith('.TWO')));
        
        if (symbols.length > 0) {
          const uniqueSymbols = Array.from(new Set(symbols.map(s => s.toUpperCase().trim())));
          setTrackedETFs(uniqueSymbols);
          if (!uniqueSymbols.includes(selectedETF)) {
            setSelectedETF(uniqueSymbols[0]);
          }
          addSystemLog('google', 'success', `📥 同步載入完成！從雲端載入 ${uniqueSymbols.length} 檔追蹤標的: ${uniqueSymbols.join(', ')}`);
        } else {
          addSystemLog('google', 'success', 'ℹ️ Google 試算表目前未包含有效的成分股代號項目，使用本機配置。');
        }
      }
    } catch (err: any) {
      console.error("Failed to read preferred ETFs from Google:", err.message);
      addSystemLog('google', 'failed', `⚠️ 無法從試算表載入個人配置檔: ${err.message}`);
      await reportClientException('GCP-SHEET', 'sheet_read_preference_error', err.message, err.stack);
    }
  };

  const syncTrackedETFsToGoogleSheet = async (currentToken: string, currentSheetId: string, list: string[]) => {
    if (!currentToken || !currentSheetId) return;
    try {
      addSystemLog('google', 'success', `📤 正在將您的個人化監控清單同步至雲端試算表...`);
      // First wipe the A2:F35 cells to remove any old deleted ETFs
      const blankLines = Array(30).fill(["", "", "", "", "", ""]);
      await updateSheetValues(currentToken, currentSheetId, "'Tracked ETFs'!A2:F31", blankLines);

      const rows = list.map(symbol => [
        symbol,
        "台股ETF (已同步)",
        "-",
        new Date().toLocaleString('zh-TW', { hour12: false }),
        "載入同步中",
        "備用同步"
      ]);
      await updateSheetValues(currentToken, currentSheetId, `'Tracked ETFs'!A2:F${rows.length + 1}`, rows);
      addSystemLog('google', 'success', `📤 已完成最新 ${list.length} 檔個人化追蹤清單與 Google 試算表連動保存。`);
    } catch (err: any) {
      console.error("Failed to write preferred ETFs to Google:", err.message);
      addSystemLog('google', 'failed', `⚠️ 更新雲端試算表監控名單儲存格失敗：${err.message}`);
      await reportClientException('GCP-SHEET', 'sheet_write_preference_error', err.message, err.stack);
    }
  };

  // Perform fetching + comparing + writing to Sheets + sending Email
  const processSingleETFCrawl = async (etfSymbol: string, bypassConfirmation = false) => {
    const symbolClean = etfSymbol.toUpperCase().trim();
    if (!symbolClean) return;

    try {
      // Step A: Fetch latest constituents from our server-side api proxy
      const response = await fetch(`/api/etf-holdings?stock_id=${encodeURIComponent(symbolClean)}`);
      if (!response.ok) {
        const errorContent = await response.json().catch(() => ({}));
        throw new Error(errorContent.error || `Scraper HTTP Proxy returned status ${response.status}`);
      }

      const rawData = await response.json();
      if (!rawData.holdings || rawData.holdings.length === 0) {
        throw new Error(`Scraped ETF holdings list is empty or invalid.`);
      }

      const holdingsList: Holding[] = rawData.holdings;
      const asOfDate: string = rawData.as_of_date || new Date().toISOString().substring(0, 10);

      // Step B: Compare with previous holdings inside LocalStorage to track differences
      const cachedKey = `etf_last_${symbolClean}`;
      const savedPrevStr = localStorage.getItem(cachedKey);
      let prevList: Holding[] = [];
      if (savedPrevStr) {
        try {
          prevList = JSON.parse(savedPrevStr);
        } catch {
          prevList = [];
        }
      }

      let diffResult: ETFDiff | null = null;
      if (prevList.length > 0) {
        diffResult = calculateConstituentsDiff(symbolClean, prevList, holdingsList, asOfDate);
      } else {
        // First run base saving
        diffResult = {
          etfId: symbolClean,
          date: asOfDate,
          added: [],
          removed: [],
          changed: []
        };
      }

      // Save newest constituents in LocalStorage state
      localStorage.setItem(cachedKey, JSON.stringify(holdingsList));
      localStorage.setItem(`etf_date_${symbolClean}`, asOfDate);
      if (diffResult) {
        localStorage.setItem(`etf_diff_${symbolClean}`, JSON.stringify(diffResult));
      } else {
        localStorage.removeItem(`etf_diff_${symbolClean}`);
      }
      setHoldingsMap(prev => ({
        ...prev,
        [symbolClean]: { list: holdingsList, date: asOfDate }
      }));
      setDiffMap(prev => ({
        ...prev,
        [symbolClean]: diffResult
      }));

      // Step C: Update Google Sheet spreadsheet (if authorized)
      if (token && sheetId) {
        addSystemLog(symbolClean, 'success', `📥 Writing constituents to Google Sheet Tab [${symbolClean}]...`);
        try {
          await writeHoldingsToTab(token, sheetId, symbolClean, holdingsList, asOfDate);
        } catch (gErr: any) {
          addSystemLog(symbolClean, 'failed', `❌ 試算表防護失效：無法寫入 [${symbolClean}] 分頁數據。`);
          await reportClientException(symbolClean, 'sheet_tab_write_error', gErr.message, gErr.stack);
          throw gErr;
        }

        try {
          // Update Tracker Dashboard Index sheet
          await updateSheetValues(token, sheetId, `'Tracked ETFs'!A${trackedETFs.indexOf(etfSymbol) + 2}:F${trackedETFs.indexOf(etfSymbol) + 2}`, [
            [
              symbolClean, 
              rawData.name || "台股ETF", 
              holdingsList.length, 
              new Date().toLocaleString('zh-TW', { hour12: false }),
              `新增:${diffResult?.added.length || 0} / 刪除:${diffResult?.removed.length || 0} / 權重變動:${diffResult?.changed.length || 0}`,
              "連線同步中"
            ]
          ]);
        } catch (gIndexErr: any) {
          addSystemLog(symbolClean, 'failed', `❌ 試算表警報：無法更新 Tracked ETFs 總覽目錄。`);
          await reportClientException(symbolClean, 'sheet_dashboard_update_error', gIndexErr.message, gIndexErr.stack);
        }

        // Append historical rebalancing logs
        if (diffResult && (diffResult.added.length > 0 || diffResult.removed.length > 0 || diffResult.changed.length > 0)) {
          const logRows: any[][] = [];
          
          diffResult.added.forEach(item => {
            logRows.push([asOfDate, symbolClean, "新增成分股", item.holding_symbol, item.holding_name, 0, item.weight, item.weight]);
          });
          diffResult.removed.forEach(item => {
            logRows.push([asOfDate, symbolClean, "刪除成分股", item.holding_symbol, item.holding_name, item.weight, 0, `-${item.weight}`]);
          });
          diffResult.changed.forEach(item => {
            logRows.push([asOfDate, symbolClean, "權重調整", item.symbol, item.name, item.oldWeight, item.newWeight, item.diff]);
          });

          if (logRows.length > 0) {
            try {
              await appendValuesToSheet(token, sheetId, "'Change History Log'!A2:H", logRows);
            } catch (gLogErr: any) {
              addSystemLog(symbolClean, 'failed', `❌ 試算表核心：無法附加歷史異動日誌軌跡。`);
              await reportClientException(symbolClean, 'sheet_history_write_error', gLogErr.message, gLogErr.stack);
            }
          }
        }
      }

      // Step D: Trigger Gmail alert if configured
      if (token && recipientEmails && (autoSendEmail || !bypassConfirmation)) {
        const diffSummaryString = formatDiffEmailHTML(symbolClean, diffResult);
        const subject = `【台股 ETF 成分股異動通知】${symbolClean} 今日資訊更新 (${asOfDate})`;
        addSystemLog(symbolClean, 'success', `✉️ Sending Gmail alert to receivers list...`);
        try {
          await sendGmailAlert(token, recipientEmails, subject, diffSummaryString);
        } catch (mErr: any) {
          addSystemLog(symbolClean, 'failed', `❌ 郵件路由警報：Gmail 異動通知發送失敗：${mErr.message}`);
          await reportClientException(symbolClean, 'gmail_dispatch_error', mErr.message, mErr.stack);
          throw mErr;
        }
      }

      addSystemLog(
        symbolClean, 
        'success', 
        `✅ ${symbolClean} 抓取與同步已完成！基準日期: ${asOfDate}`,
        {
          addedCount: diffResult?.added.length || 0,
          removedCount: diffResult?.removed.length || 0,
          changedCount: diffResult?.changed.length || 0
        }
      );

    } catch (err: any) {
      console.error(err);
      addSystemLog(symbolClean, 'failed', `❌ 抓取同步失敗：${err.message}`);
      await reportClientException(symbolClean, 'client_crawl_exception', err.message, err.stack);
      throw err;
    }
  };

  // Perform full run manual synchronization button click
  const handleManualTriggerAll = async () => {
    if (isCrawling) return;
    
    // Safety verification check
    if (token && !sheetId) {
      const createSheet = window.confirm("您已登入 Google，但尚未綁定試算表。要自動建立一個新的 Google Sheet 資料庫嗎？");
      if (createSheet) {
        await handleCreateNewSheetFile();
        return;
      }
    }

    if (token && !recipientEmails) {
      alert("請先完成 [Gmail 接收人信箱] 欄位填寫，以便發送今日異動通知信！");
      setShowConfig(true);
      return;
    }

    const confirmed = window.confirm("確認要啟動抓取與成分股同步程序嗎？這將會更新對應的試算表並發送 Gmail 報告。");
    if (!confirmed) return;

    setIsCrawling(true);
    addSystemLog('crawler', 'success', '🚀 執行手動爬網程序，監控成分股並更新 G-Workspace...');

    try {
      for (const etf of trackedETFs) {
        await processSingleETFCrawl(etf, true);
      }
      alert("精準同步完成！對照清單已完整寫入 Google 試算表與發出通知！");
    } catch (err: any) {
      alert(`程序未完全完結：部分元件可能發生連線超時，請檢查哨兵通報日誌`);
    } finally {
      setIsCrawling(false);
    }
  };

  // Scheduled execution
  const handleAutoScheduleExecution = async () => {
    if (!token || !sheetId) {
      addSystemLog('scheduler', 'failed', '⚠️ 14:00 自動同步未觸發：試算表未綁定或遺失 Google 授權連接。');
      return;
    }
    addSystemLog('scheduler', 'success', '⏰ 台北時間 14:00！排程自動抓取程序全面啟動...');
    try {
      // 1. Crawl ETF constituents
      for (const etf of trackedETFs) {
        await processSingleETFCrawl(etf, true);
      }
      
      // 2. Crawl MoneyDJ period returns
      await fetchMoneyDJReturns(true);
      
      addSystemLog('scheduler', 'success', '⏰ 14:00 台北時間全排程同步成功完成！');
    } catch (err: any) {
      console.error("[Scheduler Error]:", err.message);
      addSystemLog('scheduler', 'failed', `❌ 排程自動執行時發生錯誤: ${err.message}`);
    }
  };

  // MoneyDJ periods returns scraping core method
  const fetchMoneyDJReturns = async (forceSyncSheet = false) => {
    setIsFetchingReturns(true);
    addSystemLog('moneydj', 'success', '🌐 正在自 MoneyDJ 抓取各期間 ETF 報酬率排行清單 (1W 排行基準)...');
    try {
      const res = await fetch('/api/moneydj-returns?eRank=up&eOrd=T800520&ePeriod=1W');
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const resultObj = await res.json();
      const list = resultObj.data || [];
      setMoneydjReturns(list);
      
      const timeStr = new Date().toLocaleString('zh-TW', { hour12: false });
      setReturnsLastRefreshed(timeStr);
      localStorage.setItem('etf_moneydj_returns', JSON.stringify(list));
      localStorage.setItem('etf_moneydj_returns_time', timeStr);
      
      addSystemLog('moneydj', 'success', `📈 成功獲取 MoneyDJ 報酬率排行清單，共載入 ${list.length} 檔標的績效統計！`);

      // Write to sheet tab "MoneyDJ Period Returns" if authorized
      if (token && sheetId) {
        addSystemLog('moneydj', 'success', '📤 正在將 MoneyDJ 各期間報酬排行同步寫入試算表 [MoneyDJ Period Returns]... ');
        try {
          await writeMoneyDJReturnsToTab(token, sheetId, 'MoneyDJ Period Returns', list, new Date().toISOString().substring(0, 10));
          addSystemLog('moneydj', 'success', '✅ 雲端試算表 [MoneyDJ Period Returns] 分頁資料寫入與同步成功！');
        } catch (sheetErr: any) {
          addSystemLog('moneydj', 'failed', `❌ 試算表寫入 [MoneyDJ Period Returns] 失敗: ${sheetErr.message}`);
          await reportClientException('MONEYDJ', 'sheet_tab_moneydj_write_error', sheetErr.message, sheetErr.stack);
        }
      } else if (forceSyncSheet) {
        addSystemLog('moneydj', 'failed', '⚠️ 試算表尚未綁定或未登入：無法自動更新雲端。');
      }
    } catch (err: any) {
      console.error("Failed to fetch MoneyDJ returns rating:", err);
      addSystemLog('moneydj', 'failed', `❌ 抓取 MoneyDJ 績效排行失敗: ${err.message}`);
      await reportClientException('MONEYDJ', 'crawl_moneydj_returns_error', err.message, err.stack);
    } finally {
      setIsFetchingReturns(false);
    }
  };

  // Add customized ETF list item and sync
  const handleAddTrackedETF = async () => {
    let fresh = newEtfSymbol.toUpperCase().trim();
    if (!fresh) return;

    // Automatically append .TW if no extension is present (.TW or .TWO)
    if (!fresh.endsWith('.TW') && !fresh.endsWith('.TWO')) {
      fresh = `${fresh}.TW`;
    }

    if (trackedETFs.includes(fresh)) {
      alert("此 ETF 代號早已存在於監控名單中！");
      return;
    }

    const updatedList = [...trackedETFs, fresh];
    setTrackedETFs(updatedList);
    setNewEtfSymbol('');
    addSystemLog('config', 'success', `➕ 監控名單中自訂新增 ETF: ${fresh}`);

    if (token && sheetId) {
      await syncTrackedETFsToGoogleSheet(token, sheetId, updatedList);
    }
  };

  const handleRemoveTrackedETF = async (etf: string) => {
    if (trackedETFs.length <= 1) {
      addSystemLog('config', 'failed', '⚠️ 必須至少監控一檔 ETF 成分股！');
      return;
    }

    const updatedList = trackedETFs.filter(item => item !== etf);
    setTrackedETFs(updatedList);
    if (selectedETF === etf) {
      setSelectedETF(updatedList[0] || '');
    }
    addSystemLog('config', 'success', `➖ 監控名單中已成功移除 ETF: ${etf}`);

    if (token && sheetId) {
      await syncTrackedETFsToGoogleSheet(token, sheetId, updatedList);
    }
  };

  const handleQuickSelectOrAddETF = async (symbol: string) => {
    let fresh = symbol.toUpperCase().trim();
    if (!fresh) return;

    if (!fresh.endsWith('.TW') && !fresh.endsWith('.TWO')) {
      fresh = `${fresh}.TW`;
    }

    if (trackedETFs.includes(fresh)) {
      setSelectedETF(fresh);
      addSystemLog('config', 'success', `🔍 切換至 ETF 檢視標的: ${fresh}`);
      return;
    }

    // Add dynamically
    const updatedList = [...trackedETFs, fresh];
    setTrackedETFs(updatedList);
    setSelectedETF(fresh);
    addSystemLog('config', 'success', `➕ 快速查詢並自動新增監控 ETF: ${fresh}`);

    if (token && sheetId) {
      await syncTrackedETFsToGoogleSheet(token, sheetId, updatedList);
    }
  };

  // 4. Mathematical compare functions
  const calculateConstituentsDiff = (etfId: string, oldList: Holding[], newList: Holding[], asOfDate: string): ETFDiff => {
    const oldMap = new Map(oldList.map(h => [h.holding_symbol, h]));
    const newMap = new Map(newList.map(h => [h.holding_symbol, h]));

    const added: Holding[] = [];
    const removed: Holding[] = [];
    const changed: { symbol: string; name: string; oldWeight: number | null; newWeight: number | null; diff: number }[] = [];

    // Find added & rebalances
    for (const hNew of newList) {
      const hOld = oldMap.get(hNew.holding_symbol);
      if (!hOld) {
        added.push(hNew);
      } else {
        const wOld = hOld.weight || 0;
        const wNew = hNew.weight || 0;
        const delta = wNew - wOld;
        if (Math.abs(delta) >= 0.01) {
          changed.push({
            symbol: hNew.holding_symbol,
            name: hNew.holding_name,
            oldWeight: wOld,
            newWeight: wNew,
            diff: delta
          });
        }
      }
    }

    // Find removed
    for (const hOld of oldList) {
      if (!newMap.has(hOld.holding_symbol)) {
        removed.push(hOld);
      }
    }

    return {
      etfId,
      date: asOfDate,
      added,
      removed,
      changed
    };
  };

  // HTML Formatter for Gmail alert
  const formatDiffEmailHTML = (etfId: string, diff: ETFDiff | null): string => {
    if (!diff) return `<h3>昨日基準未載入。目前資料庫已同步 ${etfId} 成分股最新現狀。</h3>`;

    const addedHtml = diff.added.map(item => `
      <li style="margin-bottom: 6px; font-size: 13px;">
        <span style="color: #10b981; font-weight: bold;">[新增]</span> 
        <b>${item.holding_name}</b> (${item.holding_symbol}) — 初始權重: <b>${item.weight?.toFixed(2)}%</b>
      </li>
    `).join('') || '<li style="color: #64748b; font-size: 13px;">無新增成分股項目</li>';

    const removedHtml = diff.removed.map(item => `
      <li style="margin-bottom: 6px; font-size: 13px;">
        <span style="color: #ef4444; font-weight: bold;">[移除]</span> 
        <b>${item.holding_name}</b> (${item.holding_symbol}) — 移除前權重: <b>${item.weight?.toFixed(2)}%</b>
      </li>
    `).join('') || '<li style="color: #64748b; font-size: 13px;">無移除成分股項目</li>';

    const rebalancedSorted = [...diff.changed].sort((a,b) => Math.abs(b.diff) - Math.abs(a.diff)).slice(0, 8);
    const changedHtml = rebalancedSorted.map(item => `
      <li style="margin-bottom: 8px; font-size: 13px;">
        <b>${item.name}</b> (${item.symbol}): 
        <span style="color: ${item.diff >= 0 ? '#ef4444' : '#10b981'}; font-weight: bold;">
          ${item.diff >= 0 ? '+' : ''}${item.diff.toFixed(2)}%
        </span> 
        <span style="font-size: 11px; color: #64748b;">(原 ${item.oldWeight?.toFixed(2)}% → 新 ${item.newWeight?.toFixed(2)}%)</span>
      </li>
    `).join('') || '<li style="color: #64748b; font-size: 13px;">今日主要權重比例未調整</li>';

    return `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 650px; margin: 0 auto; padding: 25px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; color: #334155;">
        <div style="text-align: center; border-bottom: 2px solid #3b82f6; padding-bottom: 15px; margin-bottom: 20px;">
          <h1 style="color: #1e3a8a; font-size: 20px; font-weight: bold; margin: 0;">${etfId} 成分股今日異動追蹤報告</h1>
          <p style="color: #64748b; font-size: 13px; margin: 5px 0 0 0;">台北時間每日 14:00 自動監控排程日誌</p>
        </div>
        
        <p style="font-size: 14px; line-height: 1.6;">您好，</p>
        <p style="font-size: 14px; line-height: 1.6;">系統已於台灣時間完成 <b>${etfId}</b> 的成分股抓取與對比，並同步寫入您的 Google 試算表。以下為本次的異動分析報告：</p>
        
        <div style="background-color: #f8fafc; border-radius: 8px; padding: 15px; border: 1px solid #e2e8f0; margin-bottom: 20px;">
          <h4 style="color: #1a202c; margin-top: 0; margin-bottom: 10px; font-size: 14px; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px;">🆕 新增成分股</h4>
          <ul style="padding-left: 15px; margin: 0;">${addedHtml}</ul>
        </div>

        <div style="background-color: #f8fafc; border-radius: 8px; padding: 15px; border: 1px solid #e2e8f0; margin-bottom: 20px;">
          <h4 style="color: #1a202c; margin-top: 0; margin-bottom: 10px; font-size: 14px; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px;">⚠️ 刪除成分股</h4>
          <ul style="padding-left: 15px; margin: 0;">${removedHtml}</ul>
        </div>

        <div style="background-color: #f8fafc; border-radius: 8px; padding: 15px; border: 1px solid #e2e8f0; margin-bottom: 20px;">
          <h4 style="color: #1a202c; margin-top: 0; margin-bottom: 10px; font-size: 14px; border-bottom: 1px solid #cbd5e1; padding-bottom: 6px;">📈 高比例變動成分股 (前 8 名顯示)</h4>
          <ul style="padding-left: 15px; margin: 0;">${changedHtml}</ul>
        </div>

        <div style="margin-top: 25px; text-align: center;">
          <a href="https://docs.google.com/spreadsheets/d/${sheetId}" target="_blank" style="background-color: #10b981; color: white; padding: 11px 22px; text-decoration: none; border-radius: 6px; font-weight: bold; font-size: 13px; display: inline-block;">開啟 Google 試算表資料庫</a>
        </div>
        
        <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 30px 0 15px 0;" />
        <p style="font-size: 11px; color: #94a3b8; text-align: center;">此信件由台股 ETF 自動排程運算元件送出。以上資料皆不構成買賣邀請或投資建議。</p>
      </div>
    `;
  };

  // Trigger individual check
  const handleSpecificCheck = async () => {
    if (isCrawling) return;
    setIsCrawling(true);
    addSystemLog(selectedETF, 'success', `🛠️ 手動對單一 ETF 啟動抓取與異動對比: ${selectedETF}...`);
    try {
      await processSingleETFCrawl(selectedETF, false);
      alert(`${selectedETF} 手動同步完成！已進行異動對照、更新試算表並送出通知信。`);
    } catch (err: any) {
      alert(`手動同步失敗: ${err.message}`);
    } finally {
      setIsCrawling(false);
    }
  };

  const currentHoldingsText = holdingsMap[selectedETF];
  const currentDiffText = diffMap[selectedETF] || null;

  return (
    <div className="min-h-screen bg-[#0A0A0B] text-[#E0E0E0] flex flex-col font-sans">
      
      {/* 1. Header component */}
      <header className="border-b border-[#2A2A2E] bg-[#0D0D0F] py-5 px-4 sm:px-6 sticky top-0 z-50 shadow-lg">
        <div className="max-w-[1920px] mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-4">
            {/* High-fidelity SVG MacroArk logo badge */}
            <div className="relative flex-shrink-0 bg-[#0A0A0B] border border-[#2A2A2E] p-1.5 rounded-sm shadow-inner overflow-hidden group hover:border-[#D4AF37]/50 transition-all duration-300">
              <div className="absolute inset-0 bg-gradient-to-br from-[#06b6d4]/10 to-transparent opacity-50 group-hover:opacity-80 transition-opacity" />
              <svg className="w-11 h-11 relative z-10 select-none drop-shadow-[0_2px_8px_rgba(6,182,212,0.15)]" viewBox="0 0 500 500" fill="none" xmlns="http://www.w3.org/2000/svg" id="macroark_logo_svg">
                <defs>
                  <radialGradient id="glow" cx="50%" cy="50%" r="50%">
                    <stop offset="0%" stopColor="#0ea5e9" stopOpacity="0.25" />
                    <stop offset="100%" stopColor="#0ea5e9" stopOpacity="0" />
                  </radialGradient>
                  <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#1e293b" />
                    <stop offset="100%" stopColor="#020617" />
                  </linearGradient>
                  <linearGradient id="cyanTeal" x1="0%" y1="0%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#06b6d4" />
                    <stop offset="100%" stopColor="#14b8a6" />
                  </linearGradient>
                  <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#d5b037" />
                    <stop offset="100%" stopColor="#896d38" />
                  </linearGradient>
                </defs>
                <circle cx="250" cy="250" r="230" fill="url(#glow)" />
                <path d="M110 110 C110 110, 250 65, 250 65 C250 65, 390 110, 390 110 C390 270, 250 435, 250 435 C250 435, 110 270, 110 110 Z" fill="url(#shieldGrad)" stroke="url(#goldGrad)" strokeWidth="10" strokeLinejoin="round" />
                <path d="M128 128 C128 128, 250 90, 250 90 C250 90, 372 128, 372 128 C372 255, 250 405, 250 405 C250 405, 128 255, 128 128 Z" stroke="url(#cyanTeal)" strokeWidth="4" fill="none" opacity="0.8" />
                <ellipse cx="250" cy="235" rx="100" ry="120" stroke="#334155" strokeWidth="3" fill="none" opacity="0.6" />
                <ellipse cx="250" cy="235" rx="55" ry="120" stroke="#334155" strokeWidth="3" fill="none" opacity="0.6" />
                <line x1="250" y1="100" x2="250" y2="370" stroke="#334155" strokeWidth="3.5" opacity="0.6" />
                <line x1="130" y1="235" x2="370" y2="235" stroke="#334155" strokeWidth="3.5" opacity="0.6" />
                <path d="M150 170 Q250 195 350 170" stroke="#334155" strokeWidth="3" fill="none" opacity="0.6" />
                <path d="M150 300 Q250 325 350 300" stroke="#334155" strokeWidth="3" fill="none" opacity="0.6" />
                <path d="M90 235 C90 115, 250 70, 320 115" stroke="#06b6d4" strokeWidth="3.5" strokeDasharray="6,6" fill="none" opacity="0.7" />
                <circle cx="320" cy="115" r="7" fill="#06b6d4" />
                <circle cx="90" cy="235" r="5" fill="#14b8a6" />
                <path d="M 190 270 L 290 225 L 310 265 L 210 310 Z" fill="#0f172a" stroke="#1e293b" strokeWidth="2" />
                <path d="M 175 260 L 275 210 C 285 205, 305 210, 315 220 L 305 250 L 205 300 Z" fill="url(#goldGrad)" stroke="#0f172a" strokeWidth="2.5" />
                <path d="M 210 245 L 265 218 L 275 235 L 220 262 Z" fill="#047857" stroke="#0f172a" strokeWidth="2" />
                <path d="M 225 235 L 255 220 L 260 230 L 230 245 Z" fill="#34d399" />
                <text x="282" y="258" fill="#121824" fontSize="26" fontWeight="900" fontFamily="sans-serif" transform="rotate(-18 282 258)">$</text>
                <path d="M 110 325 Q 195 355 330 205" stroke="url(#cyanTeal)" strokeWidth="18" strokeLinecap="round" fill="none" />
                <path d="M 312 185 L 358 192 L 338 235 Z" fill="#06b6d4" />
                <circle cx="155" cy="330" r="9" fill="#14b8a6" />
                <circle cx="230" cy="315" r="9" fill="#06b6d4" />
                <circle cx="295" cy="250" r="9" fill="#22d3ee" />
              </svg>
            </div>
            {/* Brand Title block representing MacroArk corporate design with high precision */}
            <div className="flex flex-col">
              <div className="flex items-baseline gap-2">
                <span className="text-base font-black tracking-wider text-white antialiased">
                  全局投資方舟
                </span>
                <span className="text-xl font-extrabold tracking-tight text-[#D4AF37] font-sans antialiased uppercase">
                  MacroArk
                </span>
                <span className="text-[10px] bg-[#D4AF37]/10 text-[#D4AF37] border border-[#D4AF37]/20 px-1 py-0.5 rounded-sm font-semibold tracking-wide ml-1.5">
                  ETF 成分監控
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1">
                <span className="text-[10px] font-bold text-gray-400 font-mono tracking-wider">
                  GLOBAL INVESTMENT ARK
                </span>
                <span className="text-gray-600 text-[10px]">•</span>
                <span className="text-[10px] text-[#D4AF37]/90 font-medium tracking-wide">
                  智領宏觀・資產穩航
                </span>
              </div>
            </div>
          </div>

          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={handleManualTriggerAll}
              disabled={isCrawling}
              className="flex-1 sm:flex-initial bg-gradient-to-r from-[#8A6D3B] to-[#D4AF37] hover:brightness-110 active:scale-[0.98] text-black font-semibold text-xs px-5 py-2.5 rounded-sm flex items-center justify-center gap-2 border border-[#D4AF37]/50 shadow-md transition-all disabled:opacity-40 cursor-pointer uppercase tracking-wider font-mono"
              id="full_sync_button"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isCrawling ? 'animate-spin' : ''}`} />
              一鍵同步全名單 ({trackedETFs.length} 檔)
            </button>
          </div>
        </div>
      </header>

      {/* 2. Main content container */}
      <main className="flex-1 max-w-[1920px] w-full mx-auto px-3.5 py-4 sm:p-6 grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left Side: Controls, Config, & Timers (lg:span-4) */}
        <section className="lg:col-span-4 space-y-6">
          
          {/* Taipei Scheduler Countdown card */}
          <div className="bg-[#0D0D0F] rounded-sm border border-[#2A2A2E] p-5 shadow-xl relative overflow-hidden" id="countdown_card">
            <div className="absolute right-[-20px] bottom-[-20px] text-gray-800/5 select-none pointer-events-none transform rotate-12">
              <Clock className="w-32 h-32" />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[10px] text-[#D4AF37] font-bold uppercase tracking-[0.2em] font-mono">Taipei Time Schedule</span>
                <h3 className="font-serif italic text-gray-300 text-sm mt-0.5">每日自動爬蟲抓取排程</h3>
              </div>
              <span className="bg-[#8A6D3B]/20 border border-[#8A6D3B]/40 text-[#D4AF37] text-[10px] font-mono font-bold px-2 py-0.5 rounded-sm uppercase tracking-wide">
                TAIPEI 14:00
              </span>
            </div>

            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-4.5xl font-mono font-extrabold text-[#D4AF37] tracking-widest leading-none drop-shadow-sm">
                {countdownText}
              </span>
              <span className="text-xs text-gray-500 font-mono">後執行</span>
            </div>
            <p className="text-[11px] text-gray-500 mt-3 leading-relaxed">
              系統會在網頁處於背景開啟、或於伺服器部署時，在台北時間下午 2:00 
              精準啟動 BigGo 台灣股市最新 ETF 每日成分持股抓取與數據比對日誌。
            </p>
          </div>

          {/* Authorization card */}
          <AuthCard 
            user={user} 
            needsAuth={needsAuth} 
            onLogin={handleLogin} 
            onLogout={handleLogout} 
            isLoggingIn={isLoggingIn} 
          />

          {/* Quick Settings card */}
          <div className="bg-[#0D0D0F] rounded-sm border border-[#2A2A2E] p-5 shadow-xl space-y-4" id="config_card">
            <div className="flex items-center justify-between border-b border-[#2A2A2E] pb-2">
              <h4 className="font-serif text-sm font-semibold text-gray-200 flex items-center gap-1.5">
                <Settings className="w-4 h-4 text-[#D4AF37]" />
                資料庫與 Gmail 通知設定
              </h4>
              <button 
                onClick={() => setShowConfig(!showConfig)}
                className="text-xs text-[#D4AF37] hover:text-[#c49f27] font-mono font-semibold"
              >
                {showConfig ? "收合" : "編輯"}
              </button>
            </div>

            {/* Editable options body */}
            {(showConfig || !sheetId || !recipientEmails) && (
              <div className="space-y-4 mt-2 max-h-96 overflow-y-auto pr-1">
                <div>
                  <label className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-widest block">
                    Google 試算表 ID
                  </label>
                  <p className="text-[10px] text-gray-500 mt-0.5 mb-1.5">主試算表唯一識別碼，或點選下方按鈕自動建置</p>
                  <input
                    type="text"
                    placeholder="貼上您的試算表 ID (SpreadsheetId)..."
                    className="w-full bg-[#161618] text-[#E0E0E0] text-xs p-2.5 rounded-sm border border-[#2A2A2E] focus:outline-none focus:border-[#D4AF37] font-mono"
                    value={sheetId}
                    onChange={(e) => setSheetId(e.target.value)}
                    id="sheet_id_input"
                  />
                  <button
                    onClick={handleCreateNewSheetFile}
                    className="w-full mt-1.5 bg-[#161618] hover:bg-[#2A2A2E] text-[#D4AF37] border border-[#2A2A2E] text-xs py-2 rounded-sm font-medium transition-all cursor-pointer font-mono tracking-wide"
                    id="auto_create_sheet_btn"
                  >
                    自動於強健雲端硬碟新建試算表
                  </button>
                </div>

                <div>
                  <label className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-widest block">
                    Gmail 接收人信箱 (逗號分隔)
                  </label>
                  <p className="text-[10px] text-gray-500 mt-0.5 mb-1.5">每日成分股異動報告傳送之對象郵件</p>
                  <input
                    type="text"
                    placeholder="例如: beneficiary@gmail.com, info@twetf.com"
                    className="w-full bg-[#161618] text-[#E0E0E0] text-xs p-2.5 rounded-sm border border-[#2A2A2E] focus:outline-none focus:border-[#D4AF37] font-mono"
                    value={recipientEmails}
                    onChange={(e) => setRecipientEmails(e.target.value)}
                    id="recipient_emails_input"
                  />
                </div>

                <div className="flex items-center justify-between p-2.5 bg-[#161618]/60 rounded-sm border border-[#2A2A2E]">
                  <div>
                    <span className="text-xs font-semibold text-gray-300 block">自動發送電子郵件</span>
                    <span className="text-[10px] text-gray-500 font-mono">14:00 自動執行時對比完畢直接寄送</span>
                  </div>
                  <input
                    type="checkbox"
                    className="accent-[#D4AF37] w-4 h-4 cursor-pointer"
                    checked={autoSendEmail}
                    onChange={(e) => setAutoSendEmail(e.target.checked)}
                    id="auto_send_email_checkbox"
                  />
                </div>
              </div>
            )}

            {/* Read-only brief summaries */}
            {!showConfig && sheetId && recipientEmails && (
              <div className="text-xs text-gray-400 space-y-1.5 font-sans bg-[#161618]/30 p-3 rounded-sm border border-[#2A2A2E]">
                <div className="flex justify-between items-center">
                  <span>連線試算表:</span>
                  <a 
                    href={`https://docs.google.com/spreadsheets/d/${sheetId}`} 
                    target="_blank" 
                    rel="noreferrer"
                    className="text-[#D4AF37] hover:underline truncate max-w-[170px] font-mono text-[11px] font-semibold"
                  >
                    {sheetId}
                  </a>
                </div>
                <div className="flex justify-between items-center">
                  <span>Gmail 通知位址:</span>
                  <span className="truncate max-w-[170px] font-mono text-[11px] text-white">
                    {recipientEmails}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Manage active Target monitored ETFs */}
          <div className="bg-[#0D0D0F] rounded-sm border border-[#2A2A2E] p-5 shadow-xl space-y-4" id="target_etfs_card">
            <div>
              <h4 className="font-serif text-sm font-semibold text-gray-200">監控標的管理</h4>
              <p className="text-xs text-gray-500 mt-1 leading-relaxed">新增或移除每日下午 2 點列入定期採購爬網比對的 ETF 股票號碼</p>
            </div>

            <div className="flex gap-1.5">
              <input
                type="text"
                placeholder="輸入代號 (如 0056.TW)..."
                className="flex-1 bg-[#161618] text-white text-xs p-2 rounded-sm border border-[#2A2A2E] focus:outline-none focus:border-[#D4AF37] font-mono uppercase"
                value={newEtfSymbol}
                onChange={(e) => setNewEtfSymbol(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleAddTrackedETF();
                }}
                id="add_etf_input"
              />
              <button
                onClick={handleAddTrackedETF}
                className="bg-gradient-to-r from-[#8A6D3B] to-[#D4AF37] text-black font-extrabold text-xs px-4 py-2.5 rounded-sm flex items-center justify-center gap-1 cursor-pointer transition-all border border-[#D4AF37]/50"
                id="add_etf_btn"
              >
                <Plus className="w-3.5 h-3.5" />
                新增
              </button>
            </div>

            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {trackedETFs.map((etf, i) => {
                const isDeleting = deletingEtf === etf;
                return (
                  <div key={etf} className="flex items-center justify-between p-2.5 bg-[#161618]/60 rounded-sm border border-[#2A2A2E] font-mono text-xs hover:border-[#D4AF37]/40 transition-all animate-fadeIn">
                    <span className="font-bold text-[#D4AF37]">{i + 1}. {etf}</span>
                    {isDeleting ? (
                      <div className="flex items-center gap-1.5">
                        <button
                          onClick={() => {
                            setDeletingEtf(null);
                            handleRemoveTrackedETF(etf);
                          }}
                          className="px-2 py-0.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-sm text-[10px] cursor-pointer transition-colors"
                        >
                          確認
                        </button>
                        <button
                          onClick={() => setDeletingEtf(null)}
                          className="px-2 py-0.5 bg-[#2A2A2E] hover:bg-[#3E3E44] text-gray-400 font-bold rounded-sm text-[10px] cursor-pointer transition-colors"
                        >
                          取消
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => {
                          if (trackedETFs.length <= 1) {
                            addSystemLog('config', 'failed', '⚠️ 必須至少監控一檔 ETF 成分股！');
                            return;
                          }
                          setDeletingEtf(etf);
                        }}
                        className="p-1 text-gray-500 hover:text-[#FF5555] hover:bg-[#FF5555]/10 rounded transition-colors cursor-pointer"
                        title="刪除此監控標的"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Server Watchdog Log / Error Log Monitor card */}
          <div className="bg-[#0D0D0F] rounded-sm border border-[#2A2A2E] p-5 shadow-xl space-y-4" id="watchdog_errors_card">
            <div className="flex items-center justify-between border-b border-[#2A2A2E] pb-2">
              <h4 className="font-serif text-sm font-semibold text-gray-200 flex items-center gap-1.5">
                <Shield className="w-4 h-4 text-red-500" />
                錯誤日誌與連線異常哨兵
              </h4>
              {serverErrors.length > 0 && (
                <button 
                  onClick={handleClearServerErrors}
                  className="text-[10px] text-red-400 hover:text-red-300 font-mono font-bold flex items-center gap-1 cursor-pointer"
                >
                  <Trash className="w-3" />
                  清除日誌
                </button>
              )}
            </div>
            
            <p className="text-[11px] text-gray-500 leading-relaxed">
              即時監視並保留伺服器拋出之所有異常。凡網路中斷、來源端 API 格式異動，或寫入試算表錯誤皆存於系統 log 檔中通報。
            </p>

            {/* LIVE API CONNECTION SENTINEL DIAGNOSTICS */}
            <div className="bg-[#111113] border border-[#212124] p-3 rounded-sm space-y-2.5">
              <div className="flex justify-between items-center pb-1 border-b border-[#1D1D20]">
                <span className="text-[10.5px] font-bold text-gray-300 font-sans flex items-center gap-1.5">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                  </span>
                  四核心外部數據連線哨兵
                </span>
                
                <button
                  type="button"
                  onClick={handleTestConnections}
                  disabled={isTestingConnections}
                  className="px-2 py-0.5 bg-[#161618] hover:bg-[#2A2A2E] text-[10px] font-bold text-[#D4AF37] rounded-sm border border-[#2A2A2E] flex items-center gap-1 cursor-pointer transition-colors disabled:opacity-40"
                  title="重新執行即時連線健康測試"
                >
                  <RefreshCw className={`w-2.5 h-2.5 ${isTestingConnections ? 'animate-spin' : ''}`} />
                  {isTestingConnections ? '檢測中...' : '即時檢測'}
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-[10.5px] font-mono">
                {/* BigGo API */}
                <div className="p-2 bg-[#161618] border border-[#212124] rounded-sm space-y-1">
                  <div className="text-gray-500 text-[9.5px]">BigGo 持股 API</div>
                  <div className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${(!connectionStatuses || connectionStatuses.biggo?.status === 'ok') ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                    <span className={(!connectionStatuses || connectionStatuses.biggo?.status === 'ok') ? 'text-emerald-400' : 'text-rose-400'}>
                      {connectionStatuses ? connectionStatuses.biggo?.message : '連線正常'}
                    </span>
                  </div>
                </div>

                {/* BigGo Quote */}
                <div className="p-2 bg-[#161618] border border-[#212124] rounded-sm space-y-1">
                  <div className="text-gray-500 text-[9.5px]">BigGo 即時報價</div>
                  <div className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${(!connectionStatuses || connectionStatuses.biggo_quote?.status === 'ok') ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                    <span className={(!connectionStatuses || connectionStatuses.biggo_quote?.status === 'ok') ? 'text-emerald-400' : 'text-rose-400'}>
                      {connectionStatuses ? connectionStatuses.biggo_quote?.message : '連線正常'}
                    </span>
                  </div>
                </div>

                {/* MoneyDJ Webpage */}
                <div className="p-2 bg-[#161618] border border-[#212124] rounded-sm space-y-1">
                  <div className="text-gray-500 text-[9.5px]">MoneyDJ 資訊網</div>
                  <div className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${(!connectionStatuses || connectionStatuses.moneydj?.status === 'ok') ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                    <span className={(!connectionStatuses || connectionStatuses.moneydj?.status === 'ok') ? 'text-emerald-400' : 'text-rose-400'}>
                      {connectionStatuses ? connectionStatuses.moneydj?.message : '連線正常'}
                    </span>
                  </div>
                </div>

                {/* Google Finance */}
                <div className="p-2 bg-[#161618] border border-[#212124] rounded-sm space-y-1">
                  <div className="text-gray-500 text-[9.5px]">Google Finance</div>
                  <div className="flex items-center gap-1">
                    <span className={`w-1.5 h-1.5 rounded-full ${(!connectionStatuses || connectionStatuses.google_finance?.status === 'ok') ? 'bg-emerald-500' : 'bg-rose-500'}`}></span>
                    <span className={(!connectionStatuses || connectionStatuses.google_finance?.status === 'ok') ? 'text-emerald-400' : 'text-rose-400'}>
                      {connectionStatuses ? connectionStatuses.google_finance?.message : '連線正常'}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* INTERNAL ERROR LOG CONSOLE TRACKS */}
            <div className="space-y-2">
              <div className="text-[10px] font-bold text-gray-500 font-mono uppercase tracking-wider">最近拋出之系統異常事件紀錄 :</div>
              
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1 scrollbar-thin">
                {serverErrors.length === 0 ? (
                  <div className="flex items-center gap-2 text-xs text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 p-2.5 rounded-sm">
                    <Activity className="w-4 h-4 animate-pulse text-emerald-400" />
                    <span className="font-mono text-[10px] font-semibold">ALL SYSTEMS NOMINAL • 正常運轉中</span>
                  </div>
                ) : (
                  serverErrors.map((err, idx) => (
                    <div key={idx} className="bg-[#1b1214]/50 border border-red-950/40 p-2.5 rounded-sm space-y-1 text-left">
                      <div className="flex justify-between text-[9px] font-mono font-bold">
                        <span className="text-red-400 uppercase">[{err.type}] - {err.stock_id}</span>
                        <span className="text-gray-500">{new Date(err.timestamp).toLocaleTimeString('zh-TW', {hour12:false})}</span>
                      </div>
                      <p className="text-[10.5px] text-gray-300 leading-normal font-mono text-left">{err.message}</p>
                      {err.details && (
                        <p className="text-[9px] text-gray-500 font-mono select-all overflow-x-auto truncate max-w-full text-left">
                          Debug: {err.details}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

        </section>

        {/* Right Side: Tab view, constituency table, and comparisons (lg:span-8) */}
        <section className="lg:col-span-8 flex flex-col gap-6">
          
          {/* ETF Navigation row */}
          <div className="flex overflow-x-auto gap-2 pb-1 border-b border-[#2A2A2E] scrollbar-none" id="etf_nav_row">
            {trackedETFs.map((etf) => {
              const isSelected = selectedETF === etf;
              return (
                <button
                  key={etf}
                  onClick={() => setSelectedETF(etf)}
                  className={`px-4 py-2.5 rounded-sm font-mono text-xs uppercase tracking-wider font-semibold whitespace-nowrap transition-all border shrink-0 cursor-pointer ${
                    isSelected 
                      ? 'bg-[#8A6D3B]/10 border-[#D4AF37]/50 text-[#D4AF37] font-serif italic' 
                      : 'bg-[#0D0D0F] border-[#2A2A2E] text-gray-500 hover:text-zinc-200'
                  }`}
                  id={`etf_tab_${etf.replace('.', '_')}`}
                >
                  📊 {etf}
                </button>
              );
            })}
          </div>

          {/* Quick sync current selected item block */}
          <div className="p-4 bg-[#0D0D0F] rounded-sm border border-[#2A2A2E] flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
            <div>
              <span className="text-[10px] text-gray-500 font-mono uppercase tracking-widest block font-bold">目前檢視標的：{selectedETF}</span>
              <p className="text-xs text-gray-400 mt-1">
                {currentHoldingsText 
                  ? `最新持股資料共 ${currentHoldingsText.list.length} 筆，同步時間: ${currentHoldingsText.date}` 
                  : "尚未對此標的執行成分股抓取與分析。"
                }
              </p>
            </div>
            
            <button
              onClick={handleSpecificCheck}
              disabled={isCrawling}
              className="w-full sm:w-auto bg-[#161618] hover:bg-[#2A2A2E] text-[#D4AF37] hover:brightness-110 border border-[#2A2A2E] font-semibold text-xs py-2.5 px-4 rounded-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer font-mono tracking-wider"
              id="specific_check_btn"
            >
              <Play className="w-3.5 h-3.5 fill-[#D4AF37] text-[#D4AF37]" />
              單獨同步已選項目
            </button>
          </div>

          {/* Daily differences overview list */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="w-1 h-3 bg-[#D4AF37]"></span>
              <h2 className="text-sm font-serif font-semibold text-[#E0E0E0]">今日成分股異動大綱 (Daily Rebalancing Report)</h2>
            </div>
            <DiffViewer diff={currentDiffText} />
          </div>

          {/* Bespoke Interactive Data Visualization Dashboard */}
          <HoldingsChart 
            etfId={selectedETF} 
            holdings={currentHoldingsText ? currentHoldingsText.list : []}
            diff={currentDiffText}
            isLoading={isCrawling || !!isAutoFetching[selectedETF.toUpperCase().trim()]}
          />

          {/* Holdings grid detail view */}
          <HoldingsTable 
            holdings={currentHoldingsText ? currentHoldingsText.list : []} 
            asOfDate={currentHoldingsText ? currentHoldingsText.date : ''} 
            onSelectSymbol={setActiveNewsSymbol}
            isLoading={isCrawling || !!isAutoFetching[selectedETF.toUpperCase().trim()]}
            onSelectETF={handleQuickSelectOrAddETF}
          />

          {/* Google Finance Stock News Panel */}
          <FinanceNewsViewer
            selectedSymbol={activeNewsSymbol}
            onSymbolChange={setActiveNewsSymbol}
            trackedList={trackedETFs}
          />

          {/* MoneyDJ ETF periods performance ranking table */}
          <MoneyDJReturnsTable
            data={moneydjReturns}
            isLoading={isFetchingReturns}
            lastUpdated={returnsLastRefreshed}
            onRefresh={() => fetchMoneyDJReturns(false)}
            hasSheetId={!!sheetId}
            isSheetSynced={!!(token && sheetId)}
          />

          {/* Interactive Console logs */}
          <LogConsole logs={logs} />

        </section>

      </main>

      {/* Footer credits */}
      <footer className="border-t border-[#2A2A2E] bg-[#070708] py-5 text-center text-[10px] text-gray-600 font-mono tracking-tight">
        <p>© 2026 Taiwan ETF Holdings Tracking Console. Scheduled scrapers configured for BigGo holdings metadata.</p>
      </footer>
    </div>
  );
}
