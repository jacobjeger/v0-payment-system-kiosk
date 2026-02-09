import { createAdminClient } from "@/lib/supabase/server";
import { MemberList } from "@/components/admin/member-list";
import { AddMemberDialog } from "@/components/admin/add-member-dialog";
import { BulkUploadDialog } from "@/components/admin/bulk-upload-dialog";
import { BulkCreateAccountsDialog } from "@/components/admin/bulk-create-accounts-dialog";
import { SyncAuthUsersDialog } from "@/components/admin/sync-auth-users-dialog";
import { PendingApprovalsSection } from "@/components/admin/pending-approvals-section";
import { DeletedMembersSection } from "@/components/admin/deleted-members-section";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MembersPage() {
  const supabase = createAdminClient();

  const { data: members } = await supabase
    .from("members")
    .select("*")
    .neq("status", "deleted")
    .order("last_name", { ascending: true });

  const { data: pendingMembers } = await supabase
    .from("members")
    .select("*")
    .eq("approval_status", "pending")
    .order("created_at", { ascending: false });

  const { data: deletedMembers } = await supabase
    .from("members")
    .select("*")
    .eq("status", "deleted")
    .order("last_name", { ascending: true });

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Members</h1>
          <p className="text-muted-foreground mt-1">
            Manage member accounts and balances
          </p>
        </div>
        <div className="flex items-center gap-3">
          <BulkUploadDialog />
          <BulkCreateAccountsDialog members={members || []} />
          <SyncAuthUsersDialog />
          <AddMemberDialog />
        </div>
      </div>

      {/* Pending Approvals Section */}
      {pendingMembers && pendingMembers.length > 0 && (
        <PendingApprovalsSection members={pendingMembers} />
      )}

      <MemberList members={members || []} />

      {/* Deleted Members Section */}
      {deletedMembers && deletedMembers.length > 0 && (
        <DeletedMembersSection members={deletedMembers} />
      )}
    </div>
  );
}
