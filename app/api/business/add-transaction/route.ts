import { createAdminClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { businessId, memberId, amount, description } = await request.json();

    if (!businessId || !memberId || !amount) {
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Verify business has permission to add transactions
    const { data: business } = await supabase
      .from("businesses")
      .select("can_add_transactions, is_active")
      .eq("id", businessId)
      .single();

    if (!business) {
      return NextResponse.json(
        { success: false, error: "Business not found" },
        { status: 404 }
      );
    }

    if (!business.can_add_transactions) {
      return NextResponse.json(
        { success: false, error: "Business does not have permission to add transactions" },
        { status: 403 }
      );
    }

    if (!business.is_active) {
      return NextResponse.json(
        { success: false, error: "Business is not active" },
        { status: 403 }
      );
    }

    // Get active billing cycle
    const { data: activeCycle } = await supabase
      .from("billing_cycles")
      .select("id")
      .eq("status", "active")
      .single();

    if (!activeCycle) {
      return NextResponse.json(
        { success: false, error: "No active billing cycle found" },
        { status: 400 }
      );
    }

    // Get member's current balance
    const { data: member } = await supabase
      .from("members")
      .select("balance")
      .eq("id", memberId)
      .single();

    if (!member) {
      return NextResponse.json(
        { success: false, error: "Member not found" },
        { status: 404 }
      );
    }

    const balanceBefore = member.balance || 0;
    const balanceAfter = balanceBefore + parseFloat(amount);

    // Create transaction
    const { data: transaction, error } = await supabase
      .from("transactions")
      .insert({
        business_id: businessId,
        member_id: memberId,
        amount: parseFloat(amount),
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        description: description || "Manual entry by business",
        billing_cycle_id: activeCycle.id,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (error) {
      console.error("[v0] Transaction creation error:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    // Update member's balance
    const { error: updateError } = await supabase
      .from("members")
      .update({ balance: balanceAfter })
      .eq("id", memberId);

    if (updateError) {
      console.error("[v0] Balance update error:", updateError);
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: transaction,
    });
  } catch (error) {
    console.error("[v0] API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to add transaction" },
      { status: 500 }
    );
  }
}
