"use server";

import { createAdminClient } from "@/lib/supabase/server";

export async function syncAuthUsersToMembers() {
  const supabase = createAdminClient();

  try {
    // Get all members without auth_user_id
    const { data: membersWithoutAuth, error: membersError } = await supabase
      .from("members")
      .select("id, email, first_name, last_name")
      .is("auth_user_id", null);

    if (membersError) {
      return { success: false, error: membersError.message };
    }

    if (!membersWithoutAuth || membersWithoutAuth.length === 0) {
      return { success: true, synced: 0, failed: 0, message: "No members need syncing" };
    }

    // Get all auth users (paginate to get all of them)
    const allAuthUsers: any[] = [];
    let page = 1;
    let hasMore = true;
    
    while (hasMore) {
      const { data: authUsers, error: authError } = await supabase.auth.admin.listUsers({
        page,
        perPage: 1000,
      });

      if (authError) {
        return { success: false, error: authError.message };
      }

      allAuthUsers.push(...authUsers.users);
      
      // Check if there are more pages
      hasMore = authUsers.users.length === 1000;
      page++;
    }

    console.log("[v0] Fetched total auth users:", allAuthUsers.length);

    const synced: Array<{ member_id: string; name: string; email: string }> = [];
    const failed: Array<{ member_id: string; name: string; email: string; error: string }> = [];

    // Match and sync
    for (const member of membersWithoutAuth) {
      const authUser = allAuthUsers.find((u) => u.email?.toLowerCase() === member.email?.toLowerCase());

      if (!authUser) {
        failed.push({
          member_id: member.id,
          name: `${member.first_name} ${member.last_name}`,
          email: member.email,
          error: "No matching auth user found",
        });
        continue;
      }

      // Update member with auth_user_id
      const { error: updateError } = await supabase
        .from("members")
        .update({ auth_user_id: authUser.id })
        .eq("id", member.id);

      if (updateError) {
        failed.push({
          member_id: member.id,
          name: `${member.first_name} ${member.last_name}`,
          email: member.email,
          error: updateError.message,
        });
      } else {
        synced.push({
          member_id: member.id,
          name: `${member.first_name} ${member.last_name}`,
          email: member.email,
        });
      }
    }

    return {
      success: true,
      synced: synced.length,
      failed: failed.length,
      details: { synced, failed },
    };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
