"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { generateTemporaryPassword } from "@/lib/password-utils";
import { sendWelcomeEmail } from "@/lib/email";
import type { Member } from "@/lib/types";

export async function resendWelcomeEmails(members: Member[]) {
  const supabase = createAdminClient();
  const success: Array<{ member_id: string; name: string; email: string; tempPassword: string }> = [];
  const failed: Array<{ member_id: string; name: string; error: string }> = [];

  for (const member of members) {
    try {
      if (!member.user_id) {
        failed.push({
          member_id: member.id,
          name: `${member.first_name} ${member.last_name}`,
          error: "No account exists for this member",
        });
        continue;
      }

      // Generate new temporary password
      const tempPassword = generateTemporaryPassword();

      // Update the user's password in Supabase Auth
      const { error: passwordError } = await supabase.auth.admin.updateUserById(
        member.user_id,
        { password: tempPassword }
      );

      if (passwordError) {
        failed.push({
          member_id: member.id,
          name: `${member.first_name} ${member.last_name}`,
          error: `Failed to reset password: ${passwordError.message}`,
        });
        continue;
      }

      // Send welcome email with new temporary password
      const emailResult = await sendWelcomeEmail({
        email: member.email,
        firstName: member.first_name,
        lastName: member.last_name,
        tempPassword,
        loginUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/login`,
      });

      if (!emailResult.success) {
        failed.push({
          member_id: member.id,
          name: `${member.first_name} ${member.last_name}`,
          error: `Email failed: ${emailResult.error}`,
        });
        continue;
      }

      success.push({
        member_id: member.id,
        name: `${member.first_name} ${member.last_name}`,
        email: member.email,
        tempPassword,
      });

      // Add 600ms delay between emails to respect rate limit
      await new Promise(resolve => setTimeout(resolve, 600));

    } catch (error) {
      failed.push({
        member_id: member.id,
        name: `${member.first_name} ${member.last_name}`,
        error: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return { success, failed };
}
