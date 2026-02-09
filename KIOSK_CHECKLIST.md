# ✅ PDCA Offline Kiosk - Implementation Checklist

## NEW FILES CREATED (5 files, 0 modifications)
- [ ] `/app/kiosk-app/page.tsx` (372 lines) - Client offline UI with Android bridge
- [ ] `/app/api/transactions/bulk/route.ts` (197 lines) - Sync API endpoint  
- [ ] `/scripts/add-offline-kiosk-columns.sql` - DB migration
- [ ] `/scripts/build-kiosk.sh` - Build script
- [ ] `/kiosk-build.config.json` - Build config

## SETUP (3 Steps)

### Step 1: Database Migration
- [ ] Open Supabase SQL Editor
- [ ] Paste content from `/scripts/add-offline-kiosk-columns.sql`
- [ ] Click Run
- [ ] Verify: Check that columns `device_id` and `client_tx_id` exist on transactions table

### Step 2: Vercel Environment Variable
- [ ] Go to Vercel project → Settings → Environment Variables
- [ ] Add: `KIOSK_SYNC_TOKEN` = (any secure random string, e.g., `sk_kiosk_abc123xyz`)
- [ ] Apply to: Production, Preview, Development
- [ ] Redeploy project

### Step 3: Generate Kiosk Build
```bash
chmod +x scripts/build-kiosk.sh
npm run build:kiosk
```
- [ ] Command runs successfully
- [ ] `kiosk-build/` folder created with `index.html` and `assets/`

## ANDROID INTEGRATION (Pseudo-code)

### In Android Studio:
```kotlin
// 1. Copy files
cp -r kiosk-build/* app/src/main/assets/

// 2. In your Activity/Fragment:
webView.addJavascriptInterface(KioskBridge(this), "Android")
webView.loadUrl("file:///android_asset/index.html")

// 3. Implement bridge
class KioskBridge(val context: Context) {
    @JavascriptInterface
    fun submitTransaction(jsonPayload: String) {
        // Save to local SQLite queue
        val tx = JSONObject(jsonPayload)
        // Later: POST queue to /api/transactions/bulk
    }
}

// 4. When online, sync queue:
POST https://tcpdca.com/api/transactions/bulk
Header: x-kiosk-token: YOUR_TOKEN
Body: { device_id, transactions: [...] }
```

## TESTING (Terminal)

```bash
# Replace with your values:
TOKEN="your-kiosk-sync-token"
SERVER="https://tcpdca.com"

# Test endpoint:
curl -X POST "$SERVER/api/transactions/bulk" \
  -H "x-kiosk-token: $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "kiosk-01",
    "transactions": [{
      "client_tx_id": "550e8400-e29b-41d4-a716-446655440000",
      "business_id": "biz-001",
      "member_id": "mem-001",
      "amount": 25,
      "description": "kiosk",
      "occurred_at": "'$(date -u +'%Y-%m-%dT%H:%M:%SZ')'
    }]
  }'

# Expected: status "accepted" with server_transaction_id and balance_after
```

## API REFERENCE

### POST /api/transactions/bulk
**Headers:**
- `x-kiosk-token: YOUR_TOKEN` (required)
- `Content-Type: application/json`

**Request:**
```json
{
  "device_id": "kiosk-01",
  "transactions": [
    {
      "client_tx_id": "uuid-v4",
      "business_id": "biz-id",
      "member_id": "member-id",
      "amount": 25,
      "description": "kiosk",
      "occurred_at": "2026-02-09T12:00:00Z"
    }
  ]
}
```

**Response (200):**
```json
{
  "success": true,
  "device_id": "kiosk-01",
  "processed": 1,
  "results": [{
    "client_tx_id": "uuid-v4",
    "status": "accepted|duplicate|rejected",
    "server_transaction_id": "txn-id",
    "balance_after": 475,
    "error": null
  }]
}
```

**Errors:**
- `401` - Invalid/missing `x-kiosk-token`
- `400` - Invalid request format
- `500` - Server error

## STATUS CODES EXPLAINED

| Status | Meaning | Action |
|--------|---------|--------|
| `accepted` | Transaction processed, balance updated | Remove from queue |
| `duplicate` | Already synced (same device_id + client_tx_id) | Remove from queue |
| `rejected` | Member/business not found or balance error | Log error, try later |

## KEY DESIGN DECISIONS

✅ **No existing files modified** - Only new files added
✅ **Client-only offline page** - No server-side rendering needed
✅ **Embedded demo data** - Works completely offline
✅ **UUID v4 for idempotency** - Safe to retry without duplicates
✅ **Token-based security** - Simple, no auth overhead
✅ **Atomic balance updates** - Uses transactions for consistency
✅ **Batch processing** - Up to 100 tx per request
✅ **Touch-friendly UI** - Big buttons, mobile-first

## ENVIRONMENT VARIABLES NEEDED

```
KIOSK_SYNC_TOKEN=sk_kiosk_your_secure_token_here
```

That's it! Everything else is already configured.

## QUICK REFERENCE

| What | Where | Status |
|------|-------|--------|
| Offline UI | `/app/kiosk-app/page.tsx` | ✅ Ready |
| Sync API | `/app/api/transactions/bulk/route.ts` | ✅ Ready |
| DB Schema | `/scripts/add-offline-kiosk-columns.sql` | ✅ Ready |
| Build Script | `/scripts/build-kiosk.sh` | ✅ Ready |
| Setup Guide | `/OFFLINE_KIOSK_SETUP.md` | ✅ Ready |
| Existing /kiosk | Unchanged | ✅ Safe |

---

**You're all set!** Start with Step 1 above and work your way down. 🚀
