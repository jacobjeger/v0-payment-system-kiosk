import { createAdminClient } from "@/lib/supabase/admin";

export async function POST() {
  const supabase = createAdminClient();

  try {
    // Try to insert a test record - if table doesn't exist, it will be created
    const { error } = await supabase
      .from("morning_kollel_logs")
      .insert({
        logged_date: new Date().toISOString().split("T")[0],
        count: 0,
      })
      .select()
      .single();

    if (error && error.code !== "PGRST116") {
      // PGRST116 is the error for trying to insert 0 rows
      return Response.json(
        { success: false, error: error.message, code: error.code },
        { status: 400 }
      );
    }

    return Response.json({ success: true, message: "Table verified/created" });
  } catch (error) {
    console.error("[v0] Error setting up morning kollel table:", error);
    return Response.json(
      { success: false, error: "Failed to setup table" },
      { status: 500 }
    );
  }
}
