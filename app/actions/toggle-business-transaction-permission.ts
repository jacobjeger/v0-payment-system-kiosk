"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function toggleBusinessTransactionPermission(
  businessId: string,
  canAddTransactions: boolean
) {
  const supabase = createAdminClient();

  const { error } = await supabase
    .from("businesses")
    .update({ can_add_transactions: canAddTransactions })
    .eq("id", businessId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath(`/admin/businesses/${businessId}`);
  revalidatePath("/admin/businesses");

  return { success: true };
}
