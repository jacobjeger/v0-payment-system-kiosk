import { createAdminClient } from "@/lib/supabase/server";
import { hashPassword } from "@/lib/password";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  try {
    const { businessId, password } = await request.json();

    console.log("[v0] Password API called with:", { businessId, passwordLength: password?.length });

    if (!businessId || !password) {
      console.log("[v0] Missing fields:", { businessId, password });
      return NextResponse.json(
        { success: false, error: "Missing required fields" },
        { status: 400 }
      );
    }

    if (password.length < 6) {
      return NextResponse.json(
        { success: false, error: "Password must be at least 6 characters" },
        { status: 400 }
      );
    }

    // Hash the password
    const passwordHash = await hashPassword(password);
    console.log("[v0] Password hashed, hash length:", passwordHash.length);

    // Update business password_hash
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from("businesses")
      .update({
        password_hash: passwordHash,
        updated_at: new Date().toISOString(),
      })
      .eq("id", businessId);

    console.log("[v0] Supabase update result:", { data, error: error?.message });

    if (error) {
      console.log("[v0] Database error:", error);
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      );
    }

    console.log("[v0] Password updated successfully");
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[v0] Update password error:", error);
    return NextResponse.json(
      { success: false, error: (error as Error).message },
      { status: 500 }
    );
  }
}
