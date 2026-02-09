"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, RotateCcw, ChevronDown, ChevronUp } from "lucide-react";
import { restoreMember } from "@/app/actions/admin";

interface Member {
  id: string;
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
  balance: number;
}

interface DeletedMembersSectionProps {
  members: Member[];
}

export function DeletedMembersSection({ members }: DeletedMembersSectionProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  async function handleRestore(memberId: string) {
    setRestoring(memberId);
    try {
      const result = await restoreMember(memberId);
      if (!result.success) {
        alert(result.error || "Failed to restore member");
      }
    } catch {
      alert("Failed to restore member");
    } finally {
      setRestoring(null);
    }
  }

  return (
    <Card className="mt-8 border-destructive/20">
      <CardHeader 
        className="cursor-pointer"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Trash2 className="h-5 w-5 text-destructive" />
            <CardTitle className="text-lg">
              Deleted Members ({members.length})
            </CardTitle>
          </div>
          <Button variant="ghost" size="sm">
            {isExpanded ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardHeader>
      
      {isExpanded && (
        <CardContent>
          <p className="text-sm text-muted-foreground mb-4">
            These members have been deleted but can be restored. Restoring a member will make them active again.
          </p>
          <div className="space-y-2">
            {members.map((member) => (
              <div
                key={member.id}
                className="flex items-center justify-between p-3 bg-muted/50 rounded-lg"
              >
                <div>
                  <p className="font-medium">
                    {member.first_name} {member.last_name}
                  </p>
                  <p className="text-sm text-muted-foreground">{member.email}</p>
                  {member.phone && (
                    <p className="text-sm text-muted-foreground">{member.phone}</p>
                  )}
                </div>
                <div className="flex items-center gap-4">
                  <span className="text-sm text-muted-foreground">
                    Balance: {"\u20AA"}{member.balance?.toFixed(2) || "0.00"}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleRestore(member.id)}
                    disabled={restoring === member.id}
                    className="gap-2"
                  >
                    <RotateCcw className={`h-4 w-4 ${restoring === member.id ? "animate-spin" : ""}`} />
                    {restoring === member.id ? "Restoring..." : "Restore"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}
