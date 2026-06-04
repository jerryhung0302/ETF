import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import * as cheerio from "cheerio";

const ERROR_LOG_PATH = path.join(process.cwd(), "scraping_errors.log");

// Helper to log errors to local file
function logErrorToFile(errorType: string, stockId: string, message: string, details?: string) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    stock_id: stockId,
    type: errorType,
    message: message,
    details: details || ""
  };
  
  try {
    const serialized = JSON.stringify(logEntry) + "\n";
    fs.appendFileSync(ERROR_LOG_PATH, serialized, "utf8");
    console.log(`[Error Logged] Saved to file: ${message}`);
  } catch (err: any) {
    console.error("Failed to write to error log file:", err.message);
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Enforce parsing JSON payloads
  app.use(express.json());

  // API Proxy Route to bypass CORS on the browser with added validation & file logging
  app.get("/api/etf-holdings", async (req, res) => {
    const { stock_id } = req.query;
    if (!stock_id || typeof stock_id !== "string") {
      res.status(400).json({ error: "Missing stock_id query parameter" });
      return;
    }

    const cleanedStockId = stock_id.toUpperCase().trim();
    const apiUrl = `https://api.biggo.com/api/v1/finance/stock/etf/holdings?stock_id=${encodeURIComponent(cleanedStockId)}&size=100&region=tw`;

    try {
      console.log(`[Proxy] Fetching BigGo holdings for ${cleanedStockId}`);
      
      let apiResponse;
      try {
        apiResponse = await fetch(apiUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            "Referer": `https://finance.biggo.com.tw/quote/${cleanedStockId}/etf-holdings`
          },
          // 15 seconds request timeout
          signal: AbortSignal.timeout(15000)
        });
      } catch (dnsOrNetworkErr: any) {
        logErrorToFile("network_error", cleanedStockId, `Network connection or timeout failed to ${apiUrl}`, dnsOrNetworkErr.message);
        res.status(503).json({ 
          error: "網路連線失敗，無法連線至 BigGo API (可能發生網路超時或 DNS 異常)", 
          details: dnsOrNetworkErr.message 
        });
        return;
      }

      if (!apiResponse.ok) {
        const errText = `BigGo API returned HTTP status ${apiResponse.status}`;
        logErrorToFile("http_error", cleanedStockId, errText, `URL: ${apiUrl}`);
        res.status(502).json({ error: "來源伺服器回應異常碼", details: errText });
        return;
      }

      let data: any;
      try {
        data = await apiResponse.json();
      } catch (jsonErr: any) {
        logErrorToFile("parsing_error", cleanedStockId, `Failed to parse response JSON from BigGo API`, jsonErr.message);
        res.status(502).json({ error: "回應資料解析 JSON 失敗 (資料結構毀損)", details: jsonErr.message });
        return;
      }

      // Extract the nested 'data' field from the BigGo response if it exists (handles both flat and nested responses)
      let payload = data;
      if (data && data.data && typeof data.data === "object") {
        payload = data.data;
      }

      // Validate upstream structural integrity
      if (!payload || typeof payload !== "object") {
        const structErr = "Parsed API payload is not an object";
        logErrorToFile("structure_change", cleanedStockId, structErr, JSON.stringify(data).substring(0, 500));
        res.status(502).json({ error: "資料結構變更異常：API 傳回非物件結構" });
        return;
      }

      if (!payload.holdings) {
        const structErr = "API response is missing 'holdings' property. Upstream structure changes detected.";
        logErrorToFile("structure_change", cleanedStockId, structErr, JSON.stringify(data).substring(0, 500));
        res.status(502).json({ error: "資料結構變更異常：找不到 'holdings' 欄位，來源端可能已變更格式" });
        return;
      }

      if (!Array.isArray(payload.holdings)) {
        const structErr = "'holdings' property is not an array. Upstream api schema mismatch.";
        logErrorToFile("structure_change", cleanedStockId, structErr, JSON.stringify(data).substring(0, 500));
        res.status(502).json({ error: "資料結構變更異常：'holdings' 欄位格式不正確" });
        return;
      }

      // Sanitize fields to handle unexpected nulls or missing properties gracefully
      const sanitizedHoldings = payload.holdings.map((h: any, idx: number) => {
        let hasIssue = false;
        if (!h.holding_symbol) {
          h.holding_symbol = `UNKNOWN-${idx}`;
          hasIssue = true;
        }
        if (!h.holding_name) {
          h.holding_name = "未具名成分股";
          hasIssue = true;
        }
        if (h.weight === undefined || h.weight === null) {
          h.weight = 0;
          hasIssue = true;
        }
        if (hasIssue) {
          console.warn(`[Sanitation Warning] Cleaned null values for ${cleanedStockId} index ${idx}`);
        }
        return {
          holding_symbol: String(h.holding_symbol),
          holding_name: String(h.holding_name),
          weight: h.weight !== null ? Number(h.weight) : null,
          shares: h.shares !== undefined && h.shares !== null ? Number(h.shares) : null,
          market_value: h.market_value !== undefined && h.market_value !== null ? Number(h.market_value) : null,
          current_price: h.current_price !== undefined && h.current_price !== null ? Number(h.current_price) : null,
          daily_change: h.daily_change !== undefined && h.daily_change !== null ? Number(h.daily_change) : null,
          daily_change_percent: h.daily_change_percent !== undefined && h.daily_change_percent !== null ? Number(h.daily_change_percent) : null,
        };
      });

      // Construct flat client response
      const clientResponse = {
        as_of_date: payload.as_of_date || new Date().toISOString().substring(0, 10),
        holdings: sanitizedHoldings,
        region: payload.region || "tw",
        count: payload.count || sanitizedHoldings.length,
        data_source: payload.data_source || "unknown"
      };

      res.json(clientResponse);
    } catch (err: any) {
      console.error(`[Proxy Error] Fail to fetch holdings for ${cleanedStockId}:`, err.message);
      logErrorToFile("system_error", cleanedStockId, err.message, err.stack);
      res.status(500).json({ error: "Failed to scrape BigGo ETF holding data", details: err.message });
    }
  });

  // In-memory cache for BigGo stock quotes to avoid duplicate requests and rate limiting
  const quoteCache = new Map<string, { price: number; change_percent: number; status: string; timestamp: number }>();
  const CACHE_TTL = 30000; // 30 seconds cache TTL

  async function fetchBigGoQuoteCached(ticker: string): Promise<{ price: number; change_percent: number; status: string }> {
    const cleanTicker = ticker.toUpperCase().trim();
    const suffixTicker = cleanTicker.includes(".") ? cleanTicker : `${cleanTicker}.TW`;
    
    const cached = quoteCache.get(suffixTicker);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      return { price: cached.price, change_percent: cached.change_percent, status: cached.status };
    }

    const url = `https://finance.biggo.com.tw/quote/${encodeURIComponent(suffixTicker)}`;
    try {
      console.log(`[BigGo Scraper] Fetching HTML quote for: ${suffixTicker}`);
      const apiResponse = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://finance.biggo.com.tw/"
        },
        signal: AbortSignal.timeout(6000)
      });

      if (!apiResponse.ok) {
        throw new Error(`BigGo returned HTTP status ${apiResponse.status}`);
      }

      const html = await apiResponse.text();
      let description = "";

      // Match og:description or description content to extract high efficiency, pre-formatted SEO metrics
      const ogDescMatch = html.match(/<meta\s+property=["\']og:description["\']\s+content=["\']([^"\']+)["\']/i) ||
                          html.match(/<meta\s+name=["\']description["\']\s+content=["\']([^"\']+)["\']/i) ||
                          html.match(/<meta\s+content=["\']([^"\']+)["\']\s+property=["\']og:description["\']/i);

      if (ogDescMatch && ogDescMatch[1]) {
        description = ogDescMatch[1];
      }

      if (description) {
        // Extract 成交價 and 前一交易日收盤價
        const priceMatch = description.match(/成交價\s*([\d,.]+)/);
        const prevCloseMatch = description.match(/前一交易日收盤價\s*([\d,.]+)/);

        if (priceMatch) {
          const price = parseFloat(priceMatch[1].replace(/,/g, ""));
          const prevClose = prevCloseMatch ? parseFloat(prevCloseMatch[1].replace(/,/g, "")) : 0;
          let change_percent = 0;

          if (prevClose > 0) {
            change_percent = ((price - prevClose) / prevClose) * 100;
          }

          const result = {
            price,
            change_percent,
            status: "success"
          };

          quoteCache.set(suffixTicker, { ...result, timestamp: Date.now() });
          return result;
        }
      }

      throw new Error("Could not find price or description tags in the parsed BigGo HTML payload.");
    } catch (err: any) {
      console.warn(`[BigGo Scraper Warning] Failed to fetch price for ${suffixTicker}:`, err.message);
      
      // Serve expired cache as fallback rather than returning zero-price errors
      if (cached) {
        console.log(`[BigGo Cache Serve] Serving expired cache item as fallback for ${suffixTicker}`);
        return { price: cached.price, change_percent: cached.change_percent, status: "success" };
      }

      return {
        price: 0,
        change_percent: 0,
        status: "error"
      };
    }
  }

  // Real-time stock prices endpoint scraping the BigGo Finance Webpage
  app.get("/api/realtime-prices", async (req, res) => {
    const { symbols } = req.query;
    if (!symbols || typeof symbols !== "string") {
      res.status(400).json({ error: "Missing symbols query parameter" });
      return;
    }

    const symbolList = symbols.split(",").map(s => s.trim().toUpperCase()).filter(s => s !== "");
    if (symbolList.length === 0) {
      res.json({});
      return;
    }

    try {
      const pricesMap: Record<string, { price: number; change_percent: number; status: string }> = {};

      // Fetch all quotes in parallel using the cached BigGo HTML scraper
      await Promise.all(
        symbolList.map(async (sym) => {
          const base = sym.split(".")[0];
          const quote = await fetchBigGoQuoteCached(sym);
          pricesMap[sym] = quote;
          pricesMap[base] = quote;
        })
      );

      res.json(pricesMap);
    } catch (err: any) {
      console.error(`[Realtime Price Engine Error] BigGo query failed:`, err.message);
      logErrorToFile("realtime_price_error", "BIGGO", err.message, err.stack);
      
      const fallbackMap: Record<string, any> = {};
      symbolList.forEach(sym => {
        fallbackMap[sym] = { price: 0, change_percent: 0, status: "error" };
      });
      res.json(fallbackMap);
    }
  });

  // Scraping MoneyDJ Rank0001 page for returns across multiple periods
  app.get("/api/moneydj-returns", async (req, res) => {
    const eRank = String(req.query.eRank || "up");
    const eOrd = String(req.query.eOrd || "T800520");
    const ePeriod = String(req.query.ePeriod || "1W");

    const targetUrl = `https://www.moneydj.com/ETF/X/Rank/Rank0001.xdjhtm?eRank=${encodeURIComponent(eRank)}&eOrd=${encodeURIComponent(eOrd)}&ePeriod=${encodeURIComponent(ePeriod)}`;
    
    try {
      console.log(`[MoneyDJ Scraper] Fetching ETF ranks from: ${targetUrl}`);
      const apiResponse = await fetch(targetUrl, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
        signal: AbortSignal.timeout(15000)
      });

      if (!apiResponse.ok) {
        throw new Error(`MoneyDJ responded with HTTP status ${apiResponse.status}`);
      }

      const html = await apiResponse.text();
      const $ = cheerio.load(html);
      const results: any[] = [];

      // The table with ID ctl00_ctl00_MainContent_MainContent_gvTbl contains the rows
      let rows = $("table#ctl00_ctl00_MainContent_MainContent_gvTbl tr");
      if (rows.length === 0) {
        rows = $("table.datalist tr");
      }

      rows.each((idx, elem) => {
        const cells = $(elem).find("td").map((i, c) => $(c).text().trim()).get();
        // A valid data row must have at least 11 elements we parsed or at least starting with rank (numeric)
        if (cells.length >= 11) {
          const rankNum = parseInt(cells[2], 10);
          if (!isNaN(rankNum)) {
            results.push({
              rank: rankNum,
              symbol: cells[3] || "-",
              name: cells[4] || "-",
              date: cells[5] || "-",
              currency: cells[6] || "-",
              return_1d: cells[7] || "-",
              return_1w: cells[8] || "-",
              return_ytd: cells[9] || "-",
              return_1m: cells[10] || "-",
              return_3m: cells[11] || "-",
              return_6m: cells[12] || "-",
              return_1y: cells[13] || "-",
              return_3y: cells[14] || "-",
            });
          }
        }
      });

      console.log(`[MoneyDJ Scraper] Scraped ${results.length} ETF items successfully.`);
      res.json({
        url: targetUrl,
        timestamp: new Date().toISOString(),
        data: results
      });
    } catch (err: any) {
      console.error(`[MoneyDJ Scraper Error] Fail to scrape:`, err.message);
      logErrorToFile("moneydj_crawler_error", "MONEYDJ", err.message, err.stack);
      res.status(500).json({ error: "無法解析 MoneyDJ 報酬率排行網頁資料", details: err.message });
    }
  });

  // Scraping Google Finance page for 1-week relative news about a symbol
  app.get("/api/stock-news", async (req, res) => {
    const { symbol } = req.query;
    if (!symbol || typeof symbol !== "string") {
      res.status(400).json({ error: "Missing symbol query parameter" });
      return;
    }

    let gfSymbol = symbol.trim().toUpperCase();
    // Convert Yahoo-style TW codes to Google Finance format (CODE:TPE or CODE:TWO)
    if (gfSymbol.endsWith(".TW")) {
      gfSymbol = `${gfSymbol.slice(0, -3)}:TPE`;
    } else if (gfSymbol.endsWith(".TWO")) {
      gfSymbol = `${gfSymbol.slice(0, -4)}:TWO`;
    } else if (!gfSymbol.includes(":")) {
      gfSymbol = `${gfSymbol}:TPE`;
    }

    const url = `https://www.google.com/finance/quote/${gfSymbol}`;
    try {
      console.log(`[Google Finance Scraper] Crawling recent news for: ${gfSymbol} from ${url}`);
      const apiResponse = await fetch(url, {
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7"
        },
        signal: AbortSignal.timeout(10000)
      });

      if (!apiResponse.ok) {
        throw new Error(`Google Finance responded with HTTP status ${apiResponse.status}`);
      }

      const html = await apiResponse.text();
      const $ = cheerio.load(html);
      const newsItems: any[] = [];

      $("a").each((i, el) => {
        const href = $(el).attr("href") || "";
        const text = $(el).text().trim();
        
        const isNewsLink = href.includes("news") || href.includes("article") || href.includes("google.com/url") || href.startsWith("http");
        const isGoogleNav = href.includes("policies") || href.includes("accounts") || href.includes("support") || href.includes("google.com/playlists");
        
        if (isNewsLink && !isGoogleNav && text.length > 15) {
          const cleanText = text.replace(/\s+/g, ' ');
          
          let title = cleanText;
          let source = "Google Finance";
          let relativeTime = "近期新聞";

          // Try to split standard titles or extract fields
          let splitSymbols = [" | ", " - ", " · ", " • ", "｜"];
          let splitSuccess = false;
          
          for (const s of splitSymbols) {
            const parts = cleanText.split(s);
            if (parts.length >= 2) {
              title = parts[0];
              source = parts[1];
              relativeTime = parts[2] || "1 週內";
              splitSuccess = true;
              break;
            }
          }
          
          if (!splitSuccess) {
            // Check if trailing contains source
            const msnRegex = /msn\.com|yahoo|cna\.com|udn\.com|chinatimes|ettoday/i;
            const matches = cleanText.match(msnRegex);
            if (matches) {
              source = matches[0];
            }
          }

          // Avoid adding duplicate URLs or titles
          if (!newsItems.some(item => item.url === href || item.title === title.trim())) {
            newsItems.push({
              title: title.trim(),
              url: href,
              source: source.trim(),
              time: relativeTime.trim()
            });
          }
        }
      });

      console.log(`[Google Finance Scraper] Found ${newsItems.length} news articles for ${gfSymbol}`);
      res.json({
        symbol: gfSymbol,
        timestamp: new Date().toISOString(),
        news: newsItems.slice(0, 15)
      });
    } catch (err: any) {
      console.error(`[Google Finance Scraper Error] Failed to get news for ${gfSymbol}:`, err.message);
      logErrorToFile("news_scraper_error", symbol, err.message, err.stack);
      res.status(500).json({ error: "無法自 Google Finance 抓取相關新聞資料", details: err.message });
    }
  });

  // Log client-side or GCP exceptions to the local file
  app.post("/api/log-error", (req, res) => {
    const { stock_id, type, message, details } = req.body;
    logErrorToFile(type || "client_exception", stock_id || "SYSTEM", message || "Unknown exception", details);
    res.json({ status: "success", message: "Error log accepted" });
  });

  // Get compiled server error logs
  app.get("/api/scraping-errors", (req, res) => {
    try {
      if (!fs.existsSync(ERROR_LOG_PATH)) {
        res.json([]);
        return;
      }
      const data = fs.readFileSync(ERROR_LOG_PATH, "utf8");
      const lines = data.split("\n").filter(line => line.trim() !== "");
      const parsed = lines.map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return { timestamp: new Date().toISOString(), stock_id: "SYSTEM", type: "raw_log", message: line };
        }
      });
      // Return reverse order (newest first)
      res.json(parsed.reverse());
    } catch (err: any) {
      res.status(500).json({ error: "Failed to read server error log file", details: err.message });
    }
  });

  // Clear server error logs
  app.post("/api/scraping-errors/clear", (req, res) => {
    try {
      if (fs.existsSync(ERROR_LOG_PATH)) {
        fs.unlinkSync(ERROR_LOG_PATH);
      }
      res.json({ status: "success", message: "Scraping error logs cleared." });
    } catch (err: any) {
      res.status(500).json({ error: "Failed to delete error logs file", details: err.message });
    }
  });

  // Connection Diagnostics Sentinel Endpoint
  app.get("/api/connection-test", async (req, res) => {
    const targets = [
      {
        id: "biggo",
        name: "BigGo ETF 持股資料庫",
        url: "https://api.biggo.com/api/v1/finance/stock/etf/holdings?stock_id=0050&size=1&region=tw",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://finance.biggo.com.tw/"
        }
      },
      {
        id: "biggo_quote",
        name: "BigGo 即時報價網頁",
        url: "https://finance.biggo.com.tw/quote/2330.TW",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Referer": "https://finance.biggo.com.tw/"
        }
      },
      {
        id: "moneydj",
        name: "MoneyDJ 全球 ETF 資訊網",
        url: "https://www.moneydj.com/ETF/X/Rank/Rank0001.xdjhtm?eRank=up&eOrd=T800520&ePeriod=1W",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        }
      },
      {
        id: "google_finance",
        name: "Google Finance 市場即時輿情",
        url: "https://www.google.com/finance/quote/2330:TPE",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
          "Accept-Language": "zh-TW,zh;q=0.9,en-US;q=0.8,en;q=0.7"
        }
      }
    ];

    const results: Record<string, { status: "ok" | "error"; latency: number | null; message: string }> = {};

    await Promise.all(
      targets.map(async (target) => {
        const start = Date.now();
        try {
          const apiResponse = await fetch(target.url, {
            headers: target.headers,
            signal: AbortSignal.timeout(6000)
          });
          const latency = Date.now() - start;
          if (apiResponse.ok) {
            results[target.id] = {
              status: "ok",
              latency,
              message: `連線成功 (${latency}ms)`
            };
          } else {
            const msg = `HTTP 異常 ${apiResponse.status}`;
            logErrorToFile("connection_sentinel_alert", "DIAG", `Target ${target.name} returned ${msg}`, target.url);
            results[target.id] = {
              status: "error",
              latency: null,
              message: msg
            };
          }
        } catch (err: any) {
          const latency = Date.now() - start;
          const msg = err.name === "TimeoutError" || err.message.includes("timeout") ? "連線超時" : `連線失敗 (DNS 或網路異常)`;
          logErrorToFile("connection_sentinel_alert", "DIAG", `Target ${target.name} failed: ${err.message}`, target.url);
          results[target.id] = {
            status: "error",
            latency: null,
            message: `${msg}: ${err.message}`
          };
        }
      })
    );

    res.json({
      timestamp: new Date().toISOString(),
      results
    });
  });

  // Health-check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ status: "healthy", timestamp: new Date().toISOString() });
  });

  // Vite integration
  if (process.env.NODE_ENV !== "production") {
    console.log("[Server] Mounting Vite middleware in DEVELOPMENT mode...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("[Server] Mounting static folder in PRODUCTION mode...");
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
