import { Trip, Expense, ExpenseItem } from '../types';

const TRIPS_KEY = 'trippy_trips';
const EXPENSES_KEY = 'trippy_expenses';

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

export const getTrips = (): Trip[] => {
  const data = localStorage.getItem(TRIPS_KEY);
  return data ? JSON.parse(data) : [];
};

export const saveTrip = (trip: Trip) => {
  const trips = getTrips();
  trips.push(trip);
  localStorage.setItem(TRIPS_KEY, JSON.stringify(trips));
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
  localStorage.setItem(EXPENSES_KEY, JSON.stringify(expenses));
};

export const updateExpense = (updatedExpense: Expense) => {
  const expenses = getAllExpenses().map(e => e.id === updatedExpense.id ? updatedExpense : e);
  localStorage.setItem(EXPENSES_KEY, JSON.stringify(expenses));
};

export const deleteExpense = (id: string) => {
    const expenses = getAllExpenses().filter(e => e.id !== id);
    localStorage.setItem(EXPENSES_KEY, JSON.stringify(expenses));
}