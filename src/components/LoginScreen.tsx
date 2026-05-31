import React from 'react';
import { auth, googleProvider, signInWithPopup } from '../lib/firebase';
import { ShieldCheck, LogIn } from 'lucide-react';
import { motion } from 'motion/react';

export default function LoginScreen() {
  const handleGoogleLogin = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      console.error("Login failed:", error);
    }
  };

  return (
    <div className="min-h-screen bg-[#0D1117] flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-md bg-[#161B22] border border-[#30363D] rounded-2xl p-8 shadow-2xl relative overflow-hidden"
      >
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
            <p className="text-gray-500 text-sm">請先登入以開始您的個人化市場掃描與持股管理</p>
          </div>

          <button
            onClick={handleGoogleLogin}
            className="w-full flex items-center justify-center gap-3 bg-white hover:bg-gray-100 text-black py-3.5 px-6 rounded-xl font-bold transition-all shadow-md active:scale-[0.98]"
          >
            <img src="https://www.google.com/favicon.ico" alt="Google" className="w-4 h-4" />
            使用 Google 帳號登入
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
