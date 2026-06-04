export interface Holding {
  holding_symbol: string;
  holding_name: string;
  weight: number | null;
  shares: number | null;
  market_value: number | null;
  current_price: number | null;
  daily_change: number | null;
  daily_change_percent: number | null;
  exists?: boolean;
}

export interface ETFHoldingsResponse {
  holdings: Holding[];
  as_of_date: string;
}

export interface ETFDiff {
  etfId: string;
  date: string;
  added: Holding[];
  removed: Holding[];
  changed: {
    symbol: string;
    name: string;
    oldWeight: number | null;
    newWeight: number | null;
    diff: number;
  }[];
}

export interface CrawlerLog {
  id: string;
  timestamp: string;
  etfId: string;
  status: "success" | "failed";
  message: string;
  diffSummary?: {
    addedCount: number;
    removedCount: number;
    changedCount: number;
  };
}

export interface AppConfig {
  sheetId: string;
  recipientEmails: string;
  recipientName: string;
  autoSendEmail: boolean;
  trackedETFs: string[]; // e.g. ["0050.TW", "0056.TW", "00878.TW"]
}
