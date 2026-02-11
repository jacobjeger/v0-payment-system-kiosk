"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { sendCustomEmail } from "@/lib/email";

// Generate a 6-digit MFA code
function generateMFACode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

// Send MFA code via email
export async function sendAdminMFACode(email: string, adminId: string) {
  const supabase = createAdminClient();
  
  // Generate code
  const code = generateMFACode();
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

  // Store code in database
  const { error } = await supabase
    .from("admin_users")
    .update({
      mfa_code: code,
      mfa_code_expires_at: expiresAt.toISOString(),
    })
    .eq("id", adminId);

  if (error) {
    return { success: false, error: error.message };
  }

  // Send email
  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #333; font-size: 24px; margin-bottom: 20px;">Your Admin Login Code</h1>
      <p style="color: #666; font-size: 16px; line-height: 1.5;">
        Use this code to complete your admin login:
      </p>
      <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
        <p style="font-size: 32px; font-weight: bold; letter-spacing: 8px; margin: 0; color: #10b981;">
          ${code}
        </p>
      </div>
      <p style="color: #666; font-size: 14px; line-height: 1.5;">
        This code will expire in 10 minutes. If you didn't request this code, please ignore this email.
      </p>
      <p style="color: #999; font-size: 12px; line-height: 1.5; margin-top: 30px;">
        For security reasons, never share this code with anyone.
      </p>
    </div>
  `;

  const emailResult = await sendCustomEmail(
    email,
    "Your Admin Login Code",
    html,
    { recipientType: "admin" }
  );

  if (!emailResult.success) {
    return { success: false, error: "Failed to send MFA code email" };
  }

  return { success: true };
}

// Verify MFA code
export async function verifyAdminMFACode(adminId: string, code: string) {
  const supabase = createAdminClient();

  const { data: admin, error } = await supabase
    .from("admin_users")
    .select("mfa_code, mfa_code_expires_at")
    .eq("id", adminId)
    .single();

  if (error || !admin) {
    return { success: false, error: "Admin not found" };
  }

  if (!admin.mfa_code || !admin.mfa_code_expires_at) {
    return { success: false, error: "No MFA code found. Please request a new code." };
  }

  // Check if code expired
  if (new Date(admin.mfa_code_expires_at) < new Date()) {
    return { success: false, error: "Code has expired. Please request a new code." };
  }

  // Verify code
  if (admin.mfa_code !== code) {
    return { success: false, error: "Invalid code. Please try again." };
  }

  // Clear the code and update verified timestamp
  await supabase
    .from("admin_users")
    .update({
      mfa_code: null,
      mfa_code_expires_at: null,
      mfa_verified_at: new Date().toISOString(),
    })
    .eq("id", adminId);

  return { success: true };
}

// Toggle MFA for admin
export async function toggleAdminMFA(adminId: string, enabled: boolean) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("admin_users")
    .update({ mfa_enabled: enabled })
    .eq("id", adminId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Check admin MFA status by email
export async function checkAdminMFAStatus(email: string) {
  const supabase = createAdminClient();

  const { data: admin, error } = await supabase
    .from("admin_users")
    .select("id, mfa_enabled")
    .eq("email", email.toLowerCase())
    .single();

  if (error || !admin) {
    return { success: false, error: "Admin not found", mfaEnabled: false };
  }

  return {
    success: true,
    adminId: admin.id,
    mfaEnabled: admin.mfa_enabled || false,
  };
}

// Check if device is trusted
export async function isDeviceTrusted(adminId: string, deviceFingerprint: string) {
  const supabase = createAdminClient();

  const now = new Date().toISOString();
  
  const { data, error } = await supabase
    .from("trusted_devices")
    .select("id, expires_at")
    .eq("admin_user_id", adminId)
    .eq("device_fingerprint", deviceFingerprint)
    .maybeSingle();

  // Check if device exists and hasn't expired
  if (data && data.expires_at) {
    const expiresAt = new Date(data.expires_at);
    const isExpired = expiresAt < new Date();
    return { trusted: !isExpired };
  }
  
  return { trusted: !!data && !error };
}

// Trust a device
export async function trustDevice(adminId: string, deviceFingerprint: string, deviceName: string) {
  const supabase = createAdminClient();

  // Set expiration to 30 days from now
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + 30);

  const { error } = await supabase
    .from("trusted_devices")
    .upsert({
      admin_user_id: adminId,
      device_fingerprint: deviceFingerprint,
      device_name: deviceName,
      expires_at: expiresAt.toISOString(),
      last_used_at: new Date().toISOString(),
    }, {
      onConflict: "admin_user_id,device_fingerprint"
    });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Remove trusted device
export async function removeTrustedDevice(adminId: string, deviceId: string) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("trusted_devices")
    .delete()
    .eq("id", deviceId)
    .eq("admin_user_id", adminId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}

// Get all trusted devices for admin
export async function getTrustedDevices(adminId: string) {
  const supabase = createAdminClient();

  const { data, error } = await supabase
    .from("trusted_devices")
    .select("*")
    .eq("admin_user_id", adminId)
    .order("last_used_at", { ascending: false });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true, devices: data };
}

// Export aliases for compatibility with updated signature
export async function sendMFACode(email: string, adminId: string) {
  return sendAdminMFACode(email, adminId);
}

export const verifyMFACode = verifyAdminMFACode;
