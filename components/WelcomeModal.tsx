import React, { useState } from 'react';
import { LogIn, User, Loader2, AlertCircle } from 'lucide-react';

interface WelcomeModalProps {
    onAnonymousLogin: () => Promise<void>;
    onGoogleLogin: () => Promise<void>;
}

const WelcomeModal: React.FC<WelcomeModalProps> = ({ onAnonymousLogin, onGoogleLogin }) => {
    const [isLoading, setIsLoading] = useState(false);
    const [loadingType, setLoadingType] = useState<'anonymous' | 'google' | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleAnonymousClick = async () => {
        setIsLoading(true);
        setLoadingType('anonymous');
        setError(null);
        try {
            await onAnonymousLogin();
        } catch (err: any) {
            console.error("Anonymous login error:", err);
            setError("訪客登入失敗，請重試");
            setIsLoading(false);
            setLoadingType(null);
        }
    };

    const handleGoogleClick = async () => {
        setIsLoading(true);
        setLoadingType('google');
        setError(null);
        try {
            await onGoogleLogin();
        } catch (err: any) {
            console.error("Google login error:", err);

            let errorMessage = "Google 登入失敗";

            if (err.code === 'auth/popup-closed-by-user') {
                errorMessage = "登入視窗已關閉";
            } else if (err.code === 'auth/popup-blocked') {
                errorMessage = "彈出視窗被瀏覽器攔截，請允許彈出視窗";
            } else if (err.code === 'auth/cancelled-popup-request') {
                errorMessage = "偵測到重複的登入請求";
            } else if (err.code === 'auth/unauthorized-domain') {
                errorMessage = `網域未授權。請至 Firebase Console 加入：${window.location.hostname}`;
            } else if (err.message) {
                errorMessage = err.message;
            }

            setError(errorMessage);
            setIsLoading(false);
            setLoadingType(null);
        }
    };

    return (
        <div className="fixed inset-0 bg-gradient-to-br from-emerald-50 via-white to-slate-50 dark:from-slate-950 dark:via-slate-900 dark:to-slate-950 z-50 flex items-center justify-center p-6 transition-colors">
            <div className="w-full max-w-md">
                {/* Logo and Title */}
                <div className="text-center mb-8 animate-fade-in">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-gradient-to-br from-primary to-emerald-600 rounded-3xl mb-6 shadow-2xl shadow-primary/30">
                        <svg className="w-12 h-12 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 2L12 22M8 6C8 6 6 8 6 12C6 16 8 18 8 18M16 6C16 6 18 8 18 12C18 16 16 18 16 18" />
                        </svg>
                    </div>
                    <h1 className="text-4xl font-black text-slate-800 dark:text-white mb-3 tracking-tight">
                        Bamboo Budget
                    </h1>
                    <p className="text-slate-500 dark:text-slate-400 text-lg">
                        像竹子一樣靈活、強韌的記帳助手
                    </p>
                </div>

                {/* Login Options */}
                <div className="space-y-4 mb-6">
                    {/* Google Login */}
                    <button
                        onClick={handleGoogleClick}
                        disabled={isLoading}
                        className="w-full group relative overflow-hidden bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 hover:border-blue-500 dark:hover:border-blue-500 rounded-2xl p-5 transition-all hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-blue-500/0 via-blue-500/5 to-blue-500/0 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="relative flex items-center gap-4">
                            <div className="flex-shrink-0 w-12 h-12 bg-blue-50 dark:bg-blue-900/30 rounded-xl flex items-center justify-center text-blue-600 dark:text-blue-400 group-hover:scale-110 transition-transform">
                                {loadingType === 'google' ? (
                                    <Loader2 size={24} className="animate-spin" />
                                ) : (
                                    <LogIn size={24} />
                                )}
                            </div>
                            <div className="flex-1 text-left">
                                <div className="font-bold text-slate-800 dark:text-white text-lg mb-1">
                                    Google 登入
                                </div>
                                <div className="text-sm text-slate-500 dark:text-slate-400">
                                    資料同步雲端，可跨裝置使用
                                </div>
                            </div>
                        </div>
                    </button>

                    {/* Anonymous Login */}
                    <button
                        onClick={handleAnonymousClick}
                        disabled={isLoading}
                        className="w-full group relative overflow-hidden bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 hover:border-primary dark:hover:border-primary rounded-2xl p-5 transition-all hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-primary/0 via-primary/5 to-primary/0 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        <div className="relative flex items-center gap-4">
                            <div className="flex-shrink-0 w-12 h-12 bg-slate-100 dark:bg-slate-800 rounded-xl flex items-center justify-center text-slate-600 dark:text-slate-300 group-hover:scale-110 transition-transform">
                                {loadingType === 'anonymous' ? (
                                    <Loader2 size={24} className="animate-spin" />
                                ) : (
                                    <User size={24} />
                                )}
                            </div>
                            <div className="flex-1 text-left">
                                <div className="font-bold text-slate-800 dark:text-white text-lg mb-1">
                                    直接開始
                                </div>
                                <div className="text-sm text-slate-500 dark:text-slate-400">
                                    訪客模式，資料僅存本機
                                </div>
                            </div>
                        </div>
                    </button>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl flex items-start gap-3 text-red-600 dark:text-red-400 animate-fade-in">
                        <AlertCircle size={20} className="flex-shrink-0 mt-0.5" />
                        <p className="text-sm">{error}</p>
                    </div>
                )}

                {/* Info Text */}
                <p className="text-center text-xs text-slate-400 dark:text-slate-600 px-4">
                    選擇「直接開始」後，您仍可在設定中綁定 Google 帳號備份資料
                </p>
            </div>
        </div>
    );
};

export default WelcomeModal;
