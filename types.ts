export interface ExpenseItem {
  name: string;        // Translated text (Traditional Chinese)
  originalName: string; // Original text on receipt
}

export interface Expense {
  id: string;
  tripId: string;
  storeName: string;
  date: string; // ISO string
  items: ExpenseItem[]; // Updated from string[] to ExpenseItem[]
  originalCurrency: string;
  originalAmount: number;
  exchangeRate: number;
  totalTWD: number;
  
  // Split logic
  paidByMe: boolean; // Usually true for this app's context
  splitCount: number; // 1 means just me, 2+ means split
  myShareTWD: number;
  debtAmountTWD: number; // Amount others owe me
  isRepaid: boolean; // If debt exists, is it settled?
  
  receiptImage?: string; // Base64
}

export interface Trip {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  budgetTWD?: number;
}

export type ViewState = 'HOME' | 'TRIP_DETAIL';

export interface GeminiAnalysisResult {
  storeName: string;
  date: string;
  totalAmount: number;
  currency: string;
  items: ExpenseItem[];
  exchangeRateToTWD: number;
}