import { createAdminClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";

// Force dynamic rendering for fresh data
export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = createAdminClient();

  // Parallel fetch for maximum speed
  const [membersRes, businessesRes] = await Promise.all([
    supabase
      .from("members")
      .select("id, member_code, first_name, last_name, email, balance, is_active, pin_code, status, card_status, kiosk_message, approval_status, skip_pin, is_cash_collector, cash_collector_pin, pin_confirmed")
      .or("status.eq.active,status.eq.paused,is_active.eq.false")
      .or("approval_status.eq.approved,approval_status.is.null")
      .order("last_name", { ascending: true }),
    supabase
      .from("businesses")
      .select("id, name, description, category, is_active, preset_amounts")
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("name", { ascending: true }),
  ]);

  return NextResponse.json({
    members: membersRes.data || [],
    businesses: businessesRes.data || [],
  }, {
    headers: {
      "Cache-Control": "public, s-maxage=5, stale-while-revalidate=10",
    },
  });
}
