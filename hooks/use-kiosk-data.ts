import useSWR from "swr";
import type { Member, Business } from "@/lib/types";

interface KioskData {
  members: Member[];
  businesses: Business[];
}

const fetcher = (url: string) => fetch(url).then((res) => res.json());

export function useKioskData(initialData?: KioskData) {
  const { data, error, isLoading, mutate } = useSWR<KioskData>(
    "/api/kiosk/data",
    fetcher,
    {
      fallbackData: initialData,
      revalidateOnFocus: true,
      revalidateOnReconnect: true,
      refreshInterval: 30000, // Refresh every 30 seconds
      dedupingInterval: 5000, // Dedupe requests within 5 seconds
    }
  );

  return {
    members: data?.members || [],
    businesses: data?.businesses || [],
    isLoading,
    isError: error,
    refresh: mutate,
  };
}
