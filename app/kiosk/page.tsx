"use client";

import { useState, useEffect, useCallback } from "react";
import { useKioskData } from "@/hooks/use-kiosk-data";
import { MemberSelector } from "@/components/kiosk/member-selector";
import { PinEntry } from "@/components/kiosk/pin-entry";
import { BusinessSelector } from "@/components/kiosk/business-selector";
import { AmountSelector } from "@/components/kiosk/amount-selector";
import { SuccessScreen } from "@/components/kiosk/success-screen";
import { IdleOverlay } from "@/components/kiosk/idle-overlay";
import { ProfileDrawer } from "@/components/kiosk/profile-drawer";
import { DeclinedCardPopup } from "@/components/kiosk/declined-card-popup";
import { KioskMessagePopup } from "@/components/kiosk/kiosk-message-popup";
import { PinConfirmationScreen } from "@/components/kiosk/pin-confirmation-screen";
import { PinChange } from "@/components/kiosk/pin-change";
import type { Member, Business } from "@/lib/types";
import { updateMemberPin, confirmMemberPin } from "@/app/actions/kiosk";
import { ChevronLeft, AlertTriangle, Wifi, WifiOff, Banknote, CloudOff, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase";
import { getSystemSetting } from "@/app/actions/admin";
import { useOfflineQueue } from "@/hooks/use-offline-queue";
import { useWakeLock } from "@/lib/wake-lock";

// Custom hook for network status
function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(true);
  const [lastOnline, setLastOnline] = useState<Date | null>(null);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      setLastOnline(new Date());
    };
    const handleOffline = () => setIsOnline(false);

    // Set initial state
    setIsOnline(navigator.onLine);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return { isOnline, lastOnline };
}

type KioskStep = "member" | "pin" | "pin_confirmation" | "pin_change" | "business" | "product" | "success" | "paused" | "disabled";

const IDLE_TIMEOUT = 45000;

export default function KioskPage() {
  const { members, businesses, refresh, isError } = useKioskData();
  const { isOnline, lastOnline } = useNetworkStatus();
  const { pendingCount, isSyncing, queueTransaction, syncAll } = useOfflineQueue();
  const router = useRouter();
  const [step, setStep] = useState<KioskStep>("member");

  // Keep screen awake for kiosk tablets
  useEffect(() => {
    return useWakeLock();
  }, []);
  const [showCashCollectorOption, setShowCashCollectorOption] = useState(false);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [lastTransactionAmount, setLastTransactionAmount] = useState<number>(0);
  const [showProfile, setShowProfile] = useState(false);
  const [showDeclinedPopup, setShowDeclinedPopup] = useState(false);
  const [showKioskMessage, setShowKioskMessage] = useState(false);
  const [showIdleWarning, setShowIdleWarning] = useState(false);
  const [idleCountdown, setIdleCountdown] = useState(10);
  const [pinRequired, setPinRequired] = useState(true);
  const [pinVerified, setPinVerified] = useState(false);
  const [showCashPinDialog, setShowCashPinDialog] = useState(false);
  const [cashPinInput, setCashPinInput] = useState("");
  const [cashPinError, setCashPinError] = useState(false);

  // Load PIN required setting
  useEffect(() => {
    async function loadPinSetting() {
      const result = await getSystemSetting("pin_required");
      if (result.success && result.value !== undefined) {
        setPinRequired(result.value as boolean);
      }
    }
    loadPinSetting();
  }, []);

  const resetIdleTimer = useCallback(() => {
    setShowIdleWarning(false);
    setIdleCountdown(10);
  }, []);

  const handleReset = useCallback(() => {
    setSelectedMember(null);
    setSelectedBusiness(null);
    setStep("member");
    setShowIdleWarning(false);
    setIdleCountdown(10);
    setShowProfile(false);
    setShowDeclinedPopup(false);
    setShowKioskMessage(false);
    setShowCashCollectorOption(false);
    setPinVerified(false);
    setShowCashPinDialog(false);
    setCashPinInput("");
    setCashPinError(false);
  }, []);

  const refetchMembers = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const refetchMember = useCallback(async (memberId: string) => {
    const supabase = createClient();
    const { data } = await supabase
      .from("members")
      .select("*")
      .eq("id", memberId)
      .single();
    
    if (data) {
      setSelectedMember(data as Member);
      return data as Member;
    }
    return null;
  }, []);

  useEffect(() => {
    // Only show idle warning when a member is selected (not on homepage or success screen)
    if (!selectedMember || step === "member" || step === "success") return;
    
    let idleTimer: NodeJS.Timeout;
    const startIdleTimer = () => {
      idleTimer = setTimeout(() => setShowIdleWarning(true), IDLE_TIMEOUT);
    };
    const handleActivity = () => {
      clearTimeout(idleTimer);
      resetIdleTimer();
      startIdleTimer();
    };
    window.addEventListener("touchstart", handleActivity);
    window.addEventListener("mousedown", handleActivity);
    window.addEventListener("keydown", handleActivity);
    startIdleTimer();
    return () => {
      clearTimeout(idleTimer);
      window.removeEventListener("touchstart", handleActivity);
      window.removeEventListener("mousedown", handleActivity);
      window.removeEventListener("keydown", handleActivity);
    };
  }, [step, selectedMember, resetIdleTimer]);

  // Countdown timer for idle warning
  useEffect(() => {
    if (!showIdleWarning) return;

    const timer = setInterval(() => {
      setIdleCountdown((prev) => {
        if (prev <= 1) {
          // Time's up - reset the kiosk
          clearInterval(timer);
          handleReset();
          return 10;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [showIdleWarning, handleReset]);

  useEffect(() => {
    if (step === "business" && selectedMember?.card_status === "declined") {
      setShowDeclinedPopup(true);
    }
  }, [step, selectedMember?.card_status]);

  const handleMemberSelect = (member: Member) => {
    setSelectedMember(member);
    // Check if member is disabled (is_active = false)
    if (member.is_active === false) { setStep("disabled"); return; }
    if (member.status === 'paused') { setStep("paused"); return; }
    
    // Check if PIN needs confirmation (for rollout week)
    if (member.pin_code && !member.pin_confirmed) {
      setStep("pin_confirmation");
      return;
    }
    
    // Only require PIN if: global setting is enabled AND member has a PIN AND member doesn't have skip_pin
	const shouldRequirePin = pinRequired && member.pin_code && !member.skip_pin;
  console.log("[v0] Member selected:", member.first_name, member.last_name, "is_cash_collector:", member.is_cash_collector);
  if (shouldRequirePin) {
  setStep("pin");
  } else {
  setStep("business");
  if (member.kiosk_message) setShowKioskMessage(true);
  // Check if member is a cash collector (when PIN is skipped)
  if (member.is_cash_collector) {
    console.log("[v0] Setting showCashCollectorOption to true for", member.first_name);
    setShowCashCollectorOption(true);
  }
  }
  };

  const handleBack = () => {
    if (step === "pin") { setSelectedMember(null); setStep("member"); }
    else if (step === "business") {
      const shouldRequirePin = pinRequired && selectedMember?.pin_code && !selectedMember?.skip_pin;
      if (shouldRequirePin) setStep("pin");
      else { setSelectedMember(null); setStep("member"); }
    }
    else if (step === "product") { setSelectedBusiness(null); setStep("business"); }
  };

  const handleTransactionSuccess = (newBalance: number, amount: number) => {
    if (selectedMember) setSelectedMember({ ...selectedMember, balance: newBalance });
    setLastTransactionAmount(amount);
    setStep("success");
  };

  if (members.length === 0) {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-stone-200 border-t-stone-900 rounded-full animate-spin" />
          <p className="text-stone-400 text-xs tracking-wide">Loading</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col select-none kiosk-touch">
      {showIdleWarning && <IdleOverlay countdown={idleCountdown} onContinue={resetIdleTimer} />}
      
{/* Offline Warning Banner */}
  {(!isOnline || isError) && (
  <div className="bg-red-600 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium">
  <WifiOff className="w-4 h-4" />
  <span>Offline mode - transactions will sync when reconnected</span>
  {pendingCount > 0 && (
    <span className="bg-white/20 px-2 py-0.5 rounded-full text-xs">
      {pendingCount} pending
    </span>
  )}
  </div>
  )}
  
  {/* Pending Transactions Banner (when online) */}
  {isOnline && !isError && pendingCount > 0 && (
  <div className="bg-amber-500 text-white px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium">
  <CloudOff className="w-4 h-4" />
  <span>{pendingCount} transaction{pendingCount > 1 ? 's' : ''} pending sync</span>
  <button
    onClick={() => syncAll()}
    disabled={isSyncing}
    className="bg-white/20 hover:bg-white/30 px-2 py-0.5 rounded-full text-xs flex items-center gap-1 transition-colors disabled:opacity-50"
  >
    <RefreshCw className={`w-3 h-3 ${isSyncing ? 'animate-spin' : ''}`} />
    {isSyncing ? 'Syncing...' : 'Sync now'}
  </button>
  </div>
  )}
      
  {selectedMember && (
  <ProfileDrawer
  member={selectedMember}
  isOpen={showProfile}
  onClose={() => setShowProfile(false)}
  showBalance={step !== "pin"}
  onChangePin={() => setStep("pin_change")}
  />
  )}

{showKioskMessage && selectedMember?.kiosk_message && (
  <KioskMessagePopup
  member={selectedMember}
  onClose={() => setShowKioskMessage(false)}
  />
  )}
  
  {/* Cash Collector PIN Dialog */}
  {showCashPinDialog && selectedMember && (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 max-w-sm w-full mx-4 shadow-xl">
        <div className="text-center mb-4">
          <div className="w-12 h-12 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <Banknote className="w-6 h-6 text-amber-700" />
          </div>
          <h3 className="text-lg font-semibold text-stone-900">Cash Collection PIN</h3>
          <p className="text-sm text-stone-500 mt-1">Enter your 4-digit access PIN</p>
        </div>
        <input
          type="password"
          inputMode="numeric"
          maxLength={4}
          value={cashPinInput}
          onChange={(e) => {
            const val = e.target.value.replace(/\D/g, "");
            setCashPinInput(val);
            setCashPinError(false);
            if (val.length === 4) {
              if (val === selectedMember.cash_collector_pin) {
                router.push(`/kiosk/cash?collector=${selectedMember.id}`);
              } else {
                setCashPinError(true);
                setCashPinInput("");
              }
            }
          }}
          className={`w-full text-center text-3xl font-mono tracking-[0.5em] py-4 border-2 rounded-xl focus:outline-none focus:ring-2 ${
            cashPinError 
              ? "border-red-300 focus:ring-red-200 bg-red-50" 
              : "border-stone-200 focus:ring-amber-200 focus:border-amber-400"
          }`}
          placeholder="----"
          autoFocus
        />
        {cashPinError && (
          <p className="text-red-600 text-sm text-center mt-2">Incorrect PIN - try again</p>
        )}
        <button
          onClick={() => {
            setShowCashPinDialog(false);
            setCashPinInput("");
            setCashPinError(false);
          }}
          className="w-full mt-4 py-3 text-stone-600 hover:text-stone-900 text-sm font-medium transition-colors"
        >
          Cancel
        </button>
      </div>
    </div>
  )}

      {showDeclinedPopup && selectedMember && (
        <DeclinedCardPopup
          member={selectedMember}
          onClose={() => setShowDeclinedPopup(false)}
          onResolutionSubmitted={() => {
            setShowDeclinedPopup(false);
            setSelectedMember({ ...selectedMember, card_status: "pending_review" });
          }}
        />
      )}

      {/* Compact Header with Progress Steps */}
      <header className="bg-white border-b border-stone-200 px-3 py-2 flex-shrink-0 sticky top-0 z-40">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            {step !== "member" && step !== "success" && step !== "paused" && step !== "disabled" && (
              <button
                onClick={handleBack}
                className="w-7 h-7 -ml-1 flex items-center justify-center text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors btn-press"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <span className="text-stone-900 text-base font-bold tracking-tight">PDCA</span>
            {/* Network Status Indicator */}
            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${
              isOnline && !isError
                ? "bg-emerald-100 text-emerald-700" 
                : "bg-red-100 text-red-700"
            }`}>
              {isOnline && !isError ? (
                <Wifi className="w-3 h-3" />
              ) : (
                <WifiOff className="w-3 h-3" />
              )}
            </div>
          </div>

          {/* Inline Progress Steps */}
          {step !== "success" && step !== "paused" && step !== "disabled" && (
            <div className="flex items-center gap-1">
              {[
                { key: "member", label: "Select" },
                ...(pinRequired && selectedMember?.pin_code && !selectedMember?.skip_pin ? [{ key: "pin", label: "PIN" }] : []),
                { key: "business", label: "Business" },
                { key: "product", label: "Amount" },
              ].map((s, i, arr) => {
                const stepIndex = arr.findIndex(x => x.key === step);
                const isActive = s.key === step;
                const isCompleted = i < stepIndex;
                return (
                  <div key={s.key} className="flex items-center gap-1">
                    <div className={`px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${
                      isActive ? "bg-stone-900 text-white" :
                      isCompleted ? "bg-stone-300 text-stone-600" :
                      "bg-stone-100 text-stone-400"
                    }`}>
                      {s.label}
                    </div>
                    {i < arr.length - 1 && (
                      <div className={`w-3 h-px ${isCompleted ? "bg-stone-400" : "bg-stone-200"}`} />
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {selectedMember && pinVerified && step !== "member" && step !== "success" && step !== "paused" && step !== "pin" && step !== "pin_confirmation" && step !== "disabled" && (
            <button
              onClick={() => setShowProfile(true)}
              className="flex items-center gap-2 bg-stone-50 rounded-lg px-2 py-1.5 border border-stone-200 hover:border-stone-300 hover:bg-stone-100 transition-all btn-press"
            >
              <div className="w-6 h-6 rounded-full bg-stone-900 flex items-center justify-center">
                <span className="text-[9px] font-semibold text-white">
                  {selectedMember.first_name[0]}{selectedMember.last_name[0]}
                </span>
              </div>
              <div className="text-left">
                <p className="text-[11px] font-medium text-stone-900 leading-none">{selectedMember.first_name}</p>
                <p className="text-[10px] text-stone-500 font-medium leading-none mt-0.5 tabular-nums">
                  {"\u20AA"}{Number(selectedMember.balance).toFixed(2)}
                </p>
              </div>
            </button>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-3 py-3">
          {step === "member" && <MemberSelector members={members} onSelect={handleMemberSelect} />}
          
          {step === "pin_confirmation" && selectedMember && (
            <PinConfirmationScreen 
              member={selectedMember}
              onConfirm={async () => {
                await confirmMemberPin(selectedMember.id);
                // Refetch member from database to get updated pin_confirmed status
                const updatedMember = await refetchMember(selectedMember.id);
                if (updatedMember) {
                  setPinVerified(true);
                  setStep("business");
                  if (updatedMember.kiosk_message) setShowKioskMessage(true);
                  if (updatedMember.is_cash_collector) {
                    setShowCashCollectorOption(true);
                  }
                }
              }}
              onBack={() => { setSelectedMember(null); setStep("member"); setPinVerified(false); }}
            />
          )}

          {step === "pin_change" && selectedMember && (
            <PinChange 
              member={selectedMember}
              onSuccess={async (newPin) => {
                const result = await updateMemberPin(selectedMember.id, newPin);
                if (result.success) {
                  // Refetch member from database to get updated PIN and pin_confirmed status
                  const updatedMember = await refetchMember(selectedMember.id);
                  if (updatedMember) {
                    // Continue to PIN entry or business selection
                    const shouldRequirePin = pinRequired && updatedMember.pin_code && !updatedMember.skip_pin;
                    if (shouldRequirePin) {
                      setStep("pin");
                    } else {
                      setStep("business");
                      if (updatedMember.kiosk_message) setShowKioskMessage(true);
                      if (updatedMember.is_cash_collector) {
                        setShowCashCollectorOption(true);
                      }
                    }
                  }
                }
              }}
              onCancel={() => setStep("pin_confirmation")}
            />
          )}

          {step === "pin" && selectedMember && (
            <PinEntry member={selectedMember} onSuccess={() => { 
                setPinVerified(true);
                setStep("business");
                if (selectedMember.kiosk_message) setShowKioskMessage(true);
                // Check if member is a cash collector
                if (selectedMember.is_cash_collector) {
                  setShowCashCollectorOption(true);
                }
              }} onCancel={() => { setSelectedMember(null); setStep("member"); setPinVerified(false); }} />
          )}
          
          {step === "paused" && selectedMember && (
            <div className="flex items-center justify-center py-16">
              <div className="text-center max-w-xs">
                <div className="w-14 h-14 mx-auto mb-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-amber-600" />
                </div>
                <h2 className="text-lg font-semibold text-stone-900 mb-1">Account Paused</h2>
                <p className="text-sm text-stone-500 mb-5">Your account has been temporarily paused and cannot make transactions at this time. Please contact an administrator for assistance.</p>
                <button onClick={handleReset} className="bg-stone-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-stone-800 transition-colors btn-press">
                  Go Back
                </button>
              </div>
            </div>
          )}

          {step === "disabled" && selectedMember && (
            <div className="flex items-center justify-center py-16">
              <div className="text-center max-w-xs">
                <div className="w-14 h-14 mx-auto mb-4 bg-red-50 border border-red-200 rounded-2xl flex items-center justify-center">
                  <AlertTriangle className="w-6 h-6 text-red-600" />
                </div>
                <h2 className="text-lg font-semibold text-stone-900 mb-1">Account Disabled</h2>
                <p className="text-sm text-stone-500 mb-5">Your account has been disabled. Please contact an administrator for assistance.</p>
                <button onClick={handleReset} className="bg-stone-900 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-stone-800 transition-colors btn-press">
                  Go Back
                </button>
              </div>
            </div>
          )}
          
          {step === "business" && (
            <>
              {showCashCollectorOption && selectedMember && (
                <div className="mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
                        <Banknote className="w-5 h-5 text-amber-700" />
                      </div>
                      <div>
                        <p className="font-medium text-amber-900">Cash Collection Mode</p>
                        <p className="text-xs text-amber-700">
                          {selectedMember.cash_collector_pin 
                            ? "Enter your cash collector PIN to access" 
                            : "No access PIN set - contact admin"}
                        </p>
                      </div>
                    </div>
                    {selectedMember.cash_collector_pin ? (
                      <button
                        onClick={() => setShowCashPinDialog(true)}
                        className="bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-700 transition-colors"
                      >
                        Open Cash Kiosk
                      </button>
                    ) : (
                      <span className="text-xs text-amber-600 bg-amber-100 px-3 py-1.5 rounded-lg">PIN Required</span>
                    )}
                  </div>
                </div>
              )}
              <BusinessSelector businesses={businesses} member={selectedMember!} onSelect={(b) => { setSelectedBusiness(b); setStep("product"); }} />
            </>
          )}
          
{step === "product" && selectedMember && selectedBusiness && (
  <AmountSelector 
    member={selectedMember} 
    business={selectedBusiness} 
    onSuccess={handleTransactionSuccess} 
    onCancel={handleBack}
    isOnline={isOnline && !isError}
    onOfflineQueue={queueTransaction}
  />
  )}
          
          {step === "success" && selectedMember && selectedBusiness && (
            <SuccessScreen member={selectedMember} businessName={selectedBusiness.name} amount={lastTransactionAmount} onNewTransaction={handleReset} />
          )}
        </div>
      </main>
    </div>
  );
}
