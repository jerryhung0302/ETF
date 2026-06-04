import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User, Auth } from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';
import { Holding, ETFDiff } from './types';

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

const provider = new GoogleAuthProvider();
// Request Google Workspace Sheets and Gmail scopes
provider.addScope('https://www.googleapis.com/auth/spreadsheets');
provider.addScope('https://www.googleapis.com/auth/gmail.send');

// Setup permissions for custom accounts
provider.setCustomParameters({
  prompt: 'select_account'
});

let isSigningIn = false;
let cachedAccessToken: string | null = null;

export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else {
        // Since Firebase token listener doesn't immediately hold credential accessToken, 
        // we'll rely on our state. But if cached is null, request sign in again
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('Failed to get access token from Firebase Auth');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Sign in error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

export const logout = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

// ==========================================
// GOOGLE SHEETS API UTILITIES
// ==========================================

export async function createETFSpreadsheet(token: string): Promise<string> {
  const url = "https://sheets.googleapis.com/v4/spreadsheets";
  const body = {
    properties: {
      title: "台股 ETF 成分股追蹤資料庫 (Taiwan ETF Holdings Tracker)"
    },
    sheets: [
      {
        properties: {
          title: "Tracked ETFs",
          gridProperties: { rowCount: 100, columnCount: 10 }
        }
      },
      {
        properties: {
          title: "Change History Log",
          gridProperties: { rowCount: 1000, columnCount: 10 }
        }
      }
    ]
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create spreadsheet: ${text}`);
  }

  const data = await response.json();
  const sheetId = data.spreadsheetId;

  // Initialize headers for Summary and Logs
  await initializeMainHeaders(token, sheetId);

  return sheetId;
}

async function initializeMainHeaders(token: string, sheetId: string) {
  // Update "Tracked ETFs" page headers
  await updateSheetValues(token, sheetId, "'Tracked ETFs'!A1:F1", [
    ["ETF 代號", "ETF 名稱", "總成分股數量", "最後更新時間", "今日變動 (新增/刪除/權重異動)", "工作表狀態"]
  ]);

  // Update "Change History Log" page headers
  await updateSheetValues(token, sheetId, "'Change History Log'!A1:H1", [
    ["變動日期", "ETF 代號", "變動類型 (新增/刪除/權重調整)", "成分股代號", "成分股名稱", "舊權重 (%)", "新權重 (%)", "權重變動 (%)"]
  ]);
}

export async function createTabIfNotExist(token: string, sheetId: string, tabName: string) {
  // First, check spreadsheet tabs
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}?fields=sheets.properties.title`;
  const response = await fetch(url, {
    headers: { "Authorization": `Bearer ${token}` }
  });

  if (!response.ok) return;
  const data = await response.json();
  const sheets = data.sheets || [];
  const exists = sheets.some((s: any) => s.properties.title === tabName);

  if (!exists) {
    // Add sheet tab via batchUpdate
    const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}:batchUpdate`;
    const body = {
      requests: [
        {
          addSheet: {
            properties: {
              title: tabName,
              gridProperties: { rowCount: 500, columnCount: 10 }
            }
          }
        }
      ]
    };
    await fetch(updateUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(body)
    });
  }
}

export async function updateSheetValues(
  token: string,
  sheetId: string,
  range: string,
  values: any[][]
) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;
  const response = await fetch(url, {
    method: "PUT",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ values })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to update sheet values at range ${range}: ${text}`);
  }
}

export async function appendValuesToSheet(
  token: string,
  sheetId: string,
  range: string,
  values: any[][]
) {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ values })
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to append sheet values at ${range}: ${text}`);
  }
}

export async function readValuesFromSheet(
  token: string,
  sheetId: string,
  range: string
): Promise<any[][] | null> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${encodeURIComponent(range)}`;
  const response = await fetch(url, {
    headers: { "Authorization": `Bearer ${token}` }
  });
  if (!response.ok) return null;
  const data = await response.json();
  return data.values || null;
}

// Write standard holdings array to an ETF's specific tab sheet
export async function writeHoldingsToTab(
  token: string,
  sheetId: string,
  tabName: string,
  holdings: Holding[],
  asOfDate: string
) {
  // First, verify tab exists
  await createTabIfNotExist(token, sheetId, tabName);

  // Clear or overwrite sheet. We will overwrite from raw A1 header
  const rows = [
    ["排名", "成分股代號", "成分股名稱", "今日權重 (%)", "持有股數", "市值 (TWD)", "當前股價", "每日漲跌 (%)", "更新日期"],
    ...holdings.map((h, index) => [
      index + 1,
      h.holding_symbol,
      h.holding_name,
      h.weight !== null ? h.weight : "",
      h.shares !== null ? h.shares : "",
      h.market_value !== null ? h.market_value : "",
      h.current_price !== null ? h.current_price : "",
      h.daily_change_percent !== null ? h.daily_change_percent : "",
      asOfDate
    ])
  ];

  // We write the complete table range. For safety we clear the range or write a large batch
  await updateSheetValues(token, sheetId, `'${tabName}'!A1:I${rows.length}`, rows);
}

// Write MoneyDJ Period Returns to a specific tab sheet
export async function writeMoneyDJReturnsToTab(
  token: string,
  sheetId: string,
  tabName: string,
  returnsList: any[],
  asOfDate: string
) {
  // First, verify tab exists
  await createTabIfNotExist(token, sheetId, tabName);

  // Clear or overwrite sheet. We will overwrite from raw A1 header
  const rows = [
    ["排名", "ETF代號", "ETF名稱", "更新日期", "幣別", "一日報酬 (%)", "一週報酬 (%)", "今年以來 (%)", "一個月 (%)", "三個月 (%)", "六個月 (%)", "一年 (%)", "三年 (%)"],
    ...returnsList.map((item) => [
      item.rank,
      item.symbol,
      item.name,
      item.date || asOfDate,
      item.currency,
      item.return_1d,
      item.return_1w,
      item.return_ytd,
      item.return_1m,
      item.return_3m,
      item.return_6m,
      item.return_1y,
      item.return_3y
    ])
  ];

  await updateSheetValues(token, sheetId, `'${tabName}'!A1:M${rows.length}`, rows);
}

// ==========================================
// GMAIL API UTILITIES
// ==========================================

export async function sendGmailAlert(
  token: string,
  toEmails: string,
  subject: string,
  htmlBody: string
) {
  const makeRawEmail = (to: string[], subj: string, body: string) => {
    const emailParts = [
      `To: ${to.join(', ')}`,
      `Subject: =?utf-8?B?${btoa(unescape(encodeURIComponent(subj)))}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: 7bit',
      '',
      body,
    ];
    const email = emailParts.join('\r\n');
    return btoa(unescape(encodeURIComponent(email)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  };

  const recipientList = toEmails.split(",").map(e => e.trim()).filter(Boolean);
  if (recipientList.length === 0) {
    throw new Error("No recipients specified.");
  }

  const raw = makeRawEmail(recipientList, subject, htmlBody);
  const response = await fetch("https://gmail.googleapis.com/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ raw })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to send Gmail: ${text}`);
  }
}
