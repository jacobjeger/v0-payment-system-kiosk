"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { UserPlus, Check, X, Clock, Mail, Phone, Loader2 } from "lucide-react";
import { approveMember, rejectMember } from "@/app/actions/admin";
import type { Member } from "@/lib/types";

interface PendingApprovalsSectionProps {
  members: Member[];
}

export function PendingApprovalsSection({ members }: PendingApprovalsSectionProps) {
  const [processing, setProcessing] = useState<string | null>(null);
  const [localMembers, setLocalMembers] = useState(members);

  const handleApprove = async (memberId: string) => {
    setProcessing(memberId);
    const result = await approveMember(memberId);
    if (result.success) {
      setLocalMembers(localMembers.filter(m => m.id !== memberId));
    }
    setProcessing(null);
  };

  const handleReject = async (memberId: string) => {
    if (!confirm("Are you sure you want to reject this application? This cannot be undone.")) return;
    setProcessing(memberId);
    const result = await rejectMember(memberId);
    if (result.success) {
      setLocalMembers(localMembers.filter(m => m.id !== memberId));
    }
    setProcessing(null);
  };

  if (localMembers.length === 0) return null;

  return (
    <Card className="mb-8 border-amber-200 bg-amber-50/50">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-amber-800">
          <UserPlus className="w-5 h-5" />
          Pending Registrations
          <Badge variant="secondary" className="ml-2 bg-amber-200 text-amber-800">
            {localMembers.length}
          </Badge>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-amber-700 mb-4">
          These members have registered and are awaiting your approval before they can use the system.
        </p>
        <div className="space-y-3">
          {localMembers.map((member) => (
            <div
              key={member.id}
              className="flex items-center justify-between bg-white rounded-lg border border-amber-200 p-4"
            >
              <div className="flex-1">
                <div className="flex items-center gap-3 mb-1">
                  <h3 className="font-semibold text-stone-900">
                    {member.first_name} {member.last_name}
                  </h3>
                  <Badge variant="outline" className="text-xs">
                    <Clock className="w-3 h-3 mr-1" />
                    {new Date(member.created_at).toLocaleDateString()}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-stone-500">
                  {member.email && (
                    <span className="flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5" />
                      {member.email}
                    </span>
                  )}
                  {member.phone && (
                    <span className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" />
                      {member.phone}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleReject(member.id)}
                  disabled={processing === member.id}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200 bg-transparent"
                >
                  {processing === member.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <X className="w-4 h-4 mr-1" />
                      Reject
                    </>
                  )}
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleApprove(member.id)}
                  disabled={processing === member.id}
                  className="bg-emerald-600 hover:bg-emerald-700"
                >
                  {processing === member.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Check className="w-4 h-4 mr-1" />
                      Approve
                    </>
                  )}
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
