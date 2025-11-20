import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import { Plus, Plane, Calendar, ChevronRight, Wallet, ArrowLeft, PieChart, ChevronDown, ChevronUp, Sprout } from 'lucide-react';
import { format } from 'date-fns';
import { Trip, Expense, ViewState } from './types';
import * as Storage from './services/storageService';
import ExpenseCard from './components/ExpenseCard';
import AddExpenseModal from './components/AddExpenseModal';
import { VariableSizeList as List } from 'react-window';

// --- Hook for responsive dimensions ---
const useContainerDimensions = (myRef: React.RefObject<HTMLDivElement | null>) => {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const getDimensions = () => ({
      width: myRef.current ? myRef.current.offsetWidth : 0,
      height: myRef.current ? myRef.current.offsetHeight : 0
    });

    const handleResize = () => {
      setDimensions(getDimensions());
    };

    if (myRef.current) {
      setDimensions(getDimensions());
    }

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [myRef]);

  return dimensions;
};

// --- Types for Virtual List ---
type ListItem = 
  | { type: 'HEADER'; date: string; total: number; isCollapsed: boolean }
  | { type: 'EXPENSE'; expense: Expense };

// --- Trip Detail Component ---
interface TripDetailViewProps {
    trip: Trip;
    expenses: Expense[];
    onBack: () => void;
    onAddExpense: () => void;
    onEditExpense: (expense: Expense) => void;
    onDeleteExpense: (id: string) => void;
    onToggleRepaid: (expense: Expense) => void;
}

const TripDetailView: React.FC<TripDetailViewProps> = ({
    trip,
    expenses,
    onBack,
    onAddExpense,
    onEditExpense,
    onDeleteExpense,
    onToggleRepaid
}) => {
    // UI State specific to this view
    const [collapsedDates, setCollapsedDates] = useState<Record<string, boolean>>({});
    const [expandedExpenseIds, setExpandedExpenseIds] = useState<Set<string>>(new Set());
    
    // Refs for Virtualization
    const listRef = useRef<List>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const { width: containerWidth, height: containerHeight } = useContainerDimensions(containerRef);

    // Stats
    const totalSpent = expenses.reduce((sum, e) => sum + e.myShareTWD, 0);
    const totalOwedToMe = expenses.reduce((sum, e) => e.isRepaid ? sum : sum + e.debtAmountTWD, 0);

    // 1. Group expenses
    const groupedExpenses = useMemo(() => {
        const groups: Record<string, Expense[]> = {};
        expenses.forEach(expense => {
            const dateKey = format(new Date(expense.date), 'yyyy-MM-dd');
            if (!groups[dateKey]) {
                groups[dateKey] = [];
            }
            groups[dateKey].push(expense);
        });
        return groups;
    }, [expenses]);

    const sortedDateKeys = Object.keys(groupedExpenses).sort((a, b) => b.localeCompare(a));

    // 2. Flatten to Virtual Items
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

    // 3. Height Calculation Logic
    const getItemSize = useCallback((index: number) => {
        const item = flatItems[index];
        if (item.type === 'HEADER') {
            return 50; // Header height
        } else {
            // Expense Card Height Calculation
            // Base card (padding + title + amount + icons + footer): Fixed height for ALL collapsed items
            let height = 125; 
            
            // Expanded items section
            if (expandedExpenseIds.has(item.expense.id)) {
                const itemsCount = item.expense.items.length;
                // Title + Padding: 40px
                // Per item: ~56px
                height += 40 + (itemsCount * 56); 
                
                // Add height for Split Info ONLY if expanded
                if (item.expense.splitCount > 1) {
                    height += 100; // Height of split info section + padding
                }
            }

            return height;
        }
    }, [flatItems, expandedExpenseIds]);

    // Handlers
    const toggleDateCollapse = (dateKey: string) => {
        setCollapsedDates(prev => {
            const next = { ...prev, [dateKey]: !prev[dateKey] };
            if (listRef.current) listRef.current.resetAfterIndex(0);
            return next;
        });
    };

    const toggleExpenseExpand = (id: string) => {
        setExpandedExpenseIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            if (listRef.current) {
               listRef.current.resetAfterIndex(0);
            }
            return next;
        });
    };
    
    // Reset list cache when expenses change (e.g. add/edit/delete)
    useEffect(() => {
        if (listRef.current) {
            listRef.current.resetAfterIndex(0);
        }
    }, [expenses]);

    // Row Render
    const Row = ({ index, style }: { index: number; style: React.CSSProperties }) => {
        const item = flatItems[index];
        
        // Add some padding to the row content within the virtual container
        const gutterStyle = {
            ...style,
            left: Number(style.left) + 16, // padding-left equivalent
            width: Number(style.width) - 32, // total width minus horizontal padding
            height: Number(style.height) - 12 // margin-bottom equivalent
        };

        if (item.type === 'HEADER') {
            const headerStyle = {
                ...style,
                left: Number(style.left) + 16,
                width: Number(style.width) - 32,
            };

            return (
              <div style={headerStyle}>
                  <div 
                      className="flex items-center justify-between py-2 px-1 cursor-pointer select-none hover:bg-slate-100/50 dark:hover:bg-slate-800/50 rounded-lg transition-colors h-full"
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
                <ExpenseCard 
                    style={gutterStyle}
                    expense={item.expense} 
                    isExpanded={expandedExpenseIds.has(item.expense.id)}
                    onToggleExpand={() => toggleExpenseExpand(item.expense.id)}
                    onToggleRepaid={onToggleRepaid}
                    onEdit={onEditExpense}
                    onDelete={onDeleteExpense}
                />
            );
        }
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
                <span className="text-xs text-slate-400 dark:text-slate-500">{expenses.length} 筆紀錄</span>
            </div>

            <div className="flex-1 w-full" ref={containerRef}>
                {expenses.length === 0 ? (
                    <div className="text-center py-12 text-slate-400 dark:text-slate-600">
                        <p>還沒有消費紀錄</p>
                        <p className="text-sm mt-2">點擊 + 按鈕新增第一筆消費</p>
                    </div>
                ) : (
                    <List
                        ref={listRef}
                        height={containerHeight}
                        itemCount={flatItems.length}
                        itemSize={getItemSize}
                        width={containerWidth}
                        overscanCount={2}
                    >
                        {Row}
                    </List>
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
  const [view, setView] = useState<ViewState>('HOME');
  const [trips, setTrips] = useState<Trip[]>([]);
  const [activeTripId, setActiveTripId] = useState<string | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  
  // Modals
  const [isAddTripOpen, setIsAddTripOpen] = useState(false);
  const [isAddExpenseOpen, setIsAddExpenseOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  
  // Form State for New Trip
  const [newTripName, setNewTripName] = useState('');
  const [newTripStart, setNewTripStart] = useState('');
  const [newTripEnd, setNewTripEnd] = useState('');

  // Load data on mount
  useEffect(() => {
    setTrips(Storage.getTrips());
  }, []);

  // Load expenses when entering a trip
  useEffect(() => {
    if (activeTripId) {
      const tripExpenses = Storage.getExpensesForTrip(activeTripId);
      // Sort by date descending (newest first)
      tripExpenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setExpenses(tripExpenses);
    }
  }, [activeTripId]);

  const handleCreateTrip = () => {
    if (!newTripName) return;
    const trip: Trip = {
      id: uuidv4(),
      name: newTripName,
      startDate: newTripStart || new Date().toISOString(),
      endDate: newTripEnd || new Date().toISOString()
    };
    Storage.saveTrip(trip);
    setTrips([...trips, trip]);
    setIsAddTripOpen(false);
    setNewTripName('');
    setNewTripStart('');
    setNewTripEnd('');
  };

  const handleDeleteTrip = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("確定要刪除這個行程嗎？所有相關的記帳資料也會消失。")) {
        Storage.deleteTrip(id);
        setTrips(trips.filter(t => t.id !== id));
    }
  }

  const openTrip = (id: string) => {
    setActiveTripId(id);
    setView('TRIP_DETAIL');
  };

  const handleOpenAddExpense = () => {
      setEditingExpense(null);
      setIsAddExpenseOpen(true);
  };

  const handleOpenEditExpense = (expense: Expense) => {
      setEditingExpense(expense);
      setIsAddExpenseOpen(true);
  };

  const handleSaveExpense = (expense: Expense) => {
    const existingIndex = expenses.findIndex(e => e.id === expense.id);
    let updatedExpenses;

    if (existingIndex >= 0) {
        Storage.updateExpense(expense);
        updatedExpenses = [...expenses];
        updatedExpenses[existingIndex] = expense;
    } else {
        Storage.saveExpense(expense);
        updatedExpenses = [expense, ...expenses];
    }
    
    updatedExpenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    setExpenses(updatedExpenses);
  };

  const handleDeleteExpense = (id: string) => {
      if(confirm("確定要刪除這筆明細嗎？")) {
          Storage.deleteExpense(id);
          setExpenses(expenses.filter(e => e.id !== id));
      }
  }

  const toggleRepayment = (expense: Expense) => {
    const updated = { ...expense, isRepaid: !expense.isRepaid };
    Storage.updateExpense(updated);
    setExpenses(expenses.map(e => e.id === updated.id ? updated : e));
  };

  const activeTrip = trips.find(t => t.id === activeTripId);

  // --- Views ---

  const renderHome = () => (
    <div className="max-w-md mx-auto min-h-screen flex flex-col">
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
        {trips.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center opacity-60">
                <Plane size={48} className="mb-4 text-slate-300 dark:text-slate-600"/>
                <p className="text-slate-500 dark:text-slate-400">還沒有行程</p>
                <p className="text-sm text-slate-400 dark:text-slate-500">點擊下方按鈕開始規劃</p>
            </div>
        ) : (
            <div className="space-y-4">
            {trips.map(trip => (
                <div 
                key={trip.id}
                onClick={() => openTrip(trip.id)}
                className="bg-white dark:bg-slate-900 p-5 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-800 active:scale-[0.98] transition-all cursor-pointer group relative overflow-hidden"
                >
                <div className="absolute right-0 top-0 w-24 h-24 bg-primary/5 dark:bg-primary/10 rounded-full -mr-8 -mt-8 group-hover:bg-primary/10 dark:group-hover:bg-primary/20 transition-colors"></div>
                <div className="flex justify-between items-center relative z-10">
                    <div>
                    <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 mb-1">{trip.name}</h3>
                    <div className="flex items-center text-slate-500 dark:text-slate-400 text-sm gap-1">
                        <Calendar size={14} />
                        <span>{format(new Date(trip.startDate), 'yyyy/MM/dd')}</span>
                    </div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800 text-slate-400 dark:text-slate-500 p-2 rounded-full group-hover:bg-primary group-hover:text-white transition-colors">
                        <ChevronRight size={20} />
                    </div>
                </div>
                 <button 
                    onClick={(e) => handleDeleteTrip(e, trip.id)}
                    className="absolute bottom-2 right-2 text-xs text-red-200 hover:text-red-500 dark:text-red-900/50 dark:hover:text-red-400 z-20"
                 >
                     刪除
                 </button>
                </div>
            ))}
            </div>
        )}
      </main>

      <button 
        onClick={() => setIsAddTripOpen(true)}
        className="fixed bottom-6 right-6 w-14 h-14 bg-slate-900 dark:bg-slate-700 text-white rounded-full shadow-xl flex items-center justify-center hover:bg-slate-800 dark:hover:bg-slate-600 active:scale-90 transition-all"
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
              onChange={e => setNewTripName(e.target.value)}
              autoFocus
            />
            <div className="grid grid-cols-2 gap-3 mb-6">
                <input 
                    type="date" 
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm transition-colors"
                    value={newTripStart}
                    onChange={e => setNewTripStart(e.target.value)}
                />
                 <input 
                    type="date" 
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white rounded-xl text-sm transition-colors"
                    value={newTripEnd}
                    onChange={e => setNewTripEnd(e.target.value)}
                />
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => setIsAddTripOpen(false)}
                className="flex-1 py-3 rounded-xl font-medium text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                取消
              </button>
              <button 
                onClick={handleCreateTrip}
                className="flex-1 py-3 rounded-xl font-bold bg-primary text-white hover:bg-emerald-600 transition-colors"
              >
                建立
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <>
        {view === 'HOME' ? renderHome() : (
            activeTrip && (
                <TripDetailView 
                    trip={activeTrip}
                    expenses={expenses}
                    onBack={() => setView('HOME')}
                    onAddExpense={handleOpenAddExpense}
                    onEditExpense={handleOpenEditExpense}
                    onDeleteExpense={handleDeleteExpense}
                    onToggleRepaid={toggleRepayment}
                />
            )
        )}
        
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
        `}</style>
    </>
  );
};

export default App;