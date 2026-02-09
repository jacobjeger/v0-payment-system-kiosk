import { requestPasswordReset } from "@/app/actions/admin";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json(
        { success: false, error: "Email is required" },
        { status: 400 }
      );
    }

    const result = await requestPasswordReset(email);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to process password reset request" },
      { status: 500 }
    );
  }
}
