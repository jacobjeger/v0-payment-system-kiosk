import { NextResponse } from "next/server";
import { sendAdminMFACode } from "@/app/actions/admin-mfa";

export async function POST(request: Request) {
  try {
    const { email, adminId } = await request.json();

    if (!email || !adminId) {
      return NextResponse.json(
        { success: false, error: "Email and admin ID are required" },
        { status: 400 }
      );
    }

    const result = await sendAdminMFACode(email, adminId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to send MFA code" },
      { status: 500 }
    );
  }
}
