import { GoogleGenAI, Type } from "@google/genai";
import { GeminiAnalysisResult } from '../types';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// Simple cache interface
interface RateCache {
  [currency: string]: {
    rate: number;
    date: string; // YYYY-MM-DD
  }
}

const RATE_CACHE_KEY = 'trippy_rate_cache';

const getRateFromCache = (currency: string): number | null => {
  try {
    const cacheRaw = localStorage.getItem(RATE_CACHE_KEY);
    if (!cacheRaw) return null;

    const cache: RateCache = JSON.parse(cacheRaw);
    const entry = cache[currency];
    const today = new Date().toISOString().split('T')[0];

    if (entry && entry.date === today) {
      return entry.rate;
    }
    return null;
  } catch (e) {
    return null;
  }
};

const saveRateToCache = (currency: string, rate: number) => {
  try {
    const cacheRaw = localStorage.getItem(RATE_CACHE_KEY);
    const cache: RateCache = cacheRaw ? JSON.parse(cacheRaw) : {};

    cache[currency] = {
      rate,
      date: new Date().toISOString().split('T')[0]
    };

    localStorage.setItem(RATE_CACHE_KEY, JSON.stringify(cache));
  } catch (e) {
    console.error("Failed to save rate cache", e);
  }
};

export const analyzeReceipt = async (base64Image: string): Promise<GeminiAnalysisResult> => {
  const { hasReachedDailyLimit, incrementApiUsage, getUserApiKey } = await import('./storageService');
  const { auth } = await import('../firebaseConfig');

  // Get user's API key if available
  const userApiKey = getUserApiKey();

  // Admin email whitelist (no usage limit)
  const ADMIN_EMAILS = ['zx4032410@gmail.com'];
  const currentUserEmail = auth.currentUser?.email;
  const isAdmin = currentUserEmail && ADMIN_EMAILS.includes(currentUserEmail);

  // If user doesn't have their own key and is not admin, check daily limit
  if (!userApiKey && !isAdmin) {
    if (hasReachedDailyLimit()) {
      throw new Error('DAILY_LIMIT_REACHED');
    }
  }

  // Use user's key or default key
  const apiKey = userApiKey || process.env.API_KEY;
  const ai = new GoogleGenAI({ apiKey: apiKey });

  // Detect MIME type from the data URL header (e.g. data:image/png;base64,...)
  // This allows generic support for various image types (png, webp, heic, etc.)
  const mimeMatch = base64Image.match(/^data:(.*?);base64,/);
  const mimeType = mimeMatch ? mimeMatch[1] : 'image/jpeg';

  // Remove header to get pure base64 data
  const cleanBase64 = base64Image.replace(/^data:.*?;base64,/, "");

  const prompt = `
    Analyze this travel receipt or photo of an expense. 
    1. Identify the store or location name.
    2. Identify the total amount and the currency code (e.g., JPY, USD, KRW, EUR).
    3. Extract the date of purchase (YYYY-MM-DD format). If not found, use today's date.
    4. List the main items purchased. For each item, provide the ORIGINAL text as it appears on the receipt, and a Traditional Chinese translation (Taiwan usage).
    5. Estimate the current exchange rate from the identified currency to TWD (New Taiwan Dollar).

    Return strictly JSON.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: {
        parts: [
          { inlineData: { mimeType: mimeType, data: cleanBase64 } },
          { text: prompt }
        ]
      },
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            storeName: { type: Type.STRING, description: "Name of the shop or service" },
            date: { type: Type.STRING, description: "Date in YYYY-MM-DD format" },
            totalAmount: { type: Type.NUMBER, description: "Total numerical amount" },
            currency: { type: Type.STRING, description: "Currency code like JPY, USD" },
            items: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  originalName: { type: Type.STRING, description: "Item name exactly as shown on receipt" },
                  name: { type: Type.STRING, description: "Traditional Chinese translation" }
                },
                required: ["originalName", "name"]
              },
              description: "List of purchased items with original text and translation"
            },
            exchangeRateToTWD: { type: Type.NUMBER, description: "Estimated exchange rate to TWD" }
          },
          required: ["storeName", "totalAmount", "currency", "exchangeRateToTWD", "items"]
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from Gemini");

    // Success! Only increment usage count if using shared key AND not admin
    if (!userApiKey && !isAdmin) {
      incrementApiUsage();
    }

    return JSON.parse(text) as GeminiAnalysisResult;
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    // Return a fallback structure if AI fails, to prevent app crash
    return {
      storeName: "未命名消費",
      date: new Date().toISOString().split('T')[0],
      totalAmount: 0,
      currency: "TWD",
      items: [{ name: "無法辨識項目", originalName: "Unknown Item" }],
      exchangeRateToTWD: 1
    };
  }
};

export const fetchExchangeRate = async (currency: string): Promise<{ rate: number; source: string }> => {
  if (currency.toUpperCase() === 'TWD') {
    return { rate: 1, source: 'Default' };
  }

  // 1. Check Cache
  const cachedRate = getRateFromCache(currency.toUpperCase());
  if (cachedRate !== null) {
    return { rate: cachedRate, source: 'Cache (Today)' };
  }

  // 2. Fetch from Gemini with Google Search
  const prompt = `What is the current exchange rate for 1 ${currency} to New Taiwan Dollar (TWD)? Return ONLY the numeric rate (e.g. 0.21). Do not add any text.`;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        // Note: responseSchema is NOT allowed with googleSearch
      },
    });

    // Log grounding metadata as required by guidelines
    const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
    if (chunks) {
      console.log("Exchange Rate Source URLs:", chunks.map((c: any) => c.web?.uri).filter(Boolean));
    }

    const text = response.text;
    if (!text) throw new Error("No response from Gemini Search");

    // Extract number using regex
    const match = text.match(/[\d.]+/);
    const rate = match ? parseFloat(match[0]) : 0;

    if (rate > 0) {
      saveRateToCache(currency.toUpperCase(), rate);
      return { rate, source: 'Google Search' };
    }

    return { rate: 1, source: 'Failed' };
  } catch (error) {
    console.error("Exchange Rate Fetch Error:", error);
    return { rate: 1, source: 'Error' };
  }
};