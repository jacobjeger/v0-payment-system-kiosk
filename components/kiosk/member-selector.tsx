"use client";

import { useState, useRef, useMemo, useCallback, memo, useEffect } from "react";
import { Search, Coffee } from "lucide-react";
import { MorningKollelModal } from "./morning-kollel-modal";
import type { Member } from "@/lib/types";

interface MemberSelectorProps {
  members: Member[];
  onSelect: (member: Member) => void;
}

// Memoized member button component for better performance
const MemberButton = memo(function MemberButton({ 
  member, 
  onSelect 
}: { 
  member: Member; 
  onSelect: (member: Member) => void;
}) {
  return (
    <button
      onClick={() => onSelect(member)}
      className="bg-white rounded-xl p-3 flex items-center gap-3 border border-stone-200 hover:border-stone-300 hover:shadow-sm transition-all btn-press text-left"
    >
      <div className="w-9 h-9 rounded-full bg-stone-900 flex items-center justify-center text-white font-semibold text-xs flex-shrink-0">
        {member.first_name.charAt(0)}{member.last_name.charAt(0)}
      </div>
      <p className="font-medium text-stone-900 text-sm truncate">
        {member.first_name} {member.last_name}
      </p>
    </button>
  );
});

export function MemberSelector({ members, onSelect }: MemberSelectorProps) {
  const [search, setSearch] = useState("");
  const [showMorningKollel, setShowMorningKollel] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const letterRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Memoize filtered members to avoid recalculating on every render
  const filteredMembers = useMemo(() => {
    if (!search) return members;
    const searchLower = search.toLowerCase();
    return members.filter((member) => 
      member.first_name.toLowerCase().includes(searchLower) ||
      member.last_name.toLowerCase().includes(searchLower) ||
      member.member_code.toLowerCase().includes(searchLower)
    );
  }, [members, search]);

  // Memoize grouped members
  const { groupedMembers, sortedLetters } = useMemo(() => {
    const grouped = filteredMembers.reduce((acc, member) => {
      const letter = member.last_name.charAt(0).toUpperCase();
      if (!acc[letter]) acc[letter] = [];
      acc[letter].push(member);
      return acc;
    }, {} as Record<string, Member[]>);
    return { groupedMembers: grouped, sortedLetters: Object.keys(grouped).sort() };
  }, [filteredMembers]);

  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

  const scrollToLetter = (letter: string) => {
    const element = letterRefs.current[letter];
    if (element) element.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="flex flex-col h-full relative">
      {/* Morning Kollel Button - Top Right */}
      <button
        onClick={() => setShowMorningKollel(true)}
        className="absolute top-2 right-2 z-20 bg-amber-100 hover:bg-amber-200 border border-amber-300 rounded-lg p-1.5 flex items-center gap-1 transition-all btn-press text-xs font-medium text-amber-900"
        title="Log Morning Kollel coffee"
      >
        <Coffee className="w-3.5 h-3.5" />
        <span>Kollel</span>
      </button>

      {/* Header */}
      <div className="text-center mb-4 flex-shrink-0">
        <h2 className="text-lg font-semibold text-stone-900">Select Your Name</h2>
        <p className="text-stone-500 text-xs">Tap to continue</p>
      </div>

      {/* Search */}
      <div className="mb-4 flex-shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            placeholder="Search by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full h-10 text-sm pl-10 pr-4 rounded-lg bg-white border border-stone-200 text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900/10 focus:border-stone-300 transition-all"
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600 text-xs font-medium"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 flex gap-2 min-h-0 overflow-hidden">
        {/* Members List */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto pb-4 -mx-1 px-1">
          {search ? (
            <div className="grid grid-cols-2 gap-2">
              {filteredMembers.map((member) => (
                <MemberButton key={member.id} member={member} onSelect={onSelect} />
              ))}
            </div>
          ) : (
            <div className="space-y-4">
              {sortedLetters.map((letter) => (
                <div key={letter} ref={(el) => { letterRefs.current[letter] = el; }}>
                  <div className="sticky top-0 bg-stone-50/95 backdrop-blur-sm py-1 mb-2 z-10">
                    <span className="text-xs font-semibold text-stone-400 px-1">{letter}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {groupedMembers[letter].map((member) => (
                      <MemberButton key={member.id} member={member} onSelect={onSelect} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {filteredMembers.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12">
              <div className="w-12 h-12 rounded-full bg-stone-100 flex items-center justify-center mb-3">
                <Search className="w-5 h-5 text-stone-400" />
              </div>
              <p className="text-stone-500 text-sm">No members found</p>
            </div>
          )}
        </div>

        {/* A-Z Strip */}
        {!search && (
          <div className="flex-shrink-0 flex flex-col justify-center py-1 pr-1">
            {alphabet.map((letter) => {
              const hasMembers = sortedLetters.includes(letter);
              return (
                <button
                  key={letter}
                  onClick={() => hasMembers && scrollToLetter(letter)}
                  disabled={!hasMembers}
                  className={`w-5 h-4 flex items-center justify-center text-[9px] font-semibold rounded transition-colors ${
                    hasMembers ? "text-stone-500 hover:text-stone-900 hover:bg-stone-200" : "text-stone-300"
                  }`}
                >
                  {letter}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Morning Kollel Modal */}
      <MorningKollelModal
        isOpen={showMorningKollel}
        onClose={() => setShowMorningKollel(false)}
        onSuccess={() => setShowMorningKollel(false)}
      />
    </div>
  );
}
