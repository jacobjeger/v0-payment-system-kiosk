import { createAdminClient } from "@/lib/supabase/server";
import { BusinessList } from "@/components/admin/business-list";
import { AddBusinessDialog } from "@/components/admin/add-business-dialog";
import { BulkBusinessUploadDialog } from "@/components/admin/bulk-business-upload-dialog";

export default async function BusinessesPage() {
  const supabase = createAdminClient();

  const { data: businesses } = await supabase
    .from("businesses")
    .select("*")
    .is("deleted_at", null)
    .order("name", { ascending: true });

  return (
    <div className="max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-foreground">Businesses</h1>
          <p className="text-muted-foreground mt-1">
            Manage all businesses in the PDCA system
          </p>
        </div>
        <div className="flex gap-3">
          <BulkBusinessUploadDialog />
          <AddBusinessDialog />
        </div>
      </div>

      <BusinessList businesses={businesses || []} />
    </div>
  );
}
