import { NextResponse } from "next/server";
import { toggleAdminMFA } from "@/app/actions/admin-mfa";

export async function POST(request: Request) {
  try {
    const { adminId, enabled } = await request.json();

    if (!adminId || typeof enabled !== "boolean") {
      return NextResponse.json(
        { success: false, error: "Invalid parameters" },
        { status: 400 }
      );
    }

    const result = await toggleAdminMFA(adminId, enabled);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Toggle MFA error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to toggle MFA" },
      { status: 500 }
    );
  }
}
