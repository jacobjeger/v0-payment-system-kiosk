"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";

export async function updateMemberPin(memberId: string, newPin: string) {
  const supabase = createAdminClient();

  // Validate PIN format
  if (!/^\d{4}$/.test(newPin)) {
    return { success: false, error: "PIN must be exactly 4 digits" };
  }

  // Update the member's PIN
  const { error } = await supabase
    .from("members")
    .update({ 
      pin_code: newPin,
      pin_confirmed: true // Mark as confirmed so they don't see the screen again
    })
    .eq("id", memberId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/kiosk");
  return { success: true };
}

export async function confirmMemberPin(memberId: string) {
  const supabase = createAdminClient();

  // Mark PIN as confirmed
  const { error } = await supabase
    .from("members")
    .update({ pin_confirmed: true })
    .eq("id", memberId);

  if (error) {
    return { success: false, error: error.message };
  }

  revalidatePath("/kiosk");
  return { success: true };
}
