"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/lib/supabase/client";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

interface DailyTransaction {
  date: string;
  count: number;
  amount: number;
}

export function Transaction7DayChart() {
  const [data, setData] = useState<DailyTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadLast7Days();
  }, []);

  async function loadLast7Days() {
    setLoading(true);
    const supabase = createClient();

    // Get last 7 days of transactions from all businesses
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 6);
    const endDate = new Date();
    endDate.setHours(23, 59, 59, 999);

    // Fetch all transactions with pagination for >1000 rows
    let allTransactions: any[] = [];
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const { data: batch } = await supabase
        .from("transactions")
        .select("amount, created_at")
        .gte("created_at", startDate.toISOString())
        .lte("created_at", endDate.toISOString())
        .range(offset, offset + 999);

      if (!batch || batch.length === 0) {
        hasMore = false;
      } else {
        allTransactions = allTransactions.concat(batch);
        offset += 1000;
        if (batch.length < 1000) {
          hasMore = false;
        }
      }
    }

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
    allTransactions?.forEach((t) => {
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
      count,
      amount: Math.round(amount * 100) / 100,
    }));

    setData(chartData);
    setLoading(false);
  }

  const totalAmount = data.reduce((sum, d) => sum + d.amount, 0);
  const totalCount = data.reduce((sum, d) => sum + d.count, 0);
  const avgDaily = totalCount > 0 ? (totalAmount / totalCount).toFixed(2) : "0.00";

  return (
    <Card>
      <CardHeader>
        <CardTitle>7-Day Transactions</CardTitle>
        <CardDescription>
          Total: ₪{totalAmount.toFixed(2)} | {totalCount} transactions | Average: ₪{avgDaily}/transaction
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="h-64 flex items-center justify-center text-zinc-500">
            Loading chart...
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip 
                formatter={(value: any, name: string) => {
                  if (name === "amount") return `₪${value.toFixed(2)}`;
                  return value;
                }}
              />
              <Legend />
              <Bar yAxisId="left" dataKey="count" fill="#10b981" name="Transaction Count" />
              <Bar yAxisId="right" dataKey="amount" fill="#3b82f6" name="Total Amount (₪)" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
