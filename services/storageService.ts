import { Trip, Expense, ThemeMode } from '../types';
import { db, auth } from '../firebaseConfig';
import {
  collection,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  doc,
  query,
  where,
  setDoc
} from 'firebase/firestore';


const TRIPS_COLLECTION = 'trips';
const EXPENSES_COLLECTION = 'expenses';
const THEME_KEY = 'trippy_theme';
const LOGIN_PREFERENCE_KEY = 'bamboo_login_preference';


// Types
export type LoginType = 'anonymous' | 'google';

interface LoginPreference {
  type: LoginType;
  lastLogin: string; // ISO timestamp
}

// Helper to remove undefined fields because Firestore throws error on undefined
const removeUndefined = (obj: any) => {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, v]) => v !== undefined)
  );
};

// Helper to get current User ID
const getCurrentUserId = () => {
  const user = auth.currentUser;
  if (!user) throw new Error("User not authenticated");
  return user.uid;
};

// --- Theme (Keep in LocalStorage for instant UI load) ---
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

// --- Login Preference ---
export const getLoginPreference = (): LoginPreference | null => {
  try {
    const pref = localStorage.getItem(LOGIN_PREFERENCE_KEY);
    if (!pref) return null;
    return JSON.parse(pref) as LoginPreference;
  } catch (e) {
    console.error("Failed to read login preference", e);
    return null;
  }
};

export const saveLoginPreference = (type: LoginType) => {
  try {
    const preference: LoginPreference = {
      type,
      lastLogin: new Date().toISOString()
    };
    localStorage.setItem(LOGIN_PREFERENCE_KEY, JSON.stringify(preference));
  } catch (e) {
    console.error("Failed to save login preference", e);
  }
};

export const clearLoginPreference = () => {
  try {
    localStorage.removeItem(LOGIN_PREFERENCE_KEY);
  } catch (e) {
    console.error("Failed to clear login preference", e);
  }
};

// --- API Usage Tracking ---
const API_USAGE_KEY = 'bamboo_api_usage';
const DAILY_API_LIMIT = 2;

interface ApiUsage {
  date: string; // YYYY-MM-DD
  count: number;
}

export const getApiUsageToday = (): number => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const stored = localStorage.getItem(API_USAGE_KEY);

    if (!stored) return 0;

    const usage: ApiUsage = JSON.parse(stored);

    // 如果是新的一天，重置計數
    if (usage.date !== today) {
      return 0;
    }

    return usage.count;
  } catch (e) {
    console.error("Failed to read API usage", e);
    return 0;
  }
};

export const incrementApiUsage = (): void => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const current = getApiUsageToday();

    const usage: ApiUsage = {
      date: today,
      count: current + 1
    };

    localStorage.setItem(API_USAGE_KEY, JSON.stringify(usage));
  } catch (e) {
    console.error("Failed to increment API usage", e);
  }
};

export const hasReachedDailyLimit = (): boolean => {
  return getApiUsageToday() >= DAILY_API_LIMIT;
};

export const getRemainingApiCalls = (): number => {
  const used = getApiUsageToday();
  return Math.max(0, DAILY_API_LIMIT - used);
};

// --- User API Key ---
const USER_API_KEY_STORAGE = 'bamboo_user_api_key';

export const getUserApiKey = (): string | null => {
  try {
    return localStorage.getItem(USER_API_KEY_STORAGE);
  } catch (e) {
    console.error("Failed to read user API key", e);
    return null;
  }
};

export const saveUserApiKey = (apiKey: string): void => {
  try {
    if (apiKey.trim()) {
      localStorage.setItem(USER_API_KEY_STORAGE, apiKey.trim());
    }
  } catch (e) {
    console.error("Failed to save user API key", e);
  }
};

export const clearUserApiKey = (): void => {
  try {
    localStorage.removeItem(USER_API_KEY_STORAGE);
  } catch (e) {
    console.error("Failed to clear user API key", e);
  }
};

export const hasUserApiKey = (): boolean => {
  const key = getUserApiKey();
  return key !== null && key.length > 0;
};

// --- Trips (Firestore) ---

export const fetchTrips = async (): Promise<Trip[]> => {
  try {
    const uid = getCurrentUserId();
    const q = query(
      collection(db, TRIPS_COLLECTION),
      where("userId", "==", uid)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Trip));
  } catch (error) {
    console.error("Error fetching trips:", error);
    throw error;
  }
};

export const saveTrip = async (trip: Trip): Promise<string> => {
  try {
    const uid = getCurrentUserId();
    // Ensure userId is attached
    const tripWithUser = { ...trip, userId: uid };
    const data = removeUndefined(tripWithUser);

    if (trip.id) {
      await setDoc(doc(db, TRIPS_COLLECTION, trip.id), data);
      return trip.id;
    } else {
      const docRef = await addDoc(collection(db, TRIPS_COLLECTION), data);
      return docRef.id;
    }
  } catch (error) {
    console.error("Error saving trip:", error);
    throw error;
  }
};

export const deleteTrip = async (id: string) => {
  try {
    // 1. Delete the trip document
    await deleteDoc(doc(db, TRIPS_COLLECTION, id));

    // 2. Delete associated expenses
    // Note: In a real app, query by userId AND tripId for safety
    const expenses = await fetchExpensesForTrip(id);
    const deletePromises = expenses.map(e => deleteDoc(doc(db, EXPENSES_COLLECTION, e.id)));
    await Promise.all(deletePromises);
  } catch (error) {
    console.error("Error deleting trip:", error);
    throw error;
  }
};

// --- Expenses (Firestore) ---

export const fetchExpensesForTrip = async (tripId: string): Promise<Expense[]> => {
  try {
    const uid = getCurrentUserId();
    const q = query(
      collection(db, EXPENSES_COLLECTION),
      where("tripId", "==", tripId),
      where("userId", "==", uid) // Security: Only fetch own expenses
    );
    const querySnapshot = await getDocs(q);
    const expenses = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    } as Expense));

    // Sort in memory (newest first)
    return expenses.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } catch (error) {
    console.error("Error fetching expenses:", error);
    throw error;
  }
};

export const saveExpense = async (expense: Expense): Promise<string> => {
  try {
    const uid = getCurrentUserId();
    // Ensure items is an array and userId is attached
    const safeExpense = {
      ...expense,
      userId: uid,
      items: Array.isArray(expense.items) ? expense.items : []
    };

    const data = removeUndefined(safeExpense);

    if (safeExpense.id) {
      await setDoc(doc(db, EXPENSES_COLLECTION, safeExpense.id), data);
      return safeExpense.id;
    } else {
      const docRef = await addDoc(collection(db, EXPENSES_COLLECTION), data);
      return docRef.id;
    }
  } catch (error) {
    // Check for document size limit error (Firestore limit is 1MB)
    if (error instanceof Error && error.message.includes("exceeds the maximum allowed size")) {
      alert("圖片過大無法儲存至雲端，請嘗試重新拍攝或不含圖片儲存。");
    }
    console.error("Error saving expense:", error);
    throw error;
  }
};

export const updateExpense = async (updatedExpense: Expense) => {
  try {
    if (!updatedExpense.id) throw new Error("Expense ID is missing");
    const uid = getCurrentUserId();

    // Ensure ownership consistency
    const data = removeUndefined({ ...updatedExpense, userId: uid });

    const expenseRef = doc(db, EXPENSES_COLLECTION, updatedExpense.id);
    await updateDoc(expenseRef, data);
  } catch (error) {
    if (error instanceof Error && error.message.includes("exceeds the maximum allowed size")) {
      alert("圖片過大無法儲存至雲端。");
    }
    console.error("Error updating expense:", error);
    throw error;
  }
};

export const deleteExpense = async (id: string) => {
  try {
    await deleteDoc(doc(db, EXPENSES_COLLECTION, id));
  } catch (error) {
    console.error("Error deleting expense:", error);
    throw error;
  }
};