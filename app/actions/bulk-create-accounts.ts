"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { generateTemporaryPassword } from "@/lib/password-utils";
import { sendWelcomeEmail } from "@/lib/email";
import type { Member } from "@/lib/types";

export async function bulkCreateAccountsForMembers(members: Member[]) {
  const supabase = createAdminClient();
  const success: Array<{ member_id: string; name: string; email: string; tempPassword: string }> = [];
  const failed: Array<{ member_id: string; name: string; error: string }> = [];

  for (const member of members) {
    try {
      // Generate temporary password
      const tempPassword = generateTemporaryPassword();
      
      let authUserId: string;
      let isNewAccount = false;

      // First check if an auth user with this email already exists
      const { data: existingUsers } = await supabase.auth.admin.listUsers();
      const existingUser = existingUsers?.users.find(u => u.email?.toLowerCase() === member.email?.toLowerCase());

      if (existingUser) {
        // User already exists (likely a business owner who is also a member)
        // Just link this member to the existing auth account
        authUserId = existingUser.id;
        console.log("[v0] Linking member", member.first_name, member.last_name, "to existing auth user:", authUserId);
        
        // Update the password for the existing user
        const { error: updatePasswordError } = await supabase.auth.admin.updateUserById(
          authUserId,
          { password: tempPassword }
        );
        
        if (updatePasswordError) {
          console.warn("[v0] Failed to update password for existing user:", updatePasswordError);
        }
      } else {
        // Create new auth user
        const { data: authData, error: authError } = await supabase.auth.admin.createUser({
          email: member.email,
          password: tempPassword,
          email_confirm: true,
          user_metadata: {
            member_id: member.id,
            first_name: member.first_name,
            last_name: member.last_name,
          },
        });

        if (authError) {
          failed.push({
            member_id: member.id,
            name: `${member.first_name} ${member.last_name}`,
            error: authError.message,
          });
          continue;
        }
        
        authUserId = authData.user.id;
        isNewAccount = true;
      }

      // Update member with auth_user_id and approval status
      const { error: updateError, data: updateData } = await supabase
        .from("members")
        .update({ 
          auth_user_id: authUserId,
          approval_status: "approved" 
        })
        .eq("id", member.id)
        .select();

      console.log("[v0] Updated member:", member.first_name, member.last_name, "with auth_user_id:", authUserId, "Update result:", updateData, "Error:", updateError);

      if (updateError) {
        failed.push({
          member_id: member.id,
          name: `${member.first_name} ${member.last_name}`,
          error: "Failed to update member status",
        });
        continue;
      }

      // Send welcome email with temporary password (only for new accounts or when password was updated)
      if (isNewAccount || existingUser) {
        const emailResult = await sendWelcomeEmail({
          email: member.email,
          firstName: member.first_name,
          lastName: member.last_name,
          tempPassword,
          loginUrl: `${process.env.NEXT_PUBLIC_SITE_URL}/member/login`,
        });

        if (!emailResult.success) {
          console.warn(`Failed to send welcome email to ${member.email}: ${emailResult.error}`);
          // Don't fail the account creation just because email failed
        }
      }

      success.push({
        member_id: member.id,
        name: `${member.first_name} ${member.last_name}`,
        email: member.email,
        tempPassword,
      });

      // Add 600ms delay between emails to respect rate limit (2 req/sec = 500ms minimum, 600ms for safety)
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
