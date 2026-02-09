"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { AdjustBalanceDialog } from "./adjust-balance-dialog";
import type { Member } from "@/lib/types";

interface MemberActionsProps {
  member: Member;
}

export function MemberActions({ member }: MemberActionsProps) {
  const [showAdjustBalance, setShowAdjustBalance] = useState(false);

  return (
    <>
      <Button onClick={() => setShowAdjustBalance(true)}>
        Adjust Balance
      </Button>

      {showAdjustBalance && (
        <AdjustBalanceDialog
          member={member}
          open={showAdjustBalance}
          onClose={() => setShowAdjustBalance(false)}
        />
      )}
    </>
  );
}
