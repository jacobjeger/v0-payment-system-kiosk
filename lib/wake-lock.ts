"use client";

/**
 * Wake Lock utility to prevent screen from sleeping on kiosk/tablet devices
 */

let wakeLock: WakeLockSentinel | null = null;

export async function requestWakeLock() {
  if (!("wakeLock" in navigator)) {
    console.warn("[v0] Wake Lock API not supported");
    return false;
  }

  try {
    wakeLock = await navigator.wakeLock.request("screen");
    console.log("[v0] Wake Lock activated");

    wakeLock.addEventListener("release", () => {
      console.log("[v0] Wake Lock released");
    });

    return true;
  } catch (err) {
    console.error("[v0] Failed to activate Wake Lock:", err);
    return false;
  }
}

export async function releaseWakeLock() {
  if (wakeLock) {
    await wakeLock.release();
    wakeLock = null;
  }
}

/**
 * Hook to automatically request wake lock on mount
 */
export function useWakeLock() {
  if (typeof window !== "undefined") {
    // Request wake lock on mount
    requestWakeLock();

    // Re-request if page becomes visible again
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible" && wakeLock === null) {
        requestWakeLock();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Cleanup
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      releaseWakeLock();
    };
  }
}
