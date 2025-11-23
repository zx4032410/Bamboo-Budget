import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';
import { Plus, Loader2, Trash2, ArrowLeft, Calendar, ChevronRight, Plane, Briefcase, Settings, Sprout, LogOut, User, Lightbulb, AlertCircle, Sun, Moon, Monitor, Wallet, PieChart, ChevronDown, ChevronUp, Link as LinkIcon } from 'lucide-react';
import AddExpenseModal from './components/AddExpenseModal';
import ExpenseCard from './components/ExpenseCard';
import WelcomeModal from './components/WelcomeModal';
import { Trip, Expense, ViewState, ThemeMode } from './types';
import * as Storage from './services/storageService';
import { auth, googleProvider } from './firebaseConfig';
import { signInAnonymously, onAuthStateChanged, linkWithPopup, signOut, signInWithPopup, signInWithCredential, GoogleAuthProvider, User as FirebaseUser } from 'firebase/auth';

// --- Types for List ---
type ListItem =
    | { type: 'HEADER'; date: string; total: number; isCollapsed: boolean }
    | { type: 'EXPENSE'; expense: Expense };

interface RowActions {
    expandedIds: Set<string>;
    toggleExpand: (id: string) => void;
    toggleDateCollapse: (date: string) => void;
    onToggleRepaid: (expense: Expense) => void;
    onEdit: (expense: Expense) => void;
    onDelete: (id: string) => void;
}

// --- Settings View Component ---
interface SettingsViewProps {
    theme: ThemeMode;
    onThemeChange: (mode: ThemeMode) => void;
    user: FirebaseUser | null;
}

const SettingsView: React.FC<SettingsViewProps> = ({ theme, onThemeChange, user }) => {
    const [isLinking, setIsLinking] = useState(false);
    const [linkError, setLinkError] = useState<string | null>(null);
    const [userApiKey, setUserApiKey] = useState(Storage.getUserApiKey() || '');
    const [isEditingKey, setIsEditingKey] = useState(false);

    const handleLinkGoogle = async () => {
        if (!user) return;
        setIsLinking(true);
        setLinkError(null);
        try {
            await linkWithPopup(user, googleProvider);
            // Success! The anonymous account is now a Google account.
            alert("帳號連結成功！您的訪客資料現在已與 Google 帳號永久綁定。");
            Storage.saveLoginPreference('google');
        } catch (error: any) {
            console.error("Linking error details:", error);

            // Check if Google account is already linked to another user
            if (error.code === 'auth/credential-already-in-use') {
                try {
                    console.log("Google 帳號已被綁定，開始資料遷移...");

                    // Step 1: Get all guest data BEFORE switching accounts
                    const guestTrips = await Storage.fetchTrips();
                    const allGuestExpenses: Expense[] = [];

                    // Fetch all expenses for all trips
                    for (const trip of guestTrips) {
                        const expenses = await Storage.fetchExpensesForTrip(trip.id);
                        allGuestExpenses.push(...expenses);
                    }

                    console.log(`獲取到 ${guestTrips.length} 個旅程, ${allGuestExpenses.length} 筆支出`);

                    // Step 2: Extract credential from error
                    const credential = GoogleAuthProvider.credentialFromError(error);
                    if (!credential) {
                        throw new Error("無法獲取 Google 認證資訊");
                    }

                    // Step 3: Sign in with the Google account
                    const result = await signInWithCredential(auth, credential);
                    const googleUser = result.user;

                    console.log(`已登入 Google 帳號: ${googleUser.email}`);

                    // Step 4: Migrate data - create ID mapping for trips
                    const tripIdMap: Record<string, string> = {};

                    // Migrate trips
                    for (const trip of guestTrips) {
                        const newTripId = uuidv4();
                        tripIdMap[trip.id] = newTripId; // Map old ID to new ID

                        const migratedTrip: Trip = {
                            ...trip,
                            id: newTripId,
                            userId: googleUser.uid
                        };

                        await Storage.saveTrip(migratedTrip);
                    }

                    // Migrate expenses
                    for (const expense of allGuestExpenses) {
                        const newTripId = tripIdMap[expense.tripId];
                        if (!newTripId) {
                            console.warn(`找不到 tripId ${expense.tripId} 的映射，跳過此支出`);
                            continue;
                        }

                        const migratedExpense: Expense = {
                            ...expense,
                            id: uuidv4(),
                            userId: googleUser.uid,
                            tripId: newTripId
                        };

                        await Storage.saveExpense(migratedExpense);
                    }

                    // Step 5: Update login preference
                    Storage.saveLoginPreference('google');

                    // Success!
                    alert(`資料遷移成功！\n\n已將 ${guestTrips.length} 個旅程和 ${allGuestExpenses.length} 筆支出從訪客帳號遷移到您的 Google 帳號。\n\n頁面將重新載入以顯示所有資料。`);

                    // Reload to show merged data
                    window.location.reload();

                } catch (migrationError: any) {
                    console.error("資料遷移失敗:", migrationError);
                    setLinkError(`資料遷移過程出錯：${migrationError.message || "未知錯誤"}\n\n請稍後再試，或聯繫客服協助。`);
                }
            } else {
                // Handle other errors
                let errorMessage = `連結失敗 (${error.code || 'Unknown'})`;

                if (error.code === 'auth/popup-closed-by-user') {
                    errorMessage = "登入視窗已關閉，或被瀏覽器攔截。";
                } else if (error.code === 'auth/cancelled-popup-request') {
                    errorMessage = "偵測到重複的登入請求，請稍後再試。";
                } else if (error.code === 'auth/unauthorized-domain') {
                    errorMessage = `網域權限錯誤。\n\n目前網址：${window.location.hostname}\n\n1. 請確認 Firebase Console > Authentication > Settings > Authorized domains 已包含上方網址 (完全一致)。\n2. 若剛新增，請等待 5-10 分鐘讓設定生效。\n3. 請重新整理網頁後再試。`;
                } else if (error.code === 'auth/operation-not-allowed') {
                    errorMessage = "Google 登入功能未啟用。請至 Firebase Console > Authentication > Sign-in method 開啟 Google 登入提供者。";
                } else if (error.message) {
                    errorMessage = `錯誤：${error.message}`;
                }

                setLinkError(errorMessage);
            }
        } finally {
            setIsLinking(false);
        }
    };

    const handleSignOut = async () => {
        if (window.confirm("確定要登出嗎？")) {
            await signOut(auth);
            // App component will handle re-login anonymously
        }
    };

    return (
        <div className="max-w-md mx-auto min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col transition-colors">
            <header className="p-6 pt-12">
                <div className="flex items-center gap-3 mb-1">
                    <div className="bg-slate-200 dark:bg-slate-800 p-2 rounded-xl text-slate-700 dark:text-slate-200">
                        <Settings size={32} />
                    </div>
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">設定</h1>
                </div>
            </header>

            <main className="px-6 flex-1">

                {/* Account Section */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-800 mb-6">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">帳號設定</h3>

                    {user ? (
                        <div className="space-y-4">
                            <div className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                                <div className={`p-2 rounded-full ${user.isAnonymous ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>
                                    <User size={20} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="font-medium text-slate-900 dark:text-white truncate">
                                        {user.isAnonymous ? "訪客 (未備份)" : (user.displayName || user.email)}
                                    </div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">
                                        {user.isAnonymous ? "資料僅儲存於此裝置" : "資料已同步至雲端"}
                                    </div>
                                </div>
                            </div>

                            {user.isAnonymous ? (
                                <div className="space-y-2">
                                    <button
                                        onClick={handleLinkGoogle}
                                        disabled={isLinking}
                                        className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors shadow-lg shadow-blue-500/30"
                                    >
                                        {isLinking ? <Loader2 size={20} className="animate-spin" /> : <LinkIcon size={20} />}
                                        備份資料 (連結 Google)
                                    </button>
                                    <p className="text-xs text-slate-400 text-center px-2">
                                        連結後，您的訪客資料將會保留，並可於其他裝置登入存取。
                                    </p>
                                    {linkError && (
                                        <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs rounded-lg flex items-start gap-2">
                                            <AlertCircle size={14} className="shrink-0 mt-0.5" />
                                            {/* whitespace-pre-wrap ensures newlines in error message are respected */}
                                            <span className="break-all whitespace-pre-wrap">{linkError}</span>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <button
                                    onClick={handleSignOut}
                                    className="w-full py-3 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 rounded-xl font-medium flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                >
                                    <LogOut size={20} />
                                    登出
                                </button>
                            )}
                        </div>
                    ) : (
                        <div className="text-center py-4">
                            <Loader2 size={24} className="animate-spin mx-auto text-primary" />
                        </div>
                    )}
                </div>

                {/* API Usage Section */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-800 mb-6">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-2">AI 功能設定</h3>

                    {/* API Key Input */}
                    <div className="mb-4">
                        <label className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 block">
                            Gemini API Key（選填）
                        </label>
                        <div className="flex gap-2">
                            <input
                                type={isEditingKey ? "text" : "password"}
                                placeholder="填寫您的 API Key 即可無限制使用"
                                value={userApiKey}
                                onChange={(e) => setUserApiKey(e.target.value)}
                                className="flex-1 px-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary"
                            />
                            <button
                                onClick={() => setIsEditingKey(!isEditingKey)}
                                className="px-3 py-2 bg-slate-200 dark:bg-slate-700 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600"
                                title={isEditingKey ? "隱藏" : "顯示"}
                            >
                                {isEditingKey ? '👁️' : '🔒'}
                            </button>
                        </div>
                        <div className="flex gap-2 mt-2">
                            <button
                                onClick={() => {
                                    Storage.saveUserApiKey(userApiKey);
                                    alert('✅ API Key 已儲存！\n\n現在您可以無限制使用 AI 功能。');
                                }}
                                disabled={!userApiKey.trim()}
                                className="flex-1 px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {Storage.hasUserApiKey() ? '更新' : '儲存'}
                            </button>
                            <button
                                onClick={() => {
                                    if (confirm('確定要清除已儲存的 API Key 嗎？\n\n清除後將恢復使用共享額度（2次/天）。')) {
                                        Storage.clearUserApiKey();
                                        setUserApiKey('');
                                        alert('✅ API Key 已清除');
                                    }
                                }}
                                disabled={!Storage.hasUserApiKey()}
                                className="px-4 py-2 bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                清除
                            </button>
                        </div>
                        <p className="text-xs text-slate-400 dark:text-slate-600 mt-2">
                            <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                                🔗 前往 Google AI Studio 取得 API Key
                            </a>
                        </p>
                    </div>


                    {/* Usage Status */}
                    {(() => {
                        if (Storage.hasUserApiKey()) {
                            return (
                                <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl">
                                    <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
                                        <span className="text-2xl">✅</span>
                                        <div>
                                            <div className="font-bold">使用您自己的 API Key</div>
                                            <div className="text-sm">無使用次數限制</div>
                                        </div>
                                    </div>
                                </div>
                            );
                        } else if (user?.email === 'zx4032410@gmail.com') {
                            return (
                                <div className="p-4 bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-xl">
                                    <div className="flex items-center gap-2 text-purple-700 dark:text-purple-400">
                                        <span className="text-2xl">👑</span>
                                        <div>
                                            <div className="font-bold">管理員模式</div>
                                            <div className="text-sm">無使用次數限制</div>
                                        </div>
                                    </div>
                                </div>
                            );
                        } else {
                            return (
                                <>
                                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                                        共享額度：每日 2 次
                                    </p>
                                    <div className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                                        <div>
                                            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">今日使用狀態</div>
                                            <div className="font-bold text-slate-900 dark:text-white">
                                                已用 {Storage.getApiUsageToday()} / 2 次
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">剩餘額度</div>
                                            <div className={`font-bold text-2xl ${Storage.getRemainingApiCalls() > 0 ? 'text-primary' : 'text-orange-500'}`}>
                                                {Storage.getRemainingApiCalls()}
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-xs text-slate-400 dark:text-slate-600 mt-3">
                                        💡 每日午夜自動重置
                                    </p>
                                </>
                            );
                        }
                    })()}
                </div>

                {/* Appearance Section */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 shadow-sm border border-slate-100 dark:border-slate-800 mb-6">
                    <h3 className="text-lg font-bold text-slate-800 dark:text-white mb-4">外觀顯示</h3>

                    <div className="space-y-3">
                        {/* Light Mode */}
                        <button
                            onClick={() => onThemeChange('light')}
                            className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${theme === 'light'
                                ? 'border-primary bg-primary/5 text-primary'
                                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                                }`}
                        >
                            <div className="flex items-center gap-3">
                                <Sun size={20} />
                                <span className="font-medium">淺色模式</span>
                            </div>
                            {theme === 'light' && <div className="w-3 h-3 rounded-full bg-primary"></div>}
                        </button>

                        {/* Dark Mode */}
                        <button
                            onClick={() => onThemeChange('dark')}
                            className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${theme === 'dark'
                                ? 'border-primary bg-primary/5 text-primary'
                                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                                }`}
                        >
                            <div className="flex items-center gap-3">
                                <Moon size={20} />
                                <span className="font-medium">深色模式</span>
                            </div>
                            {theme === 'dark' && <div className="w-3 h-3 rounded-full bg-primary"></div>}
                        </button>

                        {/* System Mode */}
                        <button
                            onClick={() => onThemeChange('system')}
                            className={`w-full flex items-center justify-between p-3 rounded-xl border transition-all ${theme === 'system'
                                ? 'border-primary bg-primary/5 text-primary'
                                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800'
                                }`}
                        >
                            <div className="flex items-center gap-3">
                                <Monitor size={20} />
                                <span className="font-medium">依系統設定</span>
                            </div>
                            {theme === 'system' && <div className="w-3 h-3 rounded-full bg-primary"></div>}
                        </button>
                    </div>
                </div>

                <div className="text-center text-xs text-slate-400 dark:text-slate-600 mt-8">
                    Bamboo Budget v1.4.2 (Offline Capable)
                </div>
            </main>
        </div>
    );
};

// --- Trip Detail Component ---
interface TripDetailViewProps {
    trip: Trip;
    expenses: Expense[];
    isLoading: boolean;
    onBack: () => void;
    onAddExpense: () => void;
    onEditExpense: (expense: Expense) => void;
    onDeleteExpense: (id: string) => void;
    onToggleRepaid: (expense: Expense) => void;
}

// Row Component
const ExpenseRow: React.FC<{ item: ListItem; actions: RowActions }> = ({ item, actions }) => {
    const { expandedIds, toggleExpand, toggleDateCollapse, onToggleRepaid, onEdit, onDelete } = actions;

    if (item.type === 'HEADER') {
        return (
            <div className="px-4 pt-2 pb-1">
                <div
                    className="flex items-center justify-between py-2 px-2 cursor-pointer select-none hover:bg-slate-100/50 dark:hover:bg-slate-800/50 rounded-lg transition-colors"
                    onClick={() => toggleDateCollapse(item.date)}
                >
                    <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-600 dark:text-slate-300 text-sm tracking-wide">
                            {format(new Date(item.date), 'yyyy/MM/dd')}
                        </span>
                        <span className="text-xs text-slate-400 dark:text-slate-500 font-medium">
                            ${Math.round(item.total).toLocaleString()}
                        </span>
                    </div>
                    <div className="text-slate-400 dark:text-slate-500">
                        {item.isCollapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
                    </div>
                </div>
            </div>
        );
    } else {
        return (
            <div className="px-4 mb-3">
                <ExpenseCard
                    expense={item.expense}
                    isExpanded={expandedIds.has(item.expense.id)}
                    onToggleExpand={() => toggleExpand(item.expense.id)}
                    onToggleRepaid={onToggleRepaid}
                    onEdit={onEdit}
                    onDelete={onDelete}
                />
            </div>
        );
    }
};

const TripDetailView: React.FC<TripDetailViewProps> = ({
    trip,
    expenses,
    isLoading,
    onBack,
    onAddExpense,
    onEditExpense,
    onDeleteExpense,
    onToggleRepaid
}) => {
    // UI State specific to this view
    const [collapsedDates, setCollapsedDates] = useState<Record<string, boolean>>({});
    const [expandedExpenseIds, setExpandedExpenseIds] = useState<Set<string>>(new Set());

    // Stats
    const totalSpent = expenses.reduce((sum, e) => sum + e.myShareTWD, 0);
    const totalOwedToMe = expenses.reduce((sum, e) => e.isRepaid ? sum : sum + e.debtAmountTWD, 0);

    // 1. Group expenses
    const groupedExpenses = useMemo(() => {
        const groups: Record<string, Expense[]> = {};
        expenses.forEach(expense => {
            try {
                const dateKey = format(new Date(expense.date), 'yyyy-MM-dd');
                if (!groups[dateKey]) {
                    groups[dateKey] = [];
                }
                groups[dateKey].push(expense);
            } catch (e) {
                // Handle invalid dates gracefully
                console.warn("Invalid date for expense", expense);
            }
        });
        return groups;
    }, [expenses]);

    const sortedDateKeys = Object.keys(groupedExpenses).sort((a, b) => b.localeCompare(a));

    // 2. Flatten to Items
    const flatItems: ListItem[] = useMemo(() => {
        const items: ListItem[] = [];
        sortedDateKeys.forEach(dateKey => {
            const dayExpenses = groupedExpenses[dateKey];
            const dayTotal = dayExpenses.reduce((sum, e) => sum + e.totalTWD, 0);
            const isCollapsed = collapsedDates[dateKey];

            items.push({
                type: 'HEADER',
                date: dateKey,
                total: dayTotal,
                isCollapsed: !!isCollapsed
            });

            if (!isCollapsed) {
                dayExpenses.forEach(expense => {
                    items.push({ type: 'EXPENSE', expense });
                });
            }
        });
        return items;
    }, [groupedExpenses, sortedDateKeys, collapsedDates]);

    // Handlers
    const toggleDateCollapse = (dateKey: string) => {
        setCollapsedDates(prev => ({ ...prev, [dateKey]: !prev[dateKey] }));
    };

    const toggleExpenseExpand = (id: string) => {
        setExpandedExpenseIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    };

    // Prepare data for the rows
    const rowActions: RowActions = {
        expandedIds: expandedExpenseIds,
        toggleExpand: toggleExpenseExpand,
        toggleDateCollapse,
        onToggleRepaid,
        onEdit: onEditExpense,
        onDelete: onDeleteExpense
    };

    return (
        <div className="max-w-md mx-auto min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col h-screen transition-colors">
            {/* Header */}
            <header className="bg-white dark:bg-slate-900 px-4 pt-4 pb-4 z-20 border-b border-slate-100 dark:border-slate-800 shadow-sm flex-shrink-0 transition-colors">
                <div className="flex items-center gap-3 mb-3">
                    <button
                        onClick={onBack}
                        className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-full transition-colors"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <h1 className="font-bold text-lg truncate text-slate-900 dark:text-slate-100">{trip.name}</h1>
                </div>

                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-900 dark:bg-slate-800 text-white p-3 rounded-xl shadow-lg shadow-slate-200 dark:shadow-none transition-colors">
                        <div className="text-xs text-slate-400 mb-1 flex items-center gap-1">
                            <Wallet size={12} /> 個人總支出
                        </div>
                        <div className="text-xl font-bold tracking-tight">
                            ${Math.round(totalSpent).toLocaleString()}
                        </div>
                    </div>
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-3 rounded-xl transition-colors">
                        <div className="text-xs text-slate-500 dark:text-slate-400 mb-1 flex items-center gap-1">
                            <PieChart size={12} /> 待收回款項
                        </div>
                        <div className="text-xl font-bold text-accent tracking-tight">
                            ${Math.round(totalOwedToMe).toLocaleString()}
                        </div>
                    </div>
                </div>
            </header>

            {/* Content */}
            <main className="flex-1 flex flex-col overflow-hidden relative">

                <div className="flex-shrink-0 flex items-center justify-between mb-2 px-5 pt-4">
                    <h2 className="font-bold text-slate-700 dark:text-slate-300 text-sm">消費明細</h2>
                    <div className="flex items-center gap-2">
                        {isLoading && <Loader2 size={14} className="animate-spin text-primary" />}
                        <span className="text-xs text-slate-400 dark:text-slate-500">{expenses.length} 筆紀錄</span>
                    </div>
                </div>

                <div className="flex-1 w-full overflow-y-auto">
                    {expenses.length === 0 ? (
                        <div className="text-center py-12 text-slate-400 dark:text-slate-600">
                            {isLoading ? (
                                <div className="flex flex-col items-center">
                                    <Loader2 size={24} className="animate-spin mb-2" />
                                    <p>讀取中...</p>
                                </div>
                            ) : (
                                <>
                                    <p>還沒有消費紀錄</p>
                                    <p className="text-sm mt-2">點擊 + 按鈕新增第一筆消費</p>
                                </>
                            )}
                        </div>
                    ) : (
                        <div className="pb-24 pt-2">
                            {flatItems.map((item) => (
                                <ExpenseRow
                                    key={item.type === 'HEADER' ? `header-${item.date}` : item.expense.id}
                                    item={item}
                                    actions={rowActions}
                                />
                            ))}
                        </div>
                    )}
                </div>
            </main>

            {/* FAB */}
            <button
                onClick={onAddExpense}
                className="fixed bottom-6 right-6 w-14 h-14 bg-primary text-white rounded-full shadow-xl flex items-center justify-center hover:bg-emerald-600 active:scale-90 transition-all z-30"
            >
                <Plus size={28} />
            </button>
        </div>
    );
};

// --- Main App Component ---

const App: React.FC = () => {
    // State
    const [user, setUser] = useState<FirebaseUser | null>(null);
    const [authLoading, setAuthLoading] = useState(true);
    const [showWelcome, setShowWelcome] = useState(false);

    const [view, setView] = useState<ViewState>('HOME');
    const [trips, setTrips] = useState<Trip[]>([]);
    const [activeTripId, setActiveTripId] = useState<string | null>(null);
    const [expenses, setExpenses] = useState<Expense[]>([]);
    const [theme, setTheme] = useState<ThemeMode>(Storage.getThemePreference());

    // Derived state
    const activeTrip = useMemo(() => trips.find(t => t.id === activeTripId), [trips, activeTripId]);

    // Loading States
    const [isLoadingTrips, setIsLoadingTrips] = useState(false);
    const [isLoadingExpenses, setIsLoadingExpenses] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    // Modals
    const [isAddTripOpen, setIsAddTripOpen] = useState(false);
    const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
    const [editingExpense, setEditingExpense] = useState<Expense | null>(null);

    // Delete Trip Confirmation State
    const [tripToDelete, setTripToDelete] = useState<string | null>(null);

    // Form State for New Trip
    const [newTripName, setNewTripName] = useState('');
    const [newTripStart, setNewTripStart] = useState('');
    const [newTripEnd, setNewTripEnd] = useState('');
    const [addTripError, setAddTripError] = useState<string | null>(null);

    // --- Auth & Initial Data Loading ---
    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
            if (currentUser) {
                // User is signed in (anonymous or real)
                setUser(currentUser);
                setAuthLoading(false);
                setShowWelcome(false);
                // Load trips immediately
                setIsLoadingTrips(true);
                try {
                    const fetchedTrips = await Storage.fetchTrips();
                    setTrips(fetchedTrips);
                } catch (e) {
                    console.error("Failed to load trips", e);
                } finally {
                    setIsLoadingTrips(false);
                }
            } else {
                // No user - check login preference
                const loginPref = Storage.getLoginPreference();

                if (loginPref && loginPref.type === 'anonymous') {
                    // Auto sign in anonymously
                    try {
                        await signInAnonymously(auth);
                    } catch (error) {
                        console.error("Anonymous Auth Failed", error);
                        setAuthLoading(false);
                        setShowWelcome(true);
                    }
                } else {
                    // First time or was Google user - show welcome screen
                    setAuthLoading(false);
                    setShowWelcome(true);
                }
            }
        });

        return () => unsubscribe();
    }, []);

    // Theme Effect
    useEffect(() => {
        const root = window.document.documentElement;
        const isDark = theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);

        if (isDark) {
            root.classList.add('dark');
        } else {
            root.classList.remove('dark');
        }
        Storage.saveThemePreference(theme);
    }, [theme]);

    // System Theme Listener
    useEffect(() => {
        if (theme !== 'system') return;

        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        const handleChange = () => {
            const root = window.document.documentElement;
            if (mediaQuery.matches) root.classList.add('dark');
            else root.classList.remove('dark');
        };

        mediaQuery.addEventListener('change', handleChange);
        return () => mediaQuery.removeEventListener('change', handleChange);
    }, [theme]);

    // Load expenses when entering a trip
    useEffect(() => {
        if (activeTripId && user) {
            const loadExpenses = async () => {
                setIsLoadingExpenses(true);
                try {
                    const tripExpenses = await Storage.fetchExpensesForTrip(activeTripId);
                    setExpenses(tripExpenses);
                } catch (e) {
                    console.error("Failed to load expenses", e);
                } finally {
                    setIsLoadingExpenses(false);
                }
            };
            loadExpenses();
        }
    }, [activeTripId, user]);

    const handleCreateTrip = async () => {
        if (!newTripName) {
            setAddTripError("請輸入旅程名稱");
            return;
        }
        if (!user) return;

        if (newTripStart && newTripEnd) {
            if (newTripEnd < newTripStart) {
                setAddTripError("結束日期不能早於開始日期");
                return;
            }
        }

        setIsSaving(true);
        try {
            const trip: Trip = {
                id: uuidv4(),
                userId: user.uid, // Explicitly set, though service handles it too
                name: newTripName,
                startDate: newTripStart || new Date().toISOString(),
                endDate: newTripEnd || new Date().toISOString()
            };

            await Storage.saveTrip(trip);
            setTrips(prev => [...prev, trip]);
            setIsAddTripOpen(false);
            setNewTripName('');
            setNewTripStart('');
            setNewTripEnd('');
            setAddTripError(null);
        } catch (e) {
            setAddTripError("建立失敗，請稍後再試");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteTrip = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setTripToDelete(id);
    }

    const confirmDeleteTrip = async () => {
        if (tripToDelete) {
            try {
                await Storage.deleteTrip(tripToDelete);
                setTrips(prev => prev.filter(t => t.id !== tripToDelete));
            } catch (e) {
                alert("刪除失敗");
            } finally {
                setTripToDelete(null);
            }
        }
    }

    const openTrip = (id: string) => {
        setActiveTripId(id);
        setView('TRIP_DETAIL');
    };

    const handleOpenAddExpense = useCallback(() => {
        setEditingExpense(null);
        setIsAddExpenseOpen(true);
    }, []);

    const handleOpenEditExpense = useCallback((expense: Expense) => {
        setEditingExpense(expense);
        setIsAddExpenseOpen(true);
    }, []);

    const handleSaveExpense = async (expense: Expense) => {
        try {
            if (editingExpense) {
                await Storage.updateExpense(expense);
                setExpenses(prev => prev.map(e => e.id === expense.id ? expense : e));
            } else {
                await Storage.saveExpense(expense);
                setExpenses(prev => [expense, ...prev]);
            }
            // Re-sort
            setExpenses(prev => [...prev].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
        } catch (e) {
            alert("儲存失敗");
        }
    };

    const handleDeleteExpense = useCallback(async (id: string) => {
        if (window.confirm("確定要刪除這筆明細嗎？")) {
            try {
                await Storage.deleteExpense(id);
                setExpenses(prev => prev.filter(e => e.id !== id));
            } catch (e) {
                alert("刪除失敗");
            }
        }
    }, []);

    const toggleRepayment = useCallback(async (expense: Expense) => {
        const updated = { ...expense, isRepaid: !expense.isRepaid };
        try {
            await Storage.updateExpense(updated);
            setExpenses(prev => prev.map(e => e.id === updated.id ? updated : e));
        } catch (e) {
            alert("更新狀態失敗");
        }
    }, []);

    // --- Login Handlers for Welcome Screen ---
    const handleAnonymousLogin = async () => {
        try {
            await signInAnonymously(auth);
            Storage.saveLoginPreference('anonymous');
            // onAuthStateChanged will trigger and hide welcome screen
        } catch (error) {
            console.error("Anonymous login failed:", error);
            throw error; // Let WelcomeModal handle the error display
        }
    };

    const handleGoogleLogin = async () => {
        try {
            await signInWithPopup(auth, googleProvider);
            Storage.saveLoginPreference('google');
            // onAuthStateChanged will trigger and hide welcome screen
        } catch (error) {
            console.error("Google login failed:", error);
            throw error; // Let WelcomeModal handle the error display
        }
    };

    // --- Views ---

    const renderHome = () => (
        <div className="max-w-md mx-auto min-h-screen flex flex-col pb-20">
            <header className="p-6 pt-12">
                <div className="flex items-center gap-3 mb-1">
                    <div className="bg-primary/10 dark:bg-primary/20 p-2 rounded-xl text-primary">
                        <Sprout size={32} />
                    </div>
                    <h1 className="text-3xl font-black text-slate-800 dark:text-white tracking-tight">Bamboo Budget</h1>
                </div>
                <p className="text-slate-500 dark:text-slate-400 pl-1">像竹子一樣靈活、強韌的記帳助手</p>
            </header>

            <main className="flex-1 px-6 pb-24">
                {authLoading ? (
                    <div className="flex flex-col items-center justify-center h-64">
                        <Loader2 size={32} className="animate-spin text-primary mb-2" />
                        <p className="text-slate-500">初始化中...</p>
                    </div>
                ) : isLoadingTrips ? (
                    <div className="flex flex-col items-center justify-center h-64 opacity-60">
                        <Loader2 size={32} className="animate-spin text-primary mb-2" />
                        <p className="text-slate-500">讀取資料中...</p>
                    </div>
                ) : trips.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-center opacity-60">
                        <Plane size={48} className="mb-4 text-slate-300 dark:text-slate-600" />
                        <p className="text-slate-500 dark:text-slate-400">還沒有行程</p>
                        <p className="text-sm text-slate-400 dark:text-slate-500">點擊下方按鈕開始規劃</p>
                    </div>
                ) : (
                    <div className="space-y-8">
                        {Object.keys(trips.reduce((acc, t) => {
                            const y = new Date(t.startDate).getFullYear() || 'Other';
                            if (!acc[y]) acc[y] = []; acc[y].push(t); return acc;
                        }, {} as Record<string, Trip[]>))
                            .sort((a, b) => Number(b) - Number(a))
                            .map(year => (
                                <div key={year}>
                                    <h2 className="text-2xl font-bold text-slate-300 dark:text-slate-700 mb-4 ml-1">{year}</h2>
                                    <div className="space-y-4">
                                        {trips
                                            .filter(t => (new Date(t.startDate).getFullYear() || 'Other').toString() === year)
                                            .sort((a, b) => new Date(b.startDate).getTime() - new Date(a.startDate).getTime())
                                            .map(trip => (
                                                <div
                                                    key={trip.id}
                                                    onClick={() => openTrip(trip.id)}
                                                    className="group relative bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden cursor-pointer active:scale-[0.99] transition-all hover:shadow-md"
                                                >
                                                    <div className="absolute right-0 top-0 w-32 h-32 bg-gradient-to-br from-primary/5 to-primary/10 dark:from-primary/10 dark:to-primary/20 rounded-full -mr-10 -mt-10 transition-transform group-hover:scale-110 pointer-events-none"></div>

                                                    <div className="relative z-10 p-5">
                                                        <div className="flex justify-between items-start mb-4">
                                                            <div className="bg-emerald-100 dark:bg-emerald-900/30 p-3 rounded-xl text-emerald-600 dark:text-emerald-400">
                                                                <Plane size={24} />
                                                            </div>
                                                            <button
                                                                onClick={(e) => handleDeleteTrip(e, trip.id)}
                                                                className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-full transition-colors -mr-2 -mt-2 z-20"
                                                                title="刪除行程"
                                                            >
                                                                <Trash2 size={20} />
                                                            </button>
                                                        </div>

                                                        <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-1 pr-8 line-clamp-1">{trip.name}</h3>

                                                        <div className="flex items-center justify-between mt-4">
                                                            <div className="flex items-center text-slate-500 dark:text-slate-400 text-sm gap-1.5 bg-slate-50 dark:bg-slate-800/50 px-2 py-1 rounded-lg">
                                                                <Calendar size={14} />
                                                                <span>{format(new Date(trip.startDate), 'yyyy/MM/dd')}</span>
                                                                <span className="mx-1">-</span>
                                                                <span>{format(new Date(trip.endDate), 'MM/dd')}</span>
                                                            </div>

                                                            <div className="text-slate-300 dark:text-slate-600 group-hover:text-primary dark:group-hover:text-primary transition-colors">
                                                                <ChevronRight size={20} />
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            ))}
                                    </div>
                                </div>
                            ))}
                    </div>
                )}
            </main>

            <button
                onClick={() => { setIsAddTripOpen(true); setAddTripError(null); }}
                className="fixed bottom-24 right-6 w-14 h-14 bg-slate-900 dark:bg-slate-700 text-white rounded-full shadow-xl flex items-center justify-center hover:bg-slate-800 dark:hover:bg-slate-600 active:scale-90 transition-all z-20"
            >
                <Plus size={28} />
            </button>

            {/* Add Trip Modal */}
            {isAddTripOpen && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl p-6 animate-fade-in-up shadow-2xl border border-slate-100 dark:border-slate-800">
                        <h2 className="text-xl font-bold mb-4 text-slate-900 dark:text-white">新旅程</h2>
                        <input
                            className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl mb-3 focus:ring-2 focus:ring-primary focus:outline-none transition-colors"
                            placeholder="旅程名稱 (例: 東京五日遊)"
                            value={newTripName}
                            onChange={e => { setNewTripName(e.target.value); if (addTripError) setAddTripError(null); }}
                            autoFocus
                        />
                        <div className="flex flex-col gap-3 mb-6">
                            <div>
                                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 ml-1">開始日期</label>
                                <input
                                    type="date"
                                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm transition-colors"
                                    value={newTripStart}
                                    onChange={e => { setNewTripStart(e.target.value); if (addTripError) setAddTripError(null); }}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-500 dark:text-slate-400 mb-1 ml-1">結束日期</label>
                                <input
                                    type="date"
                                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm transition-colors"
                                    value={newTripEnd}
                                    onChange={e => { setNewTripEnd(e.target.value); if (addTripError) setAddTripError(null); }}
                                />
                            </div>
                        </div>

                        {addTripError && (
                            <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800 rounded-xl flex items-center gap-2 text-red-600 dark:text-red-400 text-sm animate-fade-in">
                                <AlertCircle size={16} />
                                <span>{addTripError}</span>
                            </div>
                        )}

                        <div className="flex gap-3">
                            <button
                                onClick={() => { setIsAddTripOpen(false); setAddTripError(null); }}
                                disabled={isSaving}
                                className="flex-1 py-3 rounded-xl font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={handleCreateTrip}
                                disabled={isSaving}
                                className="flex-1 py-3 rounded-xl font-bold bg-primary text-white hover:bg-emerald-600 transition-colors flex items-center justify-center gap-2"
                            >
                                {isSaving && <Loader2 size={16} className="animate-spin" />}
                                建立
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Delete Trip Confirmation Modal */}
            {tripToDelete && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
                    <div className="bg-white dark:bg-slate-900 w-full max-w-sm rounded-2xl p-6 animate-fade-in-up shadow-2xl border border-slate-100 dark:border-slate-800">
                        <h2 className="text-xl font-bold mb-2 text-slate-900 dark:text-white">刪除行程</h2>
                        <p className="text-slate-600 dark:text-slate-300 mb-6">是否刪除行程？</p>

                        <div className="flex gap-3">
                            <button
                                onClick={() => setTripToDelete(null)}
                                className="flex-1 py-3 rounded-xl font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                            >
                                取消
                            </button>
                            <button
                                onClick={confirmDeleteTrip}
                                className="flex-1 py-3 rounded-xl font-bold bg-red-500 text-white hover:bg-red-600 transition-colors shadow-lg shadow-red-500/30"
                            >
                                確認
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );

    const BottomNav = () => (
        <div className="fixed bottom-0 left-0 right-0 bg-white dark:bg-slate-950 border-t border-slate-100 dark:border-slate-800 p-2 pb-safe z-40 flex justify-around items-center transition-colors">
            <button
                onClick={() => setView('HOME')}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all w-20 ${view === 'HOME' ? 'text-primary' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}
            >
                <Briefcase size={24} className={view === 'HOME' ? 'fill-current' : ''} strokeWidth={view === 'HOME' ? 2.5 : 2} />
                <span className="text-[10px] font-medium">行程</span>
            </button>
            <button
                onClick={() => setView('SETTINGS')}
                className={`flex flex-col items-center gap-1 p-2 rounded-xl transition-all w-20 ${view === 'SETTINGS' ? 'text-primary' : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'}`}
            >
                <Settings size={24} className={view === 'SETTINGS' ? 'fill-current' : ''} strokeWidth={view === 'SETTINGS' ? 2.5 : 2} />
                <span className="text-[10px] font-medium">設定</span>
            </button>
        </div>
    );


    return (
        <>
            {/* Welcome Screen */}
            {showWelcome && (
                <WelcomeModal
                    onAnonymousLogin={handleAnonymousLogin}
                    onGoogleLogin={handleGoogleLogin}
                />
            )}

            {view === 'HOME' && renderHome()}

            {view === 'SETTINGS' && (
                <SettingsView theme={theme} onThemeChange={setTheme} user={user} />
            )}

            {view === 'TRIP_DETAIL' && activeTrip && (
                <TripDetailView
                    trip={activeTrip}
                    expenses={expenses}
                    isLoading={isLoadingExpenses}
                    onBack={() => setView('HOME')}
                    onAddExpense={handleOpenAddExpense}
                    onEditExpense={handleOpenEditExpense}
                    onDeleteExpense={handleDeleteExpense}
                    onToggleRepaid={toggleRepayment}
                />
            )}

            {/* Bottom Nav - Only show on main screens */}
            {(view === 'HOME' || view === 'SETTINGS') && <BottomNav />}

            <AddExpenseModal
                isOpen={isAddExpenseOpen}
                tripId={activeTripId!}
                onClose={() => setIsAddExpenseOpen(false)}
                onSave={handleSaveExpense}
                initialData={editingExpense}
            />

            {/* Global Styles for Animations */}
            <style>{`
            @keyframes fade-in-up {
                from { opacity: 0; transform: translateY(20px); }
                to { opacity: 1; transform: translateY(0); }
            }
            @keyframes fade-in {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            .animate-fade-in-up {
                animation: fade-in-up 0.3s ease-out forwards;
            }
            .animate-fade-in {
                animation: fade-in 0.3s ease-out forwards;
            }
            /* Safe area support for iPhones without home button */
            .pb-safe {
                padding-bottom: env(safe-area-inset-bottom, 20px);
            }
        `}</style>
        </>
    );
};

export default App;