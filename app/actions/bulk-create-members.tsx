"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { sendEmail } from "@/lib/email";
import { generateRandomPin } from "@/lib/utils/pin";

export async function bulkCreateMembers(
  membersData: Array<{
    member_code: string;
    first_name: string;
    last_name: string;
    email: string;
    phone?: string;
    business_id: string;
  }>
) {
  const supabase = createAdminClient();
  const results = {
    success: [] as Array<{ code: string; email: string; tempPassword: string }>,
    failed: [] as Array<{ code: string; email: string; error: string }>,
  };

  for (const memberData of membersData) {
    try {
      // Generate temporary password
      const tempPassword = Math.random().toString(36).slice(-8);
      const pin = generateRandomPin();

      // Create member account
      const { data: member, error: createError } = await supabase
        .from("members")
        .insert({
          member_code: memberData.member_code,
          first_name: memberData.first_name,
          last_name: memberData.last_name,
          email: memberData.email,
          phone: memberData.phone || null,
          business_id: memberData.business_id,
          status: "active",
          is_active: true,
          pin_code: pin,
          pin_confirmed: false,
          approval_status: "approved",
          balance: 0,
        })
        .select()
        .single();

      if (createError) {
        results.failed.push({
          code: memberData.member_code,
          email: memberData.email,
          error: createError.message,
        });
        continue;
      }

      // Send welcome email with temporary password
      const emailResult = await sendEmail({
        to: memberData.email,
        subject: "Welcome to PDCA - Your Account is Ready",
        html: `
          <h2>Welcome to PDCA, ${memberData.first_name}!</h2>
          <p>Your account has been created and is ready to use.</p>
          <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Account Details:</strong></p>
            <p><strong>Member Code:</strong> ${memberData.member_code}</p>
            <p><strong>Email:</strong> ${memberData.email}</p>
            <p><strong>Temporary Password:</strong> ${tempPassword}</p>
            <p><strong>Your PIN:</strong> ${pin}</p>
          </div>
          <p><strong>Important:</strong></p>
          <ul>
            <li>Visit <a href="${process.env.NEXT_PUBLIC_SITE_URL}">tcpdca.com</a> to log in and update your password</li>
            <li>Use your PIN (${pin}) for all kiosk transactions</li>
            <li>Keep your PIN confidential</li>
          </ul>
          <p>If you have any questions, please contact support.</p>
        `,
      });

      if (!emailResult.success) {
        results.failed.push({
          code: memberData.member_code,
          email: memberData.email,
          error: "Account created but failed to send email: " + emailResult.error,
        });
        continue;
      }

      results.success.push({
        code: memberData.member_code,
        email: memberData.email,
        tempPassword,
      });
    } catch (error) {
      results.failed.push({
        code: memberData.member_code,
        email: memberData.email,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return results;
}
