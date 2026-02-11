"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toggleBusinessStatus } from "@/app/actions/admin";
import { OwnerSelectionDialog } from "./owner-selection-dialog";
import type { Business, Member } from "@/lib/types";
import { Search, Users } from "lucide-react";

interface BusinessListProps {
  businesses: Business[];
}

export function BusinessList({ businesses: initialBusinesses }: BusinessListProps) {
  const [search, setSearch] = useState("");
  const [businesses, setBusinesses] = useState(initialBusinesses);
  const [selectedBusinessId, setSelectedBusinessId] = useState<string | null>(null);
  const [ownerDialogOpen, setOwnerDialogOpen] = useState(false);
  const [currentOwnerInfo, setCurrentOwnerInfo] = useState<{
    id?: string;
    name?: string;
  } | null>(null);
  
  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    await toggleBusinessStatus(id, !currentStatus);
  };

  const handleOpenOwnerDialog = (business: Business) => {
    setSelectedBusinessId(business.id);
    // Parse owner info from owner_name field if it exists
    setCurrentOwnerInfo({
      id: (business as any).owner_member_id,
      name: business.owner_name,
    });
    setOwnerDialogOpen(true);
  };

  const handleOwnerSelected = (member: Member | null) => {
    if (selectedBusinessId) {
      setBusinesses(
        businesses.map((b) =>
          b.id === selectedBusinessId
            ? {
                ...b,
                owner_name: member
                  ? `${member.first_name} ${member.last_name}`
                  : null,
              }
            : b
        )
      );
    }
  };

  const filteredBusinesses = businesses.filter((business) => {
    const searchLower = search.toLowerCase();
    return (
      business.name.toLowerCase().includes(searchLower) ||
      business.category?.toLowerCase().includes(searchLower) ||
      business.description?.toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="space-y-6">
      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search businesses..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredBusinesses.map((business) => (
          <Card key={business.id} className={!business.is_active ? "opacity-60" : ""}>
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <h3 className="text-lg font-semibold text-foreground">
                    {business.name}
                  </h3>
                  <span className="text-xs font-medium px-2 py-1 bg-accent text-accent-foreground rounded-full capitalize">
                    {business.category}
                  </span>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-1 rounded-full ${
                    business.is_active
                      ? "bg-primary/10 text-primary"
                      : "bg-muted text-muted-foreground"
                  }`}
                >
                  {business.is_active ? "Active" : "Inactive"}
                </span>
              </div>

              {business.description && (
                <p className="text-sm text-muted-foreground mb-4 line-clamp-2">
                  {business.description}
                </p>
              )}

              {business.owner_name && (
                <div className="mb-4 p-2 bg-blue-50 rounded border border-blue-200">
                  <p className="text-xs text-blue-900">
                    <strong>Owner:</strong> {business.owner_name}
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <Link href={`/admin/businesses/${business.id}`} className="flex-1">
                  <Button variant="outline" className="w-full bg-transparent">
                    Manage
                  </Button>
                </Link>
                <Button
                  variant="outline"
                  size="icon"
                  onClick={() => handleOpenOwnerDialog(business)}
                  title="Set business owner"
                >
                  <Users className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleToggleStatus(business.id, business.is_active)}
                >
                  {business.is_active ? (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                      <line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8z"/>
                      <circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredBusinesses.length === 0 && (
        <div className="col-span-full text-center py-12 text-muted-foreground">
          No businesses found. Add your first business to get started.
        </div>
      )}

      {selectedBusinessId && (
        <OwnerSelectionDialog
          businessId={selectedBusinessId}
          businessName={filteredBusinesses.find((b) => b.id === selectedBusinessId)?.name || ""}
          currentOwnerId={(filteredBusinesses.find((b) => b.id === selectedBusinessId) as any)?.owner_member_id}
          currentOwnerName={currentOwnerInfo?.name}
          onOwnerSelected={handleOwnerSelected}
          isOpen={ownerDialogOpen}
          onClose={() => {
            setOwnerDialogOpen(false);
            setSelectedBusinessId(null);
          }}
        />
      )}
    </div>
  );
}
