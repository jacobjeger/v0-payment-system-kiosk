import { NextResponse } from "next/server";

export async function GET() {
  const checks = {
    kioskSyncToken: !!process.env.KIOSK_SYNC_TOKEN,
    supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabaseAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    environment: process.env.NODE_ENV,
    timestamp: new Date().toISOString(),
  };

  const allGood =
    checks.kioskSyncToken && checks.supabaseUrl && checks.supabaseAnonKey;

  return NextResponse.json(
    {
      status: allGood ? "ready" : "incomplete",
      checks,
      message: allGood
        ? "All environment variables configured. System ready."
        : "Missing environment variables. See checks.",
      nextSteps: allGood
        ? [
            "1. Run: npm run build:kiosk",
            "2. Test sync: curl -X POST https://tcpdca.com/api/transactions/bulk -H 'x-kiosk-token: YOUR_TOKEN'",
            "3. Copy kiosk-build/ to Android app assets",
          ]
        : [
            "1. Add KIOSK_SYNC_TOKEN to Vercel environment",
            "2. Verify SUPABASE_* variables are set",
            "3. Redeploy",
          ],
    },
    { status: allGood ? 200 : 400 },
  );
}
