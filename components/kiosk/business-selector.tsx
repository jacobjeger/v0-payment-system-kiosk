"use client";

import React, { useState, useMemo } from "react";
import { Search, Store, Coffee, ShoppingBag, UtensilsCrossed } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import type { Business, Member } from "@/lib/types";

interface BusinessSelectorProps {
  businesses: Business[];
  member: Member;
  onSelect: (business: Business) => void;
}

const categoryIcons: Record<string, React.ReactNode> = {
  food: <UtensilsCrossed className="w-5 h-5" />,
  retail: <ShoppingBag className="w-5 h-5" />,
  cafe: <Coffee className="w-5 h-5" />,
  default: <Store className="w-5 h-5" />,
};

export function BusinessSelector({ businesses, member, onSelect }: BusinessSelectorProps) {
  const [search, setSearch] = useState("");
  const [topBusinesses, setTopBusinesses] = useState<string[]>([]);
  const [isLoadingFavorites, setIsLoadingFavorites] = useState(true);

  // Load top businesses for this member on mount
  React.useEffect(() => {
    async function loadTopBusinesses() {
      try {
        const cacheKey = `favorites_${member.id}`;
        const cachedData = localStorage.getItem(cacheKey);
        
        // Check if we have cached data and if it's less than 24 hours old
        if (cachedData) {
          const { businesses, timestamp } = JSON.parse(cachedData);
          const ageInHours = (Date.now() - timestamp) / (1000 * 60 * 60);
          
          if (ageInHours < 24) {
            console.log("[v0] Using cached favorites for member:", member.id);
            setTopBusinesses(businesses);
            setIsLoadingFavorites(false);
            return;
          }
        }
        
        // Cache expired or doesn't exist - fetch fresh data
        setIsLoadingFavorites(true);
        console.log("[v0] Fetching fresh favorites for member:", member.id);
        
        const supabase = createClient();
        const { data, error } = await supabase
          .from("transactions")
          .select("business_id")
          .eq("member_id", member.id)
          .order("created_at", { ascending: false })
          .limit(50);

        if (error) {
          console.error("[v0] Error loading top businesses:", error);
          setIsLoadingFavorites(false);
          return;
        }

        if (data && data.length > 0) {
          const businessCounts: Record<string, number> = {};
          for (const transaction of data) {
            if (transaction.business_id) {
              businessCounts[transaction.business_id] = (businessCounts[transaction.business_id] || 0) + 1;
            }
          }

          const sortedBusinesses = Object.entries(businessCounts)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 4)
            .map(([businessId]) => businessId);

          console.log("[v0] Top businesses fetched and cached:", sortedBusinesses);
          
          // Cache the results with a timestamp
          localStorage.setItem(cacheKey, JSON.stringify({
            businesses: sortedBusinesses,
            timestamp: Date.now()
          }));
          
          setTopBusinesses(sortedBusinesses);
        }
      } catch (error) {
        console.error("[v0] Failed to load top businesses:", error);
      } finally {
        setIsLoadingFavorites(false);
      }
    }

    loadTopBusinesses();
  }, [member.id]);

  const { topBusinessesList, allOtherBusinesses } = useMemo(() => {
    const top = businesses.filter((b) => topBusinesses.includes(b.id));
    // Sort by their order in topBusinesses array
    top.sort((a, b) => topBusinesses.indexOf(a.id) - topBusinesses.indexOf(b.id));

    const others = businesses.filter((b) => !topBusinesses.includes(b.id));
    // Sort alphabetically
    others.sort((a, b) => a.name.localeCompare(b.name));

    return { topBusinessesList: top, allOtherBusinesses: others };
  }, [businesses, topBusinesses]);

  const filteredTopBusinesses = topBusinessesList.filter((business) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      business.name.toLowerCase().includes(searchLower) ||
      business.description?.toLowerCase().includes(searchLower)
    );
  });

  const filteredOtherBusinesses = allOtherBusinesses.filter((business) => {
    if (!search) return true;
    const searchLower = search.toLowerCase();
    return (
      business.name.toLowerCase().includes(searchLower) ||
      business.description?.toLowerCase().includes(searchLower)
    );
  });

  const hasTopBusinesses = filteredTopBusinesses.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="text-center mb-4 flex-shrink-0">
        <h2 className="text-lg font-semibold text-stone-900">Select Business</h2>
        <p className="text-stone-500 text-xs">Where are you making a purchase?</p>
      </div>

      {/* Search */}
      <div className="mb-4 flex-shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            placeholder="Search businesses..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 text-sm pl-10 pr-4 rounded-lg bg-white border border-stone-200 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-300 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xs font-medium"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Businesses Grid */}
      <div className="flex-1 overflow-y-auto pb-4 -mx-1 px-1">
        {/* Top Businesses Section */}
        {(hasTopBusinesses || isLoadingFavorites) && (
          <div className="mb-5">
            <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide px-1 mb-2">Your favorites</p>
            <div className="grid grid-cols-2 gap-2 mb-4">
              {isLoadingFavorites ? (
                // Show 4 skeleton placeholders while loading
                Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={`skeleton-${i}`}
                    className="bg-stone-100 rounded-xl p-4 min-h-[80px] animate-pulse"
                  />
                ))
              ) : (
                filteredTopBusinesses.map((business) => (
                  <button
                    key={business.id}
                    onClick={() => onSelect(business)}
                    className="bg-gradient-to-br from-emerald-50 to-emerald-100/50 rounded-xl p-4 flex flex-col items-center gap-2 border border-emerald-200 hover:border-emerald-300 hover:shadow-md transition-all btn-press min-h-[80px]"
                  >
                    <div className="w-10 h-10 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600">
                      {categoryIcons[business.category || "default"] || categoryIcons.default}
                    </div>
                    <p className="font-medium text-stone-900 text-center text-sm leading-tight line-clamp-2">
                      {business.name}
                    </p>
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* All Businesses Section */}
        {filteredOtherBusinesses.length > 0 && (
          <div>
            {hasTopBusinesses && <p className="text-xs font-semibold text-stone-500 uppercase tracking-wide px-1 mb-2">All businesses</p>}
            <div className="grid grid-cols-2 gap-2">
              {filteredOtherBusinesses.map((business) => (
                <button
                  key={business.id}
                  onClick={() => onSelect(business)}
                  className="bg-white rounded-xl p-4 flex flex-col items-center gap-2 border border-stone-200 hover:border-stone-300 hover:shadow-sm transition-all btn-press min-h-[80px]"
                >
                  <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center text-stone-600">
                    {categoryIcons[business.category || "default"] || categoryIcons.default}
                  </div>
                  <p className="font-medium text-stone-900 text-center text-sm leading-tight line-clamp-2">
                    {business.name}
                  </p>
                </button>
              ))}
            </div>
          </div>
        )}

        {filteredTopBusinesses.length === 0 && filteredOtherBusinesses.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12">
            <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center mb-3">
              <Search className="w-5 h-5 text-stone-400" />
            </div>
            <p className="text-stone-500 text-sm">No businesses found</p>
          </div>
        )}
      </div>
    </div>
  );
}
