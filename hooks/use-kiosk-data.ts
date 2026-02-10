import useSWR from "swr";
import { useEffect, useRef } from "react";
import type { Member, Business } from "@/lib/types";

interface KioskData {
  members: Member[];
  businesses: Business[];
}

const CACHE_KEY = "pdca_kiosk_data_cache";
const CACHE_TIMESTAMP_KEY = "pdca_kiosk_data_timestamp";

const fetcher = async (url: string): Promise<KioskData> => {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error("Failed to fetch");
    const data = await res.json();
    
    // Cache successful response to localStorage
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        localStorage.setItem(CACHE_TIMESTAMP_KEY, new Date().toISOString());
      } catch (e) {
        // Silently fail if localStorage is full
      }
    }
    
    return data;
  } catch (error) {
    // If fetch fails, try to load from cache
    if (typeof window !== "undefined") {
      try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          console.log("[v0] Using cached kiosk data (offline or network error)");
          return JSON.parse(cached);
        }
      } catch (e) {
        // Continue to error
      }
    }
    throw error;
  }
};

export function useKioskData(initialData?: KioskData) {
  const { data, error, isLoading, mutate } = useSWR<KioskData>(
    "/api/kiosk/data",
    fetcher,
    {
      fallbackData: initialData,
      revalidateOnFocus: false,
      revalidateOnReconnect: false, // Don't refresh when network comes back - only at 6 AM
      refreshInterval: 0, // Don't auto-refresh (prevents unnecessary reloads)
      dedupingInterval: 5000, // Dedupe requests within 5 seconds
      errorRetryCount: 3,
      errorRetryInterval: 5000,
    }
  );

  // Schedule refresh at 6 AM every morning
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    const scheduleNextRefresh = () => {
      const now = new Date();
      const next6AM = new Date(now);
      next6AM.setHours(6, 0, 0, 0);

      // If 6 AM has already passed today, schedule for tomorrow
      if (next6AM <= now) {
        next6AM.setDate(next6AM.getDate() + 1);
      }

      const timeUntilRefresh = next6AM.getTime() - now.getTime();
      
      const timeout = setTimeout(() => {
        console.log("[v0] 6 AM refresh triggered");
        mutate();
        scheduleNextRefresh();
      }, timeUntilRefresh);

      return () => clearTimeout(timeout);
    };

    return scheduleNextRefresh();
  }, [mutate]);

  return {
    members: data?.members || [],
    businesses: data?.businesses || [],
    isLoading,
    isError: error,
    refresh: mutate,
  };
}
