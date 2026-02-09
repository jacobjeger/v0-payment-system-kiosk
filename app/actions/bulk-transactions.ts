"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { logTransactionToSheet } from "@/lib/google-sheets";

interface BulkTransactionRow {
  memberCode?: string;
  lastName?: string;
  firstName?: string;
  businessName: string;
  amount: number;
  description?: string;
}

interface BulkUploadResult {
  success: boolean;
  inserted: number;
  errors: Array<{ row: number; error: string; data: any }>;
  message?: string;
}

export async function bulkUploadTransactions(
  csvData: string,
  cycleId?: string
): Promise<BulkUploadResult> {
  const supabase = createAdminClient();
  
  const errors: Array<{ row: number; error: string; data: BulkTransactionRow }> = [];
  let inserted = 0;

  // Get active cycle if not provided
  let billingCycleId = cycleId;
  if (!billingCycleId) {
    const { data: activeCycle } = await supabase
      .from("billing_cycles")
      .select("id")
      .eq("status", "active")
      .single();
    billingCycleId = activeCycle?.id;
  }

  // Parse CSV
  const lines = csvData.trim().split("\n");
  if (lines.length < 2) {
    return {
      success: false,
      inserted: 0,
      errors: [],
      message: "CSV file is empty or has no data rows",
    };
  }

  // Helper function to parse CSV line preserving empty columns
  function parseCSVLine(line: string): string[] {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    result.push(current.trim());
    return result;
  }

  // Parse header row to determine format
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);

  // Detect format: Wide format (Last Name, First Name, Total, Business1, Business2...) 
  // or Narrow format (Member Code, Business Name, Amount, Description)
  const isWideFormat = headers[0]?.toLowerCase().includes("last") && 
                       headers[1]?.toLowerCase().includes("first");

  // Skip header row
  const dataRows = lines.slice(1);

  // Get all members and businesses for lookup
  const { data: members } = await supabase
    .from("members")
    .select("id, first_name, last_name, member_code, balance");
  
  const { data: businesses } = await supabase
    .from("businesses")
    .select("id, name");

  if (!members || !businesses) {
    return {
      success: false,
      inserted: 0,
      errors: [],
      message: "Failed to fetch members or businesses",
    };
  }

  // Create lookup maps
  const memberByCodeMap = new Map(
    members.map((m) => [m.member_code.toLowerCase(), m])
  );
  const memberByNameMap = new Map(
    members.map((m) => [`${m.last_name.toLowerCase()}|${m.first_name.toLowerCase()}`, m])
  );
  const businessMap = new Map(
    businesses.map((b) => [b.name.toLowerCase(), b])
  );

  // Process each row based on format
  if (isWideFormat) {
    // Wide format: Last Name, First Name, Total, Business1, Business2, ...
    for (let i = 0; i < dataRows.length; i++) {
      const line = dataRows[i].trim();
      if (!line) continue;

      const rowNum = i + 2;
      const values = parseCSVLine(line);

      if (values.length < 3) {
        errors.push({
          row: rowNum,
          error: "Invalid row format",
          data: { values },
        });
        continue;
      }

      const [lastName, firstName, totalStr, ...businessAmounts] = values;
      
      // Find member by name
      const memberKey = `${lastName.toLowerCase()}|${firstName.toLowerCase()}`;
      const member = memberByNameMap.get(memberKey);
      
      if (!member) {
        errors.push({
          row: rowNum,
          error: `Member not found: ${firstName} ${lastName}`,
          data: { lastName, firstName },
        });
        continue;
      }

      // Process each business column (skip Total column at index 2)
      // Headers: [Last Name, First Name, Total, Business1, Business2, ...]
      // Values: [lastName, firstName, totalStr, amt1, amt2, ...]
      // businessAmounts = [amt1, amt2, ...]
      for (let j = 3; j < headers.length; j++) {
        const businessName = headers[j].trim();
        const businessIndex = j - 3; // Map header index to businessAmounts index
        const amountStr = businessAmounts[businessIndex];
        
        // Skip empty columns or header placeholders
        if (!businessName || businessName === "" || businessName.toLowerCase() === "email") continue;
        if (!amountStr || amountStr.trim() === "" || amountStr === "0") continue;
        
        const amount = parseFloat(amountStr);
        if (isNaN(amount) || amount <= 0) continue;

        // Find business with flexible matching
        const businessKey = businessName.toLowerCase().trim();
        const business = businessMap.get(businessKey);
        if (!business) {
          errors.push({
            row: rowNum,
            error: `Business not found in database: "${businessName}". Available businesses: ${Array.from(businessMap.keys()).slice(0, 5).join(", ")}...`,
            data: { lastName, firstName, businessName, amount },
          });
          continue;
        }

        // Calculate balances
        const balanceBefore = Number(member.balance);
        const balanceAfter = balanceBefore + amount;

        // Insert transaction
        const { error: insertError } = await supabase.from("transactions").insert({
          member_id: member.id,
          business_id: business.id,
          amount,
          balance_before: balanceBefore,
          balance_after: balanceAfter,
          description: `${businessName} - ₪${amount.toFixed(2)}`,
          billing_cycle_id: billingCycleId,
          source: "bulk_upload",
        });

        if (insertError) {
          errors.push({
            row: rowNum,
            error: insertError.message,
            data: { lastName, firstName, businessName, amount },
          });
          continue;
        }

        // Update member balance
        const { error: updateError } = await supabase
          .from("members")
          .update({ balance: balanceAfter })
          .eq("id", member.id);

        if (updateError) {
          errors.push({
            row: rowNum,
            error: `Transaction created but failed to update balance: ${updateError.message}`,
            data: { lastName, firstName, businessName, amount },
          });
          continue;
        }

        // Log to Google Sheets in background
        logTransactionToSheet({
          memberName: `${member.first_name} ${member.last_name}`,
          memberCode: member.member_code,
          businessName: business.name,
          amount,
          description: `${businessName} - ₪${amount.toFixed(2)}`,
          transactionDate: new Date().toISOString(),
          balanceBefore,
          balanceAfter,
          source: "bulk_upload",
        }).catch((err) => console.error("[GoogleSheets] Bulk upload (wide) error:", err));

        inserted++;
        member.balance = balanceAfter; // Update local cache
      }
    }
  } else {
    // Narrow format: Member Code, Business Name, Amount, Description
    for (let i = 0; i < dataRows.length; i++) {
      const line = dataRows[i].trim();
      if (!line) continue;

      const rowNum = i + 2;
      const values = parseCSVLine(line);

      if (values.length < 3) {
        errors.push({
          row: rowNum,
          error: "Invalid row format. Expected: Member Code, Business Name, Amount, Description (optional)",
          data: { values },
        });
        continue;
      }

      const [memberCode, businessName, amountStr, description] = values;
      const amount = parseFloat(amountStr);

      if (isNaN(amount) || amount <= 0) {
        errors.push({
          row: rowNum,
          error: `Invalid amount: ${amountStr}`,
          data: { memberCode, businessName, amount: 0 },
        });
        continue;
      }

      const member = memberByCodeMap.get(memberCode.toLowerCase());
      if (!member) {
        errors.push({
          row: rowNum,
          error: `Member not found: ${memberCode}`,
          data: { memberCode, businessName, amount },
        });
        continue;
      }

      const business = businessMap.get(businessName.toLowerCase());
      if (!business) {
        errors.push({
          row: rowNum,
          error: `Business not found: ${businessName}`,
          data: { memberCode, businessName, amount },
        });
        continue;
      }

      const balanceBefore = Number(member.balance);
      const balanceAfter = balanceBefore + amount;

      const { error: insertError } = await supabase.from("transactions").insert({
        member_id: member.id,
        business_id: business.id,
        amount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        description: description || `${businessName} - ₪${amount.toFixed(2)}`,
        billing_cycle_id: billingCycleId,
        source: "bulk_upload",
      });

      if (insertError) {
        errors.push({
          row: rowNum,
          error: insertError.message,
          data: { memberCode, businessName, amount },
        });
        continue;
      }

      const { error: updateError } = await supabase
        .from("members")
        .update({ balance: balanceAfter })
        .eq("id", member.id);

      if (updateError) {
        errors.push({
          row: rowNum,
          error: `Transaction created but failed to update balance: ${updateError.message}`,
          data: { memberCode, businessName, amount },
        });
        continue;
      }

      // Log to Google Sheets in background
      logTransactionToSheet({
        memberName: `${member.first_name} ${member.last_name}`,
        memberCode: member.member_code,
        businessName: business.name,
        amount,
        description: description || `${businessName} - ₪${amount.toFixed(2)}`,
        transactionDate: new Date().toISOString(),
        balanceBefore,
        balanceAfter,
        source: "bulk_upload",
      }).catch((err) => console.error("[GoogleSheets] Bulk upload (narrow) error:", err));

      inserted++;
      member.balance = balanceAfter;
    }
  }

  revalidatePath("/admin/transactions");
  revalidatePath("/admin");

  return {
    success: errors.length === 0,
    inserted,
    errors,
    message: `Successfully uploaded ${inserted} transaction(s)${errors.length > 0 ? ` with ${errors.length} error(s)` : ""}`,
  };
}
