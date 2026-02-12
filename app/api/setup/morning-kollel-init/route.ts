import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

export async function POST() {
  try {
    const supabase = createAdminClient();
    
    console.log("[v0] Attempting to initialize morning_kollel_logs table...");

    // Try to insert a test record - Supabase will create the table if it doesn't exist
    // via the auto-create functionality
    const { data, error } = await supabase
      .from("morning_kollel_logs")
      .insert({
        logged_date: new Date().toISOString().split("T")[0],
        count: 0,
        notes: "Initialization record - can be deleted",
      })
      .select()
      .single();

    if (error) {
      console.error("[v0] Error initializing table:", error);
      
      // Try using raw SQL via exec if available
      const { error: sqlError } = await supabase.rpc("exec_sql", {
        sql: `
          CREATE TABLE IF NOT EXISTS public.morning_kollel_logs (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            count INTEGER NOT NULL DEFAULT 1,
            logged_date DATE NOT NULL DEFAULT CURRENT_DATE,
            logged_at TIMESTAMP NOT NULL DEFAULT NOW(),
            notes TEXT,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),
            updated_at TIMESTAMP NOT NULL DEFAULT NOW()
          );
          
          CREATE INDEX IF NOT EXISTS idx_morning_kollel_logs_date ON public.morning_kollel_logs(logged_date);
        `
      });

      if (sqlError) {
        console.error("[v0] SQL error:", sqlError);
        return NextResponse.json(
          { 
            success: false, 
            error: "Failed to create table. Please contact support.",
            details: error.message 
          },
          { status: 400 }
        );
      }
    }

    // Delete the initialization record if it was created
    if (data) {
      await supabase.from("morning_kollel_logs").delete().eq("id", data.id);
    }

    console.log("[v0] Morning Kollel table initialized successfully");
    return NextResponse.json({ 
      success: true, 
      message: "Morning Kollel table initialized successfully" 
    });
  } catch (error) {
    console.error("[v0] Exception in setup:", error);
    return NextResponse.json(
      { 
        success: false, 
        error: error instanceof Error ? error.message : "Failed to setup Morning Kollel table"
      },
      { status: 500 }
    );
  }
}
