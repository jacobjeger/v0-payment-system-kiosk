"use client";

import { useState, useEffect, useCallback } from "react";
import { processTransaction } from "@/app/actions/transactions";

interface PendingTransaction {
  id: string;
  memberId: string;
  memberName: string;
  businessId: string;
  businessName: string;
  amount: number;
  description: string;
  comment?: string;
  source: string;
  deviceInfo: Record<string, unknown>;
  createdAt: string;
  retryCount: number;
}

const STORAGE_KEY = "pdca_offline_transactions";
const MAX_RETRIES = 999; // Allow unlimited retries (will keep trying indefinitely)

export function useOfflineQueue() {
  const [pendingTransactions, setPendingTransactions] = useState<PendingTransaction[]>([]);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncAttempt, setLastSyncAttempt] = useState<Date | null>(null);

  // Load pending transactions from localStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setPendingTransactions(parsed);
      }
    } catch (e) {
      console.error("Failed to load offline queue:", e);
    }
  }, []);

  // Save to localStorage whenever pending transactions change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pendingTransactions));
    } catch (e) {
      console.error("Failed to save offline queue:", e);
    }
  }, [pendingTransactions]);

  // Add a transaction to the offline queue
  const queueTransaction = useCallback((transaction: {
    memberId: string;
    memberName: string;
    businessId: string;
    businessName: string;
    amount: number;
    description: string;
    comment?: string;
    source: string;
    deviceInfo: Record<string, unknown>;
  }) => {
    const pendingTx: PendingTransaction = {
      ...transaction,
      id: `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      retryCount: 0,
    };
    
    setPendingTransactions(prev => [...prev, pendingTx]);
    return pendingTx.id;
  }, []);

  // Remove a transaction from the queue (after successful sync)
  const removeTransaction = useCallback((id: string) => {
    setPendingTransactions(prev => prev.filter(tx => tx.id !== id));
  }, []);

  // Mark a transaction as failed (increment retry count)
  const markRetry = useCallback((id: string) => {
    setPendingTransactions(prev => prev.map(tx => 
      tx.id === id ? { ...tx, retryCount: tx.retryCount + 1 } : tx
    ));
  }, []);

  // Manually remove a transaction if needed (e.g., admin review & deletion)
  const discardTransaction = useCallback((id: string) => {
    setPendingTransactions(prev => prev.filter(tx => tx.id !== id));
  }, []);

  // Sync all pending transactions
  const syncAll = useCallback(async () => {
    if (isSyncing || pendingTransactions.length === 0) return;
    if (!navigator.onLine) return;

    setIsSyncing(true);
    setLastSyncAttempt(new Date());

    const results: { id: string; success: boolean; error?: string }[] = [];

    for (const tx of pendingTransactions) {
      try {
        const result = await processTransaction({
          memberId: tx.memberId,
          businessId: tx.businessId,
          amount: tx.amount,
          description: tx.description,
          comment: tx.comment,
          source: tx.source as 'kiosk' | 'admin' | 'api',
          deviceInfo: tx.deviceInfo,
        });

        if (result.error) {
          markRetry(tx.id);
          results.push({ id: tx.id, success: false, error: result.error });
        } else {
          removeTransaction(tx.id);
          results.push({ id: tx.id, success: true });
        }
      } catch (error) {
        markRetry(tx.id);
        results.push({ id: tx.id, success: false, error: String(error) });
      }

      // Small delay between transactions to avoid overwhelming the server
      await new Promise(resolve => setTimeout(resolve, 200));
    }

    setIsSyncing(false);
    return results;
  }, [isSyncing, pendingTransactions, markRetry, removeTransaction]);

  // Auto-sync when coming back online
  useEffect(() => {
    const handleOnline = () => {
      // Wait a moment for connection to stabilize
      setTimeout(() => {
        if (pendingTransactions.length > 0) {
          syncAll();
        }
      }, 1000);
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [pendingTransactions.length, syncAll]);

  // Periodic sync attempt (every 30 seconds if there are pending transactions)
  useEffect(() => {
    if (pendingTransactions.length === 0) return;

    const interval = setInterval(() => {
      if (navigator.onLine && !isSyncing) {
        syncAll();
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [pendingTransactions.length, isSyncing, syncAll]);

  return {
    pendingTransactions,
    pendingCount: pendingTransactions.length,
    isSyncing,
    lastSyncAttempt,
    queueTransaction,
    removeTransaction,
    discardTransaction,
    syncAll,
  };
}
