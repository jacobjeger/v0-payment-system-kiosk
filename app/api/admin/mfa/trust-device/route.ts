import { NextResponse } from "next/server";
import { trustDevice } from "@/app/actions/admin-mfa";

export async function POST(request: Request) {
  try {
    const { adminId, deviceFingerprint, deviceName } = await request.json();

    if (!adminId || !deviceFingerprint || !deviceName) {
      return NextResponse.json(
        { success: false, error: "Admin ID, device fingerprint, and device name are required" },
        { status: 400 }
      );
    }

    const result = await trustDevice(adminId, deviceFingerprint, deviceName);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Failed to trust device" },
      { status: 500 }
    );
  }
}
