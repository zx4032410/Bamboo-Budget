import React, { useState, useRef, useEffect } from 'react';
import { Camera, Upload, X, Sparkles, Check, RefreshCw, Globe } from 'lucide-react';
import { analyzeReceipt, fetchExchangeRate } from '../services/geminiService';
import { Expense, ExpenseItem } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { format } from 'date-fns';

interface AddExpenseModalProps {
  tripId: string;
  isOpen: boolean;
  onClose: () => void;
  onSave: (expense: Expense) => void;
  initialData?: Expense | null;
}

// Helper function to compress image
const resizeImage = (file: File): Promise<string> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;
      img.onload = () => {
        const elem = document.createElement('canvas');
        // Max dimensions to keep size small
        const MAX_WIDTH = 1024;
        const MAX_HEIGHT = 1024;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }
        elem.width = width;
        elem.height = height;
        const ctx = elem.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);
        // Compress to JPEG with 0.7 quality
        resolve(elem.toDataURL('image/jpeg', 0.7)); 
      };
      img.onerror = (error) => reject(error);
    };
    reader.onerror = (error) => reject(error);
  });
};

const AddExpenseModal: React.FC<AddExpenseModalProps> = ({ tripId, isOpen, onClose, onSave, initialData }) => {
  const [step, setStep] = useState<'UPLOAD' | 'ANALYZING' | 'EDIT'>('UPLOAD');
  const [image, setImage] = useState<string | null>(null);
  
  // Form State
  const [storeName, setStoreName] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [currency, setCurrency] = useState('TWD');
  // Initialize with current local datetime string YYYY-MM-DDTHH:mm
  const [date, setDate] = useState('');
  // Items string format for editing: "Original || Translation\nOriginal2 || Translation2"
  const [itemsText, setItemsText] = useState<string>('');
  const [rate, setRate] = useState<number>(1);
  const [rateSource, setRateSource] = useState<string>('');
  const [isFetchingRate, setIsFetchingRate] = useState(false);
  
  // Split Logic State
  const [isSplit, setIsSplit] = useState(false);
  const [totalPeople, setTotalPeople] = useState(1);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to get current local datetime string for input
  const getCurrentLocalDateTime = () => {
      const now = new Date();
      const offset = now.getTimezoneOffset() * 60000;
      return new Date(now.getTime() - offset).toISOString().slice(0, 16);
  };

  // Helper to convert specific date object to local datetime string
  const toLocalDateTime = (d: Date) => {
      const offset = d.getTimezoneOffset() * 60000;
      return new Date(d.getTime() - offset).toISOString().slice(0, 16);
  };

  // Helper to format ExpenseItems to string for Textarea
  const formatItemsToString = (items: ExpenseItem[]) => {
    return items.map(i => {
        if (i.originalName === i.name) return i.name;
        return `${i.originalName} || ${i.name}`;
    }).join('\n');
  };

  // Helper to parse string from Textarea back to ExpenseItems
  const parseStringToItems = (text: string): ExpenseItem[] => {
    return text.split('\n').filter(line => line.trim()).map(line => {
        const parts = line.split('||');
        if (parts.length > 1) {
            return {
                originalName: parts[0].trim(),
                name: parts[1].trim()
            };
        }
        return {
            originalName: line.trim(),
            name: line.trim()
        };
    });
  };

  // Reset or Load Data
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        // Edit Mode
        setStep('EDIT');
        setImage(initialData.receiptImage || null);
        setStoreName(initialData.storeName);
        setAmount(initialData.originalAmount);
        setCurrency(initialData.originalCurrency);
        
        // Handle existing date conversion to datetime-local input format
        try {
            setDate(toLocalDateTime(new Date(initialData.date)));
        } catch (e) {
            setDate(getCurrentLocalDateTime());
        }

        setItemsText(formatItemsToString(initialData.items));
        setRate(initialData.exchangeRate);
        setRateSource('Manual/Saved');
        setIsSplit(initialData.splitCount > 1);
        setTotalPeople(initialData.splitCount > 1 ? initialData.splitCount : 1);
      } else {
        // Create Mode
        setStep('UPLOAD');
        setImage(null);
        resetForm();
      }
    }
  }, [isOpen, initialData]);

  // Auto-fetch rate when currency changes
  useEffect(() => {
    if (isOpen && step === 'EDIT' && currency && currency !== 'TWD' && !initialData) {
       handleFetchRate(currency);
    }
  }, [currency, isOpen, step]);

  const resetForm = () => {
    setStoreName('');
    setAmount('');
    setCurrency('TWD');
    setDate(getCurrentLocalDateTime());
    setItemsText('');
    setRate(1);
    setRateSource('');
    setIsSplit(false);
    setTotalPeople(1);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      try {
        const compressedBase64 = await resizeImage(file);
        setImage(compressedBase64);
        startAnalysis(compressedBase64);
      } catch (error) {
        console.error("Image processing failed:", error);
        alert("無法處理此圖片，請試著換一張");
      }
    }
  };

  const startAnalysis = async (base64: string) => {
    setStep('ANALYZING');
    const result = await analyzeReceipt(base64);
    
    setStoreName(result.storeName);
    setAmount(result.totalAmount);
    setCurrency(result.currency);
    
    // Combine analyzed date (YYYY-MM-DD) with current time
    const currentTime = new Date().toTimeString().slice(0, 5); // HH:mm
    if (result.date) {
        setDate(`${result.date}T${currentTime}`);
    } else {
        setDate(getCurrentLocalDateTime());
    }

    setItemsText(formatItemsToString(result.items));
    // Initial estimate from AI
    setRate(result.exchangeRateToTWD); 
    setRateSource('AI Estimate');
    
    setStep('EDIT');

    // Trigger a precise fetch immediately after analysis if currency is foreign
    if (result.currency !== 'TWD') {
        handleFetchRate(result.currency);
    }
  };

  const handleFetchRate = async (curr: string) => {
      if (curr === 'TWD') {
          setRate(1);
          setRateSource('');
          return;
      }
      setIsFetchingRate(true);
      try {
          const result = await fetchExchangeRate(curr);
          setRate(result.rate);
          setRateSource(result.source);
      } finally {
          setIsFetchingRate(false);
      }
  };

  const handleSave = () => {
    const numAmount = Number(amount) || 0;
    const totalTWD = numAmount * rate;
    
    const splitCount = isSplit ? Math.max(1, totalPeople) : 1;
    const myShareTWD = totalTWD / splitCount;
    const debtAmountTWD = totalTWD - myShareTWD;

    // Ensure date is stored as full ISO string
    const finalDateIso = new Date(date).toISOString();

    const newExpense: Expense = {
      id: initialData?.id || uuidv4(),
      tripId,
      storeName: storeName || '未命名',
      date: finalDateIso,
      items: parseStringToItems(itemsText),
      originalCurrency: currency,
      originalAmount: numAmount,
      exchangeRate: rate,
      totalTWD,
      paidByMe: true,
      splitCount,
      myShareTWD,
      debtAmountTWD,
      isRepaid: initialData ? initialData.isRepaid : false,
      receiptImage: image || undefined
    };

    onSave(newExpense);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-4 backdrop-blur-sm">
      <div className="bg-white dark:bg-slate-900 w-full max-w-lg rounded-2xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-fade-in-up border border-slate-100 dark:border-slate-800 transition-colors">
        
        {/* Header */}
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 sticky top-0 z-10 transition-colors">
          <h2 className="text-lg font-bold text-slate-800 dark:text-white">
            {step === 'UPLOAD' && '新增消費'}
            {step === 'ANALYZING' && 'AI 分析中...'}
            {step === 'EDIT' && (initialData ? '編輯消費' : '確認明細')}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 p-1">
            <X size={24} />
          </button>
        </div>

        <div className="p-6 overflow-y-auto">
          {step === 'UPLOAD' && (
            <div className="space-y-4">
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full h-48 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-xl flex flex-col items-center justify-center gap-3 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800 hover:border-primary hover:text-primary dark:hover:text-primary transition-all"
              >
                <Camera size={48} className="opacity-50" />
                <span className="font-medium">拍照或上傳收據</span>
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                accept="image/*" 
                className="hidden" 
                onChange={handleFileChange}
              />
              
              <div className="text-center text-sm text-slate-400 dark:text-slate-600">
                或者
              </div>
              
              <button 
                onClick={() => setStep('EDIT')}
                className="w-full py-3 text-slate-600 dark:text-slate-300 font-medium bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
              >
                手動輸入
              </button>
            </div>
          )}

          {step === 'ANALYZING' && (
            <div className="flex flex-col items-center justify-center py-12 text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-primary/30 border-t-primary rounded-full animate-spin"></div>
                <Sparkles className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-primary" size={24} />
              </div>
              <div>
                <p className="text-lg font-medium text-slate-800 dark:text-white">正在讀取收據內容</p>
                <p className="text-sm text-slate-500 dark:text-slate-400">AI 正在為您翻譯並計算匯率...</p>
              </div>
            </div>
          )}

          {step === 'EDIT' && (
            <div className="space-y-5">
              {image && (
                <div className="w-full h-32 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden mb-4 relative group">
                   <img src={image} alt="Receipt" className="w-full h-full object-cover opacity-80" />
                   <div className="absolute inset-0 flex items-center justify-center">
                      <span className="bg-black/50 text-white text-xs px-2 py-1 rounded-full">
                        {initialData ? '已儲存圖片' : '已識別'}
                      </span>
                   </div>
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">店家名稱</label>
                <input 
                  type="text" 
                  value={storeName} 
                  onChange={e => setStoreName(e.target.value)}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">金額</label>
                  <input 
                    type="number" 
                    value={amount} 
                    onChange={e => setAmount(Number(e.target.value))}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">幣別</label>
                  <input 
                    type="text" 
                    value={currency} 
                    onChange={e => setCurrency(e.target.value.toUpperCase())}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:outline-none placeholder-slate-300 dark:placeholder-slate-600"
                    placeholder="TWD"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                    <div className="flex justify-between items-center mb-1">
                         <label className="text-sm font-medium text-slate-700 dark:text-slate-300">匯率 (1{currency}=?TWD)</label>
                         <button 
                            onClick={() => handleFetchRate(currency)} 
                            disabled={isFetchingRate || currency === 'TWD'}
                            className="text-primary hover:bg-blue-50 dark:hover:bg-slate-800 p-1 rounded-full transition-colors disabled:opacity-30"
                            title="更新匯率"
                         >
                             <RefreshCw size={14} className={isFetchingRate ? 'animate-spin' : ''}/>
                         </button>
                    </div>
                  <input 
                    type="number" 
                    step="0.0001"
                    value={rate} 
                    onChange={e => setRate(Number(e.target.value))}
                    className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:outline-none"
                  />
                  {rateSource && (
                      <div className="flex items-center gap-1 mt-1 text-[10px] text-slate-400 dark:text-slate-500 px-1">
                          <Globe size={10} />
                          <span>{rateSource}</span>
                      </div>
                  )}
                </div>
                <div>
                   <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">換算台幣</label>
                   <div className="w-full p-3 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-500 dark:text-slate-400 font-medium">
                      ${Math.round((Number(amount) || 0) * rate).toLocaleString()}
                   </div>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">日期時間</label>
                <input 
                  type="datetime-local" 
                  value={date} 
                  onChange={e => setDate(e.target.value)}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:outline-none dark:[color-scheme:dark]"
                />
              </div>

              <div>
                <div className="flex justify-between items-center mb-1">
                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">購買項目 (一行一項)</label>
                    <span className="text-xs text-slate-400 dark:text-slate-500">格式：原文 || 中文</span>
                </div>
                <textarea 
                  value={itemsText} 
                  onChange={e => setItemsText(e.target.value)}
                  className="w-full p-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white focus:ring-2 focus:ring-primary focus:outline-none min-h-[100px] text-sm"
                  placeholder="例如：&#10;Apple Juice || 蘋果汁&#10;Sandwich || 三明治"
                />
              </div>

              {/* Split Cost Section */}
              <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-xl border border-blue-100 dark:border-blue-800/50">
                <div className="flex items-center justify-between mb-3">
                   <span className="font-medium text-blue-900 dark:text-blue-100">是否與他人分攤？</span>
                   <label className="relative inline-flex items-center cursor-pointer">
                      <input type="checkbox" checked={isSplit} onChange={e => setIsSplit(e.target.checked)} className="sr-only peer" />
                      <div className="w-11 h-6 bg-gray-200 dark:bg-slate-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                   </label>
                </div>
                
                {isSplit && (
                  <div className="animate-fade-in">
                    <label className="block text-xs font-medium text-blue-800 dark:text-blue-200 mb-1">總人數 (包含您自己)</label>
                    <input 
                      type="number" 
                      min="2"
                      value={totalPeople} 
                      onChange={e => setTotalPeople(Number(e.target.value))}
                      className="w-full p-2 bg-white dark:bg-slate-800 border border-blue-200 dark:border-blue-800 rounded-lg text-center text-lg font-bold text-blue-900 dark:text-blue-100"
                    />
                    <div className="mt-2 text-xs text-blue-600 dark:text-blue-300 flex justify-between">
                      <span>您的花費: ${Math.round((Number(amount) * rate) / totalPeople).toLocaleString()}</span>
                      <span>他人欠款: ${Math.round((Number(amount) * rate) - ((Number(amount) * rate) / totalPeople)).toLocaleString()}</span>
                    </div>
                  </div>
                )}
              </div>

              <button 
                onClick={handleSave}
                className="w-full py-4 bg-primary text-white font-bold rounded-xl shadow-lg hover:bg-sky-600 hover:shadow-xl transition-all flex items-center justify-center gap-2"
              >
                <Check size={20} />
                {initialData ? '儲存修改' : '儲存明細'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default AddExpenseModal;