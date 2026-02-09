# PDCA Offline Android Kiosk Setup Guide

## What Was Created

### New Files Added
1. **`/app/kiosk-app/page.tsx`** - Client-only offline kiosk UI (372 lines)
   - Detects Android bridge via `window.Android.submitTransaction`
   - Embedded demo data (no network needed)
   - Touch-friendly big buttons for tablet
   - UUID v4 generation for offline transaction tracking
   - Business → Amount → Member selection flow

2. **`/app/api/transactions/bulk/route.ts`** - Server API for syncing queued transactions (197 lines)
   - Security: Requires `x-kiosk-token` header
   - Handles up to 100 transactions per request
   - Idempotency: Prevents duplicates via (device_id, client_tx_id) unique constraint
   - Atomically updates member balance
   - Returns per-transaction status (accepted/duplicate/rejected)

3. **`/scripts/add-offline-kiosk-columns.sql`** - Database migration
   - Adds `device_id` and `client_tx_id` columns to transactions table
   - Creates partial unique index for idempotency
   - Uses IF NOT EXISTS for safe re-runs

4. **`/scripts/build-kiosk.sh`** - Build script for Android assets
   - Generates static kiosk-build/ folder with offline HTML
   - Copies Next.js static exports
   - Provides CLI instructions

5. **`/kiosk-build.config.json`** - NPM script configuration

---

## Setup Steps (Do These in Order)

### Step 1: Add Database Migration
1. Go to Supabase console → SQL Editor
2. Copy and paste the entire content of `/scripts/add-offline-kiosk-columns.sql`
3. Click "Run" → Verify success

**SQL Content:**
```sql
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS device_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS client_tx_id UUID;

CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_device_client_tx_id 
ON transactions(device_id, client_tx_id) 
WHERE device_id IS NOT NULL AND client_tx_id IS NOT NULL;

COMMENT ON COLUMN transactions.device_id IS 'Device ID for offline kiosk sync - used to deduplicate offline submissions';
COMMENT ON COLUMN transactions.client_tx_id IS 'Client-generated UUID for offline transaction tracking - enables idempotency';
```

### Step 2: Set Environment Variables in Vercel
1. Go to Vercel dashboard → Project Settings → Environment Variables
2. Add: `KIOSK_SYNC_TOKEN=your-secure-token-here` (choose any secure random string)
   - Example: `KIOSK_SYNC_TOKEN=sk_kiosk_abc123xyz789`
3. Make sure it's applied to all environments (Production, Preview, Development)
4. Redeploy your project

### Step 3: Generate Kiosk Build
On your local machine:
```bash
cd /path/to/project

# Make build script executable
chmod +x scripts/build-kiosk.sh

# Generate the offline build
npm run build:kiosk
```

This creates a `kiosk-build/` folder with:
- `kiosk-build/index.html` - Main entry point
- `kiosk-build/assets/` - All CSS/JS bundles

### Step 4: Add to Android Project
In your Android Studio project:

```bash
# Copy build files to Android assets
cp -r kiosk-build/* app/src/main/assets/

# Update WebView code in your Activity
webView.loadUrl("file:///android_asset/index.html")

# Add JavaScript bridge (Kotlin/Java)
webView.addJavascriptInterface(KioskBridge(this), "Android")
```

**Minimal Android Kotlin Bridge:**
```kotlin
class KioskBridge(private val activity: Activity) {
    @JavascriptInterface
    fun submitTransaction(jsonPayload: String) {
        try {
            val transaction = JSONObject(jsonPayload)
            // Save to local database
            val queue = TransactionQueue(activity)
            queue.save(transaction)
            Log.d("Kiosk", "Transaction queued: ${transaction.getString("client_tx_id")}")
        } catch (e: Exception) {
            Log.e("Kiosk", "Error submitting transaction", e)
        }
    }
}
```

### Step 5: Test the Endpoint (Terminal)
```bash
# Set your token
KIOSK_TOKEN="your-secure-token-here"
SERVER_URL="https://tcpdca.com"  # or your domain

# Test with sample transaction
curl -X POST "$SERVER_URL/api/transactions/bulk" \
  -H "x-kiosk-token: $KIOSK_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "kiosk-01",
    "transactions": [
      {
        "client_tx_id": "550e8400-e29b-41d4-a716-446655440000",
        "business_id": "biz-001",
        "member_id": "mem-001",
        "amount": 25,
        "description": "kiosk",
        "occurred_at": "2026-02-09T12:00:00Z"
      }
    ]
  }'

# Expected success response:
# {
#   "success": true,
#   "device_id": "kiosk-01",
#   "processed": 1,
#   "results": [
#     {
#       "client_tx_id": "550e8400-e29b-41d4-a716-446655440000",
#       "status": "accepted",
#       "server_transaction_id": "txn-12345",
#       "balance_after": 475
#     }
#   ]
# }
```

---

## How It Works

### Flow: Offline → Sync
1. **Android app loads** `file:///android_asset/index.html` in WebView
2. **User selects** Business → Amount → Member
3. **App generates** UUID v4 for `client_tx_id`
4. **App calls** `window.Android.submitTransaction(JSON)`
5. **Android bridge** receives JSON, saves to local SQLite
6. **User sees** success screen (no network needed)
7. **Later, when online** Android app POSTs to `/api/transactions/bulk` with queued transactions
8. **Server validates** idempotency via (device_id, client_tx_id) index
9. **Member balance** atomically updated
10. **Android removes** transaction from queue

### Request/Response Format

**POST /api/transactions/bulk**
```json
{
  "device_id": "kiosk-01",
  "transactions": [
    {
      "client_tx_id": "uuid-v4-string",
      "business_id": "biz-001",
      "member_id": "mem-001",
      "amount": 25,
      "description": "kiosk",
      "occurred_at": "2026-02-09T12:00:00Z"
    }
  ]
}
```

**Response 200 OK**
```json
{
  "success": true,
  "device_id": "kiosk-01",
  "processed": 1,
  "results": [
    {
      "client_tx_id": "uuid-v4-string",
      "status": "accepted",
      "server_transaction_id": "txn-12345",
      "balance_after": 475
    }
  ]
}
```

---

## Troubleshooting

### "Android app not detected" error
- Ensure WebView loads the HTML successfully
- Check Android Bridge is registered: `webView.addJavascriptInterface(..., "Android")`
- Check browser console (Android Studio Logcat)

### Transactions not syncing
- Verify `x-kiosk-token` header matches `KIOSK_SYNC_TOKEN` env var
- Check Vercel logs for 401 errors
- Ensure `device_id` and `client_tx_id` are non-null (for index)

### Duplicates showing up
- The unique index should prevent this. If duplicates appear:
  - Verify index was created: `SELECT * FROM pg_indexes WHERE tablename = 'transactions'`
  - Check that both `device_id` and `client_tx_id` are non-NULL

### Balance not updating
- Verify transaction was inserted (check transaction row exists)
- Check member balance is actually being updated
- Ensure `billing_cycle` table has an active cycle

---

## Security Notes

1. **KIOSK_SYNC_TOKEN** - Keep this secret, rotate regularly
2. **No auth on Android** - Assume Android app is trusted device
3. **Device ID** - Should be unique per kiosk (MAC address or user-configurable)
4. **HTTPS only** - Ensure Android WebView enforces HTTPS in production
5. **Rate limiting** - Consider adding rate limit middleware if needed

---

## Files Modified
**NONE** - Only new files were created. Your existing `/kiosk` flow is untouched.

---

## Files Created
1. `/app/kiosk-app/page.tsx`
2. `/app/api/transactions/bulk/route.ts`
3. `/scripts/add-offline-kiosk-columns.sql`
4. `/scripts/build-kiosk.sh`
5. `/kiosk-build.config.json`

---

## Commands You'll Run

```bash
# Generate kiosk build (do this once, then copy to Android)
npm run build:kiosk

# Output: kiosk-build/
#   ├── index.html
#   └── assets/
#       └── (CSS, JS bundles)
```

---

## Next Steps

1. **Now:** Run SQL migration in Supabase
2. **Now:** Add `KIOSK_SYNC_TOKEN` env var to Vercel
3. **Later:** Clone kiosk-build/ to Android assets
4. **Later:** Implement Android bridge and sync logic
5. **Later:** Test with curl command above
6. **Later:** Test full flow on tablet

You're all set! Your existing web kiosk is unchanged, and you now have an offline Android version that will sync when online.
