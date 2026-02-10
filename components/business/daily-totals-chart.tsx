"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface DailyTotal {
  date: string;
  amount: number;
  count: number;
}

interface DailyTotalsChartProps {
  businessId: string;
  activeDaysAverage?: boolean;
}

export function DailyTotalsChart({ businessId, activeDaysAverage = false }: DailyTotalsChartProps) {
  const [data, setData] = useState<DailyTotal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDailyTotals();
  }, [businessId, activeDaysAverage]);

  async function loadDailyTotals() {
    setLoading(true);
    const supabase = createClient();

    // Get last 7 days of transactions
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 6);
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    let query = supabase
      .from("transactions")
      .select("amount, created_at, is_active_day")
      .eq("business_id", businessId)
      .gte("created_at", startDate.toISOString())
      .lte("created_at", endDate.toISOString());
    
    // Filter by active days if enabled
    if (activeDaysAverage) {
      query = query.eq("is_active_day", true);
    }

    const { data: transactions } = await query;

    // Group by date
    const dailyMap = new Map<string, { amount: number; count: number }>();

    // Initialize last 7 days
    for (let i = 6; i >= 0; i--) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const dateStr = date.toLocaleDateString("en-IL", {
        month: "short",
        day: "numeric",
      });
      dailyMap.set(dateStr, { amount: 0, count: 0 });
    }

    // Sum transactions by date
    transactions?.forEach((t) => {
      const date = new Date(t.created_at).toLocaleDateString("en-IL", {
        month: "short",
        day: "numeric",
      });
      const current = dailyMap.get(date) || { amount: 0, count: 0 };
      current.amount += Number(t.amount);
      current.count += 1;
      dailyMap.set(date, current);
    });

    const chartData = Array.from(dailyMap.entries()).map(([date, { amount, count }]) => ({
      date,
      amount: Math.round(amount * 100) / 100,
      count,
    }));

    setData(chartData);
    setLoading(false);
  }

  const total = data.reduce((sum, d) => sum + d.amount, 0);
  const activeDays = data.filter(d => d.count > 0).length;
  const divisor = activeDaysAverage ? Math.max(activeDays, 1) : Math.max(data.length, 1);
  const avgDaily = total / divisor;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Daily Totals - Last 7 Days</CardTitle>
        <CardDescription>
          Total: ₪{total.toFixed(2)} | Average: ₪{avgDaily.toFixed(2)}/day
          {activeDaysAverage && activeDays > 0 && (
            <span className="text-xs ml-1">({activeDays} active day{activeDays !== 1 ? "s" : ""})</span>
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-64 flex items-center justify-center text-zinc-500">
            Loading chart...
          </div>
        ) : data.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-zinc-500">
            No transactions in the last 7 days
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" />
              <XAxis dataKey="date" stroke="#71717a" style={{ fontSize: "12px" }} />
              <YAxis stroke="#71717a" style={{ fontSize: "12px" }} />
              <Tooltip
                formatter={(value: any) => `₪${value.toFixed(2)}`}
                contentStyle={{
                  backgroundColor: "#fff",
                  border: "1px solid #e4e4e7",
                  borderRadius: "8px",
                }}
              />
              <Bar dataKey="amount" fill="#10b981" name="Amount" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
