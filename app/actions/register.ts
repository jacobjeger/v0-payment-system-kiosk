"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { encryptCardData } from "@/lib/encryption";

export async function registerMember(data: {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  israeliPhone: string;
  memberType: string;
  cardNumber: string;
  cardExpMonth: string;
  cardExpYear: string;
  cardCvv: string;
  pinCode: string;
}) {
  const supabase = createAdminClient();

  // Check if email already exists
  const { data: existing } = await supabase
    .from("members")
    .select("id")
    .eq("email", data.email)
    .single();

  if (existing) {
    return { success: false, error: "An account with this email already exists" };
  }

  // Generate a unique member code
  const memberCode = `M${Date.now().toString(36).toUpperCase()}`;

  // Encrypt card data
  const encryptedCardNumber = encryptCardData(data.cardNumber);
  const encryptedCvv = encryptCardData(data.cardCvv);
  const cardLast4 = data.cardNumber.slice(-4);
  const fullExpYear = `20${data.cardExpYear}`;

  // Create member with pending approval status
  const { error } = await supabase.from("members").insert({
    member_code: memberCode,
    first_name: data.firstName,
    last_name: data.lastName,
    email: data.email,
    phone: data.phone,
    israeli_phone: data.israeliPhone,
    member_type: data.memberType,
    card_number: encryptedCardNumber,
    card_cvc: encryptedCvv,
    card_exp_month: data.cardExpMonth,
    card_exp_year: fullExpYear,
    card_last_four: cardLast4,
    pin_code: data.pinCode,
    balance: 0,
    status: "active",
    approval_status: "pending",
  });

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
