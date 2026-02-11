import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

interface OffsetRequest {
  businessId: string;
  memberId: string;
  billingCycleId: string;
  offsetAmount: number;
}

export async function POST(request: NextRequest) {
  try {
    const body: OffsetRequest = await request.json();
    const { businessId, memberId, billingCycleId, offsetAmount } = body;

    if (!businessId || !memberId || !billingCycleId || offsetAmount <= 0) {
      return NextResponse.json(
        { success: false, error: "Missing or invalid required fields" },
        { status: 400 }
      );
    }

    const supabase = createAdminClient();

    // Get member's current balance
    const { data: member, error: memberError } = await supabase
      .from("members")
      .select("balance")
      .eq("id", memberId)
      .single();

    if (memberError || !member) {
      return NextResponse.json(
        { success: false, error: "Member not found" },
        { status: 404 }
      );
    }

    // Update member balance (reduce by offset amount)
    const newBalance = Math.max(0, member.balance - offsetAmount);
    const { error: updateError } = await supabase
      .from("members")
      .update({ balance: newBalance })
      .eq("id", memberId);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 }
      );
    }

    // Record the offset in a transactions note or audit log
    // Create a special offset transaction for record-keeping
    const { error: txError } = await supabase
      .from("transactions")
      .insert({
        member_id: memberId,
        business_id: businessId,
        amount: -offsetAmount, // Negative to show it's a reduction
        balance_before: member.balance,
        balance_after: newBalance,
        description: `Balance offset for payout (${memberId} is owner of ${businessId})`,
        source: "admin_panel",
        billing_cycle_id: billingCycleId,
      });

    if (txError) {
      console.error("[v0] Error recording offset transaction:", txError);
      // Don't fail if transaction recording fails - balance was already updated
    }

    return NextResponse.json({
      success: true,
      memberBalanceBefore: member.balance,
      memberBalanceAfter: newBalance,
      offsetAmount,
    });
  } catch (error) {
    console.error("[v0] Apply offset error:", error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
