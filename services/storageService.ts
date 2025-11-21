import { Trip, Expense, ExpenseItem, ThemeMode } from '../types';

const TRIPS_KEY = 'trippy_trips';
const EXPENSES_KEY = 'trippy_expenses';
const THEME_KEY = 'trippy_theme';

// Helper to migrate old string[] items to ExpenseItem[]
const migrateExpenses = (expenses: any[]): Expense[] => {
  return expenses.map(e => {
    // Check if items is an array of strings (legacy data)
    if (Array.isArray(e.items) && e.items.length > 0 && typeof e.items[0] === 'string') {
      return {
        ...e,
        items: e.items.map((itemStr: string) => ({
          name: itemStr,
          originalName: itemStr
        }))
      };
    }
    // Ensure items is always an array
    if (!e.items) {
        return { ...e, items: [] };
    }
    return e as Expense;
  });
};

// Helper to detect QuotaExceededError
const isQuotaExceeded = (e: unknown) => {
  return (
    e instanceof DOMException &&
    // everything except Firefox
    (e.code === 22 ||
      // Firefox
      e.code === 1014 ||
      // test name field too, because code might not be present
      // everything except Firefox
      e.name === 'QuotaExceededError' ||
      // Firefox
      e.name === 'NS_ERROR_DOM_QUOTA_REACHED') &&
    // acknowledge QuotaExceededError only if there's something already stored
    (localStorage.length !== 0)
  );
};

export const getTrips = (): Trip[] => {
  const data = localStorage.getItem(TRIPS_KEY);
  return data ? JSON.parse(data) : [];
};

export const saveTrip = (trip: Trip) => {
  const trips = getTrips();
  trips.push(trip);
  try {
    localStorage.setItem(TRIPS_KEY, JSON.stringify(trips));
  } catch (e) {
    if (isQuotaExceeded(e)) {
      alert("儲存空間已滿，無法建立新旅程。請嘗試刪除舊資料或不含圖片的項目。");
    } else {
      console.error("Save trip failed", e);
    }
  }
};

export const deleteTrip = (id: string) => {
  const trips = getTrips().filter(t => t.id !== id);
  localStorage.setItem(TRIPS_KEY, JSON.stringify(trips));
  
  // Cleanup expenses
  const allExpenses = getAllExpenses();
  const remainingExpenses = allExpenses.filter(e => e.tripId !== id);
  localStorage.setItem(EXPENSES_KEY, JSON.stringify(remainingExpenses));
};

export const getAllExpenses = (): Expense[] => {
  const data = localStorage.getItem(EXPENSES_KEY);
  const rawExpenses = data ? JSON.parse(data) : [];
  return migrateExpenses(rawExpenses);
};

export const getExpensesForTrip = (tripId: string): Expense[] => {
  return getAllExpenses().filter(e => e.tripId === tripId);
};

export const saveExpense = (expense: Expense) => {
  const expenses = getAllExpenses();
  expenses.push(expense);
  try {
    localStorage.setItem(EXPENSES_KEY, JSON.stringify(expenses));
  } catch (e) {
    if (isQuotaExceeded(e)) {
      // Fallback: Try saving without the image to save space
      const expenseNoImg = { ...expense, receiptImage: undefined };
      expenses.pop(); // Remove the failed one
      expenses.push(expenseNoImg);
      
      try {
        localStorage.setItem(EXPENSES_KEY, JSON.stringify(expenses));
        alert("儲存空間已滿。已儲存此筆消費，但圖片未被儲存。");
      } catch (e2) {
        alert("儲存空間嚴重不足，無法儲存此筆資料。請清理舊資料。");
      }
    } else {
      console.error("Save expense failed", e);
    }
  }
};

export const updateExpense = (updatedExpense: Expense) => {
  const allExpenses = getAllExpenses();
  const expenses = allExpenses.map(e => e.id === updatedExpense.id ? updatedExpense : e);
  
  try {
    localStorage.setItem(EXPENSES_KEY, JSON.stringify(expenses));
  } catch (e) {
    if (isQuotaExceeded(e)) {
      // Fallback: If updating and space is full, try removing image from the updated item
      if (updatedExpense.receiptImage) {
        const expenseNoImg = { ...updatedExpense, receiptImage: undefined };
        const expensesRetry = allExpenses.map(e => e.id === expenseNoImg.id ? expenseNoImg : e);
        try {
           localStorage.setItem(EXPENSES_KEY, JSON.stringify(expensesRetry));
           alert("儲存空間已滿。已更新資料，但移除了圖片以節省空間。");
        } catch (e2) {
           alert("儲存空間嚴重不足，無法更新資料。");
        }
      } else {
        alert("儲存空間嚴重不足，無法更新資料。");
      }
    } else {
      console.error("Update expense failed", e);
    }
  }
};

export const deleteExpense = (id: string) => {
    const expenses = getAllExpenses().filter(e => e.id !== id);
    localStorage.setItem(EXPENSES_KEY, JSON.stringify(expenses));
}

export const getThemePreference = (): ThemeMode => {
  const theme = localStorage.getItem(THEME_KEY);
  return (theme === 'light' || theme === 'dark' || theme === 'system') ? theme : 'system';
};

export const saveThemePreference = (theme: ThemeMode) => {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (e) {
    console.error("Failed to save theme preference", e);
  }
};