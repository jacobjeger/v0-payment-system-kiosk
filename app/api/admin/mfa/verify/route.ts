import { NextResponse } from "next/server";
import { verifyAdminMFACode } from "@/app/actions/admin-mfa";

export async function POST(request: Request) {
  try {
    const { adminId, code } = await request.json();

    if (!adminId || !code) {
      return NextResponse.json(
        { success: false, error: "Admin ID and code are required" },
        { status: 400 }
      );
    }

    const result = await verifyAdminMFACode(adminId, code);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to verify MFA code" },
      { status: 500 }
    );
  }
}
