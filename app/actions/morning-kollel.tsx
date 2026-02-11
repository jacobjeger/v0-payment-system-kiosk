"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function logMorningKollel() {
  const supabase = createAdminClient();

  try {
    // Get today's date
    const today = new Date().toISOString().split("T")[0];

    // Try to update today's log, if it doesn't exist, create it
    const { data: existingLog, error: selectError } = await supabase
      .from("morning_kollel_logs")
      .select("id, count")
      .eq("logged_date", today)
      .single();

    let result;

    if (existingLog) {
      // Update existing log
      const { data, error } = await supabase
        .from("morning_kollel_logs")
        .update({
          count: existingLog.count + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingLog.id)
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }
      result = data;
    } else {
      // Create new log for today
      const { data, error } = await supabase
        .from("morning_kollel_logs")
        .insert({
          logged_date: today,
          count: 1,
          logged_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (error) {
        return { success: false, error: error.message };
      }
      result = data;
    }

    revalidatePath("/kiosk");
    return { success: true, count: result.count, date: result.logged_date };
  } catch (error) {
    console.error("[v0] Error logging morning kollel:", error);
    return { success: false, error: "Failed to log coffee" };
  }
}

export async function getMorningKollelStats() {
  const supabase = createAdminClient();

  try {
    const { data, error } = await supabase
      .from("morning_kollel_logs")
      .select("*")
      .order("logged_date", { ascending: false });

    if (error) {
      return { success: false, error: error.message, stats: null };
    }

    // Calculate stats
    const today = new Date().toISOString().split("T")[0];
    const thisWeekStart = new Date();
    thisWeekStart.setDate(thisWeekStart.getDate() - thisWeekStart.getDay());
    const weekStart = thisWeekStart.toISOString().split("T")[0];

    const thisMonthStart = new Date();
    thisMonthStart.setDate(1);
    const monthStart = thisMonthStart.toISOString().split("T")[0];

    const todayLog = data?.find((log) => log.logged_date === today);
    const weekLogs = data?.filter((log) => log.logged_date >= weekStart) || [];
    const monthLogs = data?.filter((log) => log.logged_date >= monthStart) || [];

    const todayCount = todayLog?.count || 0;
    const weekCount = weekLogs.reduce((sum, log) => sum + log.count, 0);
    const monthCount = monthLogs.reduce((sum, log) => sum + log.count, 0);

    return {
      success: true,
      stats: {
        today: todayCount,
        week: weekCount,
        month: monthCount,
        allLogs: data || [],
      },
    };
  } catch (error) {
    console.error("[v0] Error fetching morning kollel stats:", error);
    return { success: false, error: "Failed to fetch stats", stats: null };
  }
}
