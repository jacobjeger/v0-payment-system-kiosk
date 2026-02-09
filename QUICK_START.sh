#!/bin/bash
# PDCA OFFLINE ANDROID KIOSK - QUICK START REFERENCE
# Copy this file to your terminal or follow each step

echo "
╔═══════════════════════════════════════════════════════════════════════════╗
║          PDCA OFFLINE ANDROID KIOSK - IMPLEMENTATION CHECKLIST            ║
╚═══════════════════════════════════════════════════════════════════════════╝

📦 DELIVERABLES CREATED:
  ✅ /app/kiosk-app/page.tsx (372 lines)
  ✅ /app/api/transactions/bulk/route.ts (197 lines)
  ✅ /scripts/add-offline-kiosk-columns.sql
  ✅ /scripts/build-kiosk.sh
  ✅ /kiosk-build.config.json
  ✅ Complete documentation (5 guides)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🚀 QUICK START (5 Steps, ~13 minutes total)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 1️⃣ : Database Migration (5 min)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📍 Location: Supabase Console → SQL Editor
📋 Action:
   1. Create new query
   2. Copy-paste from: /scripts/add-offline-kiosk-columns.sql
   3. Click Run
   4. Verify: Check 'transactions' table has columns:
      - device_id (VARCHAR)
      - client_tx_id (UUID)

✓ Adds offline transaction tracking
✓ Prevents duplicate submissions

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 2️⃣ : Environment Variable (3 min)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📍 Location: Vercel Dashboard → Settings → Environment Variables
📋 Action:
   1. Add: KIOSK_SYNC_TOKEN = sk_kiosk_abc123xyz...
      (use any secure random string)
   2. Apply to: Production, Preview, Development
   3. Redeploy project

✓ Secures the sync API endpoint
✓ Required for Android app to authenticate

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 3️⃣ : Build Offline App (2 min)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📍 Location: Your local terminal
📋 Command:
"
read -p "Press Enter to show commands..."
echo "
   chmod +x scripts/build-kiosk.sh
   npm run build:kiosk

   Output: kiosk-build/
           ├── index.html
           └── assets/

✓ Generates offline-ready HTML + assets
✓ Copy kiosk-build/ to Android assets/ folder

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 4️⃣ : Test API Endpoint (3 min)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📍 Location: Terminal
📋 Command:

   curl -X POST \\
     https://tcpdca.com/api/transactions/bulk \\
     -H 'x-kiosk-token: sk_kiosk_your_token_here' \\
     -H 'Content-Type: application/json' \\
     -d '{
       \"device_id\": \"kiosk-01\",
       \"transactions\": [{
         \"client_tx_id\": \"550e8400-e29b-41d4-a716-446655440000\",
         \"business_id\": \"biz-001\",
         \"member_id\": \"mem-001\",
         \"amount\": 25,
         \"description\": \"kiosk\",
         \"occurred_at\": \"'$(date -u +'%Y-%m-%dT%H:%M:%SZ')'\"
       }]
     }'

✓ Expected: status 200, results[0].status = 'accepted'
✗ Got 401? Check KIOSK_SYNC_TOKEN matches
✗ Got 400? Check JSON format

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

STEP 5️⃣ : Android Integration (Next)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📍 Location: Android Studio
📋 Actions:
   1. Copy kiosk-build/ contents to app/src/main/assets/
   2. Set up WebView:
      webView.addJavascriptInterface(KioskBridge(this), \"Android\")
      webView.loadUrl(\"file:///android_asset/index.html\")
   3. Implement KioskBridge class (see ANDROID_IMPLEMENTATION_REFERENCE.md)
   4. Implement sync service for /api/transactions/bulk
   5. Test on tablet

See: /ANDROID_IMPLEMENTATION_REFERENCE.md for full code examples

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📚 DOCUMENTATION GUIDE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  📖 README_ANDROID_KIOSK.md (this file)
     → Overview and quick start

  📖 OFFLINE_KIOSK_SETUP.md
     → Detailed setup instructions with troubleshooting

  📖 KIOSK_CHECKLIST.md
     → Quick reference checklist

  📖 DELIVERABLES.md
     → Summary of all created files

  📖 ANDROID_IMPLEMENTATION_REFERENCE.md
     → Full Android/Kotlin code examples

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🔍 API REFERENCE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Endpoint: POST /api/transactions/bulk

Request Headers:
  x-kiosk-token: YOUR_KIOSK_SYNC_TOKEN (required)
  Content-Type: application/json

Request Body:
  {
    \"device_id\": \"kiosk-01\",
    \"transactions\": [
      {
        \"client_tx_id\": \"uuid-v4\",
        \"business_id\": \"biz-001\",
        \"member_id\": \"mem-001\",
        \"amount\": 25,
        \"description\": \"kiosk\",
        \"occurred_at\": \"2026-02-09T12:00:00Z\"
      }
    ]
  }

Response (200 OK):
  {
    \"success\": true,
    \"device_id\": \"kiosk-01\",
    \"processed\": 1,
    \"results\": [
      {
        \"client_tx_id\": \"uuid-v4\",
        \"status\": \"accepted|duplicate|rejected\",
        \"server_transaction_id\": \"txn-id\",
        \"balance_after\": 475,
        \"error\": null
      }
    ]
  }

Status Codes:
  200 OK        → Request processed (check results[].status)
  400 Bad Request → Invalid JSON or too many transactions (max 100)
  401 Unauthorized → Invalid/missing x-kiosk-token header
  500 Error     → Server error

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✅ SECURITY CHECKLIST
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ✓ Token-based auth (KIOSK_SYNC_TOKEN)
  ✓ Idempotency via (device_id, client_tx_id) unique index
  ✓ Atomic balance updates (no partial states)
  ✓ Prevents double-charging
  ✓ Demo data clearly marked
  ✓ Offline warning if Android bridge missing
  ✓ No modifications to existing /kiosk route
  ✓ No new dependencies added

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

📞 TROUBLESHOOTING
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Q: SQL migration fails
A: Check Supabase connection, ensure you're in correct project

Q: API returns 401 Unauthorized
A: Verify KIOSK_SYNC_TOKEN matches, redeploy Vercel project

Q: Build script fails
A: Run 'npm install' first, ensure Node.js is installed

Q: Transactions showing twice
A: Check unique index exists:
   SELECT * FROM pg_indexes WHERE tablename = 'transactions'

Q: Android bridge not working
A: Ensure webView.addJavascriptInterface() called before loadUrl()

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

🎯 KEY FEATURES
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  ✨ Offline Mode
     → App works without WiFi
     → Stores transactions locally in Android SQLite

  ✨ Android Bridge
     → Web calls: window.Android.submitTransaction(JSON)
     → Android receives & queues transaction
     → No network required for UI to work

  ✨ Auto-Sync
     → When online, Android automatically syncs queued transactions
     → Idempotency prevents double-posting

  ✨ Idempotency
     → (device_id, client_tx_id) unique index
     → Retrying same transaction = 'duplicate' response
     → Balance never double-charged

  ✨ Zero Breaking Changes
     → Existing /kiosk route untouched
     → Existing transaction endpoints unchanged
     → New /kiosk-app and /api/transactions/bulk routes only

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✨ YOU'RE ALL SET!
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Everything is built and ready to go.

Next steps:
  1. Complete 5 steps above (13 min)
  2. Integrate with Android (1-2 hours)
  3. Test on tablet (30 min)
  4. Deploy to production (when ready)

Start with Step 1 → Add Database Migration 🚀

═══════════════════════════════════════════════════════════════════════════════
"
