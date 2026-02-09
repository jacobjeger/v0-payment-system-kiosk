'use client';

import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, AlertTriangle, Loader } from 'lucide-react';
import type { Member, Business } from '@/lib/types';

// UUID v4 generator (RFC 4122)
function generateUUIDv4(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

const PRESET_AMOUNTS = [5, 10, 15, 20, 25, 50];

type Step = 'business' | 'amount' | 'member' | 'success' | 'not-detected' | 'loading' | 'error';

interface OfflineTransaction {
  client_tx_id: string;
  device_id: string;
  business_id: string;
  member_id: string;
  amount: number;
  description: string;
  occurred_at: string;
}

export default function KioskAppPage() {
  const [androidDetected, setAndroidDetected] = useState(false);
  const [step, setStep] = useState<Step>('loading');
  const [members, setMembers] = useState<Member[]>([]);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [deviceId, setDeviceId] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [selectedMember, setSelectedMember] = useState<Member | null>(null);
  const [amount, setAmount] = useState<number>(0);
  const [successMessage, setSuccessMessage] = useState('');
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [businessSearchQuery, setBusinessSearchQuery] = useState('');

  // Initialize device ID and check Android bridge
  useEffect(() => {
    // Initialize device ID from localStorage or generate new one
    const stored = localStorage.getItem('kiosk_device_id');
    if (stored) {
      setDeviceId(stored);
    } else {
      const newId = `kiosk-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('kiosk_device_id', newId);
      setDeviceId(newId);
    }

    // Check for Android bridge on mount
    if (typeof window !== 'undefined' && (window as any).Android?.submitTransaction) {
      setAndroidDetected(true);
    } else {
      // If no Android bridge, show warning after 2 seconds
      const timer = setTimeout(() => {
        if (!(window as any).Android?.submitTransaction) {
          setStep('not-detected');
        }
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, []);

  // Load production data from API
  useEffect(() => {
    async function loadData() {
      try {
        setStep('loading');
        setLoadError(null);
        
        const response = await fetch('/api/kiosk/data');
        if (!response.ok) {
          throw new Error(`Failed to load kiosk data: ${response.statusText}`);
        }

        const data = await response.json();
        
        if (!data.members || data.members.length === 0) {
          throw new Error('No members available in system');
        }
        if (!data.businesses || data.businesses.length === 0) {
          throw new Error('No businesses available in system');
        }

        setMembers(data.members);
        setBusinesses(data.businesses);
        setStep('business');
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to load data';
        setLoadError(errorMessage);
        setStep('error');
        console.error('Data loading error:', err);
      }
    }

    loadData();
  }, []);

  const handleBusinessSelect = (business: Business) => {
    setSelectedBusiness(business);
    setStep('amount');
  };

  const handleAmountSelect = (amt: number) => {
    setAmount(amt);
    setStep('member');
  };

  const handleMemberSelect = (member: Member) => {
    setSelectedMember(member);
    submitTransaction(member);
  };

  const submitTransaction = useCallback(
    (member: Member) => {
      if (!selectedBusiness || amount === 0 || !deviceId) {
        setSuccessMessage('Invalid transaction');
        return;
      }

      const clientTxId = generateUUIDv4();
      const payload: OfflineTransaction = {
        client_tx_id: clientTxId,
        device_id: deviceId,
        business_id: selectedBusiness.id,
        member_id: member.id,
        amount: amount,
        description: 'kiosk',
        occurred_at: new Date().toISOString(),
      };

      // Call Android bridge
      if ((window as any).Android?.submitTransaction) {
        try {
          (window as any).Android.submitTransaction(JSON.stringify(payload));
          setSuccessMessage(`Transaction queued for ${member.first_name}`);
          setStep('success');

          // Auto-reset after 2 seconds
          setTimeout(() => {
            handleReset();
          }, 2000);
        } catch (error) {
          console.error('Android bridge error:', error);
          setSuccessMessage('Error submitting transaction');
        }
      }
    },
    [selectedBusiness, amount, deviceId]
  );

  const handleReset = () => {
    setSelectedBusiness(null);
    setSelectedMember(null);
    setAmount(0);
    setMemberSearchQuery('');
    setBusinessSearchQuery('');
    setStep('business');
  };

  const handleBack = () => {
    if (step === 'amount') {
      setSelectedBusiness(null);
      setStep('business');
    } else if (step === 'member') {
      setAmount(0);
      setMemberSearchQuery('');
      setStep('amount');
    }
  };

  // Filter members based on search
  const filteredMembers = members.filter((m) =>
    `${m.first_name} ${m.last_name} ${m.member_code}`
      .toLowerCase()
      .includes(memberSearchQuery.toLowerCase())
  );

  // Filter businesses based on search
  const filteredBusinesses = businesses.filter((b) =>
    b.name.toLowerCase().includes(businessSearchQuery.toLowerCase())
  );

  if (step === 'not-detected') {
    return (
      <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-8 max-w-md text-center shadow-lg">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-stone-900 mb-2">Android App Not Detected</h1>
          <p className="text-stone-600 mb-4">
            This page is designed to run inside the PDCA Android kiosk app. Please open it from the Android application.
          </p>
          <p className="text-xs text-stone-400">No transactions will be submitted to prevent double posting.</p>
        </div>
      </div>
    );
  }

  if (step === 'loading') {
    return (
      <div className="min-h-screen bg-stone-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-8 max-w-md text-center shadow-lg">
          <Loader className="w-12 h-12 text-stone-400 animate-spin mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-stone-900 mb-2">Loading Kiosk</h1>
          <p className="text-stone-600">Fetching members and businesses...</p>
        </div>
      </div>
    );
  }

  if (step === 'error') {
    return (
      <div className="min-h-screen bg-red-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-lg p-8 max-w-md text-center shadow-lg">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-8 h-8 text-red-600" />
          </div>
          <h1 className="text-2xl font-bold text-stone-900 mb-2">Error Loading Kiosk</h1>
          <p className="text-stone-600 mb-4">{loadError}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full py-3 bg-stone-900 text-white font-semibold rounded-lg hover:bg-stone-800 transition-colors"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-50 flex flex-col select-none kiosk-touch">
      {/* Header */}
      <header className="bg-white border-b border-stone-200 px-4 py-3 flex-shrink-0 sticky top-0 z-40">
        <div className="flex items-center justify-between max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            {step !== 'business' && step !== 'success' && (
              <button
                onClick={handleBack}
                className="w-10 h-10 flex items-center justify-center text-stone-400 hover:text-stone-900 hover:bg-stone-100 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
            )}
            <h1 className="text-lg font-bold text-stone-900">PDCA Kiosk</h1>
          </div>
          {deviceId && (
            <p className="text-xs text-stone-400">{deviceId}</p>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto flex flex-col">
        <div className="max-w-lg mx-auto w-full px-4 py-6 flex-1 flex flex-col">
          {/* Step 1: Select Business */}
          {step === 'business' && (
            <div className="flex flex-col gap-4 flex-1">
              <h2 className="text-xl font-bold text-stone-900">Select Business</h2>
              <input
                type="text"
                placeholder="Search businesses..."
                value={businessSearchQuery}
                onChange={(e) => setBusinessSearchQuery(e.target.value)}
                className="w-full px-4 py-3 border border-stone-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-stone-400"
              />
              <div className="grid grid-cols-1 gap-3 flex-1">
                {filteredBusinesses.map((business) => (
                  <button
                    key={business.id}
                    onClick={() => handleBusinessSelect(business)}
                    className="p-4 bg-white border-2 border-stone-200 rounded-lg hover:border-stone-400 hover:bg-stone-50 transition-all text-left active:scale-95"
                  >
                    <p className="font-semibold text-stone-900 text-lg">{business.name}</p>
                    {business.description && (
                      <p className="text-sm text-stone-500">{business.description}</p>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 2: Select Amount */}
          {step === 'amount' && selectedBusiness && (
            <div className="flex flex-col gap-4 flex-1">
              <h2 className="text-xl font-bold text-stone-900">Select Amount</h2>
              <p className="text-stone-600">Business: {selectedBusiness.name}</p>
              <div className="grid grid-cols-3 gap-3 flex-1">
                {PRESET_AMOUNTS.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => handleAmountSelect(amt)}
                    className="p-6 bg-white border-2 border-stone-200 rounded-lg hover:border-stone-400 hover:bg-stone-50 transition-all active:scale-95 text-center"
                  >
                    <p className="text-2xl font-bold text-stone-900">₪{amt}</p>
                  </button>
                ))}
              </div>
              <button
                onClick={() => {
                  const customAmount = prompt('Enter custom amount:');
                  if (customAmount && !isNaN(parseFloat(customAmount))) {
                    handleAmountSelect(parseFloat(customAmount));
                  }
                }}
                className="w-full py-3 bg-stone-200 hover:bg-stone-300 text-stone-900 font-semibold rounded-lg transition-colors"
              >
                Custom Amount
              </button>
            </div>
          )}

          {/* Step 3: Select Member */}
          {step === 'member' && selectedBusiness && amount > 0 && (
            <div className="flex flex-col gap-4 flex-1">
              <h2 className="text-xl font-bold text-stone-900">Select Member</h2>
              <p className="text-stone-600">
                {selectedBusiness.name} - ₪{amount}
              </p>
              <input
                type="text"
                placeholder="Search members..."
                value={memberSearchQuery}
                onChange={(e) => setMemberSearchQuery(e.target.value)}
                autoFocus
                className="w-full px-4 py-3 border border-stone-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-stone-400"
              />
              <div className="grid grid-cols-1 gap-3 flex-1">
                {filteredMembers.map((member) => (
                  <button
                    key={member.id}
                    onClick={() => handleMemberSelect(member)}
                    className="p-4 bg-white border-2 border-stone-200 rounded-lg hover:border-stone-400 hover:bg-stone-50 transition-all text-left active:scale-95"
                  >
                    <p className="font-semibold text-stone-900 text-lg">
                      {member.first_name} {member.last_name}
                    </p>
                    <p className="text-sm text-stone-500">{member.member_code}</p>
                    <p className="text-sm font-mono text-stone-600 mt-1">
                      Balance: ₪{Number(member.balance).toFixed(2)}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Success Screen */}
          {step === 'success' && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <svg
                    className="w-10 h-10 text-emerald-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
                <h2 className="text-2xl font-bold text-stone-900 mb-2">Transaction Queued</h2>
                <p className="text-lg text-stone-600">{successMessage}</p>
                <p className="text-sm text-stone-500 mt-4">Will sync when connected...</p>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
