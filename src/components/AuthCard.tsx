import React from 'react';
import { User } from 'firebase/auth';
import { LogOut } from 'lucide-react';

interface AuthCardProps {
  user: User | null;
  needsAuth: boolean;
  onLogin: () => void;
  onLogout: () => void;
  isLoggingIn: boolean;
}

export const AuthCard: React.FC<AuthCardProps> = ({
  user,
  needsAuth,
  onLogin,
  onLogout,
  isLoggingIn
}) => {
  return (
    <div className="bg-[#0D0D0F] rounded-sm border border-[#2A2A2E] p-5 flex flex-col justify-between h-full" id="auth_card_container">
      <div>
        <h3 className="font-semibold text-xs text-[#D4AF37] uppercase tracking-[0.2em] font-mono">Google 身分授權</h3>
        <p className="text-xs text-gray-400 mt-2 leading-relaxed">
          爬蟲同步資料庫與發送 Gmail 通知，需要取得您的 Google Sheet 及 Gmail 送信權限。
        </p>

        {user ? (
          <div className="mt-4 p-3 bg-[#161618] border border-[#2A2A2E] rounded-sm flex items-center gap-3">
            {user.photoURL ? (
              <img src={user.photoURL} alt="Avatar" className="w-10 h-10 rounded-full border border-[#D4AF37]/50" referrerPolicy="no-referrer" />
            ) : (
              <div className="w-10 h-10 rounded-full bg-[#8A6D3B] flex items-center justify-center font-bold text-black text-sm">
                {user.displayName?.charAt(0) || user.email?.charAt(0) || 'G'}
              </div>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold text-[#E0E0E0] truncate font-serif italic">{user.displayName || 'Google 使用者'}</p>
              <p className="text-[11px] text-gray-500 truncate font-mono">{user.email}</p>
            </div>
          </div>
        ) : (
          <div className="mt-4 p-4 border border-dashed border-[#2A2A2E] rounded-sm text-center bg-[#161618]/40">
            <span className="text-[10px] font-mono text-[#D4AF37] uppercase tracking-wider block">🔒 OFFLINE-MODE</span>
            <span className="text-xs text-gray-500 block mt-1">請登入以串接 Google 試算表 & Gmail</span>
          </div>
        )}
      </div>

      <div className="mt-6">
        {user ? (
          <button
            onClick={onLogout}
            className="w-full bg-[#161618] text-[#E0E0E0] hover:text-[#D4AF37] hover:border-[#D4AF37]/70 text-xs font-medium py-2.5 px-4 rounded-sm flex items-center justify-center gap-2 border border-[#2A2A2E] shadow transition-all cursor-pointer font-sans"
            id="google_logout_button"
          >
            <LogOut className="w-4 h-4 text-rose-500" />
            中斷 Google 授權與登出
          </button>
        ) : (
          <button
            onClick={onLogin}
            disabled={isLoggingIn}
            className="gsi-material-button w-full flex items-center justify-center cursor-pointer font-sans disabled:opacity-50"
            id="google_login_button"
          >
            <div className="gsi-material-button-state"></div>
            <div className="gsi-material-button-content-wrapper">
              <div className="gsi-material-button-icon">
                <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" style={{ display: 'block' }}>
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
                  <path fill="none" d="M0 0h48v48H0z"></path>
                </svg>
              </div>
              <span className="gsi-material-button-contents text-xs font-semibold text-slate-800">登入 Google 帳戶</span>
            </div>
          </button>
        )}
      </div>

      <style>{`
        .gsi-material-button {
          -moz-user-select: none;
          -webkit-user-select: none;
          -ms-user-select: none;
          -webkit-appearance: none;
          background-color: #f2f2f2;
          background-image: none;
          border: none;
          -webkit-border-radius: 4px;
          border-radius: 4px;
          -webkit-box-sizing: border-box;
          box-sizing: border-box;
          color: #1f1f1f;
          cursor: pointer;
          font-family: inherit;
          font-size: 14px;
          font-weight: 500;
          height: 40px;
          letter-spacing: 0.25px;
          outline: none;
          overflow: hidden;
          padding: 0 12px;
          position: relative;
          text-align: center;
          transition: background-color .218s, border-color .218s, box-shadow .218s;
          vertical-align: middle;
          white-space: nowrap;
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .gsi-material-button .gsi-material-button-icon {
          height: 20px;
          min-width: 20px;
          width: 20px;
        }

        .gsi-material-button .gsi-material-button-content-wrapper {
          align-items: center;
          display: flex;
          flex-direction: row;
          height: 100%;
          justify-content: center;
          position: relative;
          width: 100%;
          gap: 12px;
        }

        .gsi-material-button .gsi-material-button-contents {
          flex-grow: 1;
          text-align: center;
          white-space: nowrap;
        }

        .gsi-material-button .gsi-material-button-state {
          -webkit-transition: opacity .218s;
          transition: opacity .218s;
          bottom: 0;
          left: 0;
          opacity: 0;
          position: absolute;
          right: 0;
          top: 0;
        }

        .gsi-material-button:hover {
          -webkit-box-shadow: 0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15);
          box-shadow: 0 1px 2px 0 rgba(60,64,67,0.3), 0 1px 3px 1px rgba(60,64,67,0.15);
          background-color: #f5f5f5;
        }

        .gsi-material-button:active {
          background-color: #e3e3e3;
        }

        .gsi-material-button:disabled {
          background-color: #e3e3e3;
          opacity: 0.5;
          cursor: not-allowed;
        }
      `}</style>
    </div>
  );
};
