import React, { useState } from 'react';
import { auth, googleProvider, signInWithPopup } from '../lib/firebase';
import { ShieldCheck, X, AlertCircle } from 'lucide-react';
import { motion } from 'motion/react';

interface LoginScreenProps {
  isModal?: boolean;
  onClose?: () => void;
}

export default function LoginScreen({ isModal, onClose }: LoginScreenProps) {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleGoogleLogin = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // Use signInWithPopup but handle common iframe errors
      await signInWithPopup(auth, googleProvider);
      if (onClose) onClose();
    } catch (error: any) {
      console.error("Login failed:", error);
      if (error.code === 'auth/popup-blocked') {
        setErrorMsg("彈出視窗被瀏覽器攔截，請允許此網站開啟彈出視窗。");
      } else if (error.code === 'auth/popup-closed-by-user') {
        setErrorMsg("登入視窗已被關閉。");
      } else if (error.code === 'auth/cancelled-popup-request') {
        // Ignored
      } else {
        setErrorMsg("登入失敗：" + (error.message || "未知錯誤"));
      }
    } finally {
      setLoading(false);
    }
  };

  const containerClass = isModal ? "" : "min-h-screen bg-[#0D1117] flex items-center justify-center p-4";

  return (
    <div className={containerClass}>
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-[#161B22] border border-[#30363D] rounded-2xl p-8 shadow-2xl relative overflow-hidden"
      >
        {isModal && (
          <button 
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-500 hover:text-gray-300 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}

        {/* Abstract Background Accents */}
        <div className="absolute -top-24 -right-24 w-48 h-48 bg-indigo-500/10 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-emerald-500/10 rounded-full blur-3xl"></div>

        <div className="text-center space-y-6 relative z-10">
          <div className="flex justify-center">
            <div className="w-16 h-16 rounded-2xl bg-indigo-600/20 flex items-center justify-center border border-indigo-500/30">
              <ShieldCheck className="w-8 h-8 text-indigo-400" />
            </div>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-black text-gray-100 tracking-tight">59LiHi 大師投資系統</h1>
            <p className="text-gray-500 text-sm">
              {isModal ? "請登入以執行市場掃描並同步您的個人數據" : "請先登入以開始您的個人化市場掃描與持股管理"}
            </p>
          </div>

          {errorMsg && (
            <div className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-lg flex items-center gap-2 text-rose-400 text-xs text-left">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <button
            onClick={handleGoogleLogin}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-black py-3.5 px-6 rounded-xl font-bold transition-all shadow-md active:scale-[0.98] disabled:opacity-50"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-slate-300 border-t-slate-800 rounded-full animate-spin"></div>
            ) : (
              <>
                <img src="https://www.google.com/favicon.ico" alt="Google" className="w-4 h-4" />
                使用 Google 帳號登入
              </>
            )}
          </button>

          <div className="pt-6 border-t border-slate-800">
            <p className="text-[10px] text-gray-600 uppercase font-black tracking-widest leading-relaxed">
              Powered by Antigravity AI & Firebase<br />
              Secure individual cloud sessions
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
