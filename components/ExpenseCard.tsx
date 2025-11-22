import React from 'react';
import { Expense } from '../types';
import { Receipt, Users, CheckCircle, XCircle, Trash2, Pencil, ChevronDown, ChevronUp } from 'lucide-react';

interface ExpenseCardProps {
  expense: Expense;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onToggleRepaid: (expense: Expense) => void;
  onEdit: (expense: Expense) => void;
  onDelete: (id: string) => void;
  style?: React.CSSProperties;
}

const ExpenseCard: React.FC<ExpenseCardProps> = ({ 
  expense, 
  isExpanded, 
  onToggleExpand,
  onToggleRepaid, 
  onEdit, 
  onDelete,
  style
}) => {
  const isDebt = expense.debtAmountTWD > 0;

  const handleEdit = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onEdit(expense);
  };

  const handleDelete = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onDelete(expense.id);
  };

  const handleToggleRepaid = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onToggleRepaid(expense);
  };

  return (
    <div style={style} className="px-1">
      <div 
          onClick={onToggleExpand}
          className="bg-white dark:bg-slate-900 p-4 rounded-xl shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col gap-3 cursor-pointer hover:border-primary/30 dark:hover:border-primary/50 transition-colors"
      >
        <div className="flex justify-between items-start">
          <div className="flex items-start gap-3 overflow-hidden">
            <div className="bg-blue-50 dark:bg-slate-800 p-2 rounded-lg text-primary mt-1 shrink-0">
              <Receipt size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="font-bold text-slate-800 dark:text-slate-100 truncate pr-2">{expense.storeName}</h3>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                  {expense.items.length} 項商品
                </span>
                
                {expense.splitCount > 1 && (
                   <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300">
                      <Users size={10} /> 分帳
                   </span>
                )}

                <span className="text-slate-300 dark:text-slate-600">
                   {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                </span>
              </div>
            </div>
          </div>
          <div className="text-right shrink-0 ml-2">
            <div className="font-bold text-slate-900 dark:text-white text-lg">
              ${Math.round(expense.totalTWD).toLocaleString()}
            </div>
            <div className="text-xs text-slate-400 dark:text-slate-500">
              {expense.originalCurrency} {expense.originalAmount.toLocaleString()}
            </div>
          </div>
        </div>

        {/* Expanded Items List */}
        {isExpanded && (
            <div className="bg-slate-50 dark:bg-slate-950/50 rounded-lg p-3 border border-slate-100 dark:border-slate-800 animate-fade-in">
                <h4 className="text-xs font-bold text-slate-400 dark:text-slate-500 mb-2 uppercase tracking-wider">商品明細</h4>
                <div className="space-y-3">
                    {expense.items.map((item, idx) => (
                        <div key={idx} className="border-b border-slate-200 dark:border-slate-800 pb-2 last:border-0 last:pb-0">
                            <div className="text-sm font-medium text-slate-800 dark:text-slate-200">
                                {item.originalName}
                            </div>
                            {item.name !== item.originalName && (
                              <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                  {item.name}
                              </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        )}

        {/* Split Info Section - Only Visible When Expanded */}
        {isExpanded && (expense.splitCount > 1) && (
          <div className="bg-indigo-50 dark:bg-slate-800/50 p-3 rounded-lg text-sm animate-fade-in">
            <div className="flex items-center gap-2 mb-1 text-slate-600 dark:text-slate-300">
              <Users size={14} />
              <span>
                與 {expense.splitCount - 1} 人分攤
                (每人 ${Math.round(expense.totalTWD / expense.splitCount)} TWD)
              </span>
            </div>
            
            <div className="flex justify-between items-center border-t border-indigo-100 dark:border-slate-700 pt-2 mt-1">
              <div className="flex flex-col">
                <span className="text-xs text-slate-500 dark:text-slate-400">代墊金額 (他人欠款)</span>
                <span className="font-semibold text-accent">
                  ${Math.round(expense.debtAmountTWD).toLocaleString()} TWD
                </span>
              </div>
              
              <button
                type="button"
                onClick={handleToggleRepaid}
                className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-medium transition-colors relative z-10 ${
                  expense.isRepaid
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800'
                    : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-600 border border-slate-200 dark:border-slate-600'
                }`}
              >
                {expense.isRepaid ? (
                  <>
                    <CheckCircle size={12} /> 已還款
                  </>
                ) : (
                  <>
                    <XCircle size={12} /> 未還款
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        <div className="flex justify-end mt-auto gap-2 border-t border-slate-50 dark:border-slate-800 pt-2">
          <button 
              type="button"
              onClick={handleEdit}
              className="relative z-10 text-slate-400 hover:text-blue-500 transition-colors p-2 rounded-full hover:bg-blue-50 dark:hover:bg-slate-800"
          >
              <Pencil size={16} />
          </button>
          <button 
              type="button"
              onClick={handleDelete}
              className="relative z-10 text-slate-400 hover:text-red-400 transition-colors p-2 rounded-full hover:bg-red-50 dark:hover:bg-slate-800"
          >
              <Trash2 size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExpenseCard;