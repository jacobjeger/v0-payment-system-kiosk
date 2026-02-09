# PRODUCTION DEPLOYMENT CHECKLIST

## Phase 1: Pre-Deployment (Before Running SQL)

### Code Changes
- [x] API columns fixed (removed source, billing_cycle_id)
- [x] Kiosk app loads real production data
- [x] Device ID configurable and unique per kiosk
- [x] Next.js static export configured
- [x] Build script properly exports React app
- [x] Race condition documented and acceptable

### Environment Variables
- [ ] `KIOSK_SYNC_TOKEN` generated (random 32-char string)
- [ ] `KIOSK_SYNC_TOKEN` added to Vercel project settings
- [ ] Applied to all environments (preview/production)
- [ ] Redeploy triggered after adding env var

### Files Modified
- [ ] Review `/next.config.mjs` - output config added
- [ ] Review `/app/api/transactions/bulk/route.ts` - columns fixed
- [ ] Review `/app/kiosk-app/page.tsx` - loads real data
- [ ] Review `/scripts/build-kiosk.sh` - exports properly
- [ ] Review `/package.json` - `build:kiosk` script exists

---

## Phase 2: Database Migration

### Run Migration
```bash
# 1. Go to Supabase SQL Editor (https://app.supabase.com/project/[project-id]/sql/new)
# 2. Copy from: /scripts/add-offline-kiosk-columns.sql
# 3. Click Run
```

### Verify Migration
- [ ] device_id column added to transactions table
- [ ] client_tx_id column added to transactions table
- [ ] Unique index created on (device_id, client_tx_id)
- [ ] No errors in migration log
- [ ] Existing transactions unaffected (columns nullable)

### Rollback (if needed)
```sql
-- Rollback script (if migration fails)
DROP INDEX IF EXISTS idx_transactions_device_client_tx_id;
ALTER TABLE transactions DROP COLUMN IF EXISTS device_id;
ALTER TABLE transactions DROP COLUMN IF EXISTS client_tx_id;
```

---

## Phase 3: API Verification

### Endpoint Tests
- [ ] Endpoint accessible: `https://tcpdca.com/api/transactions/bulk`
- [ ] Without token: Returns 401 Unauthorized ✓
- [ ] With wrong token: Returns 401 Unauthorized ✓
- [ ] With correct token: Accepts request ✓

### Test Transaction - REAL DATA
```bash
# Get real IDs from your database first:
# SELECT id FROM members LIMIT 1;
# SELECT id FROM businesses LIMIT 1;

curl -X POST "https://tcpdca.com/api/transactions/bulk" \
  -H "x-kiosk-token: sk_kiosk_YOUR_ACTUAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "kiosk-test-001",
    "transactions": [{
      "client_tx_id": "550e8400-e29b-41d4-a716-446655440000",
      "business_id": "YOUR_REAL_BUSINESS_ID",
      "member_id": "YOUR_REAL_MEMBER_ID",
      "amount": 25,
      "description": "test",
      "occurred_at": "2026-02-09T12:00:00Z"
    }]
  }'
```

### Expected Response (Success)
```json
{
  "success": true,
  "device_id": "kiosk-test-001",
  "processed": 1,
  "results": [{
    "client_tx_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "accepted",
    "server_transaction_id": "UUID",
    "balance_after": 123.45
  }]
}
```

### Verification Points
- [ ] Status is "accepted" (not rejected)
- [ ] server_transaction_id returned (transaction created)
- [ ] balance_after shows updated balance
- [ ] Transaction visible in Supabase (check transactions table)
- [ ] Member balance updated in members table

### Test Duplicate Handling
```bash
# Same client_tx_id from same device - should be duplicate
curl -X POST "https://tcpdca.com/api/transactions/bulk" \
  -H "x-kiosk-token: sk_kiosk_YOUR_ACTUAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "kiosk-test-001",
    "transactions": [{
      "client_tx_id": "550e8400-e29b-41d4-a716-446655440000",
      "business_id": "YOUR_REAL_BUSINESS_ID",
      "member_id": "YOUR_REAL_MEMBER_ID",
      "amount": 25,
      "description": "test",
      "occurred_at": "2026-02-09T12:00:00Z"
    }]
  }'
```

### Expected Response (Duplicate)
```json
{
  "results": [{
    "client_tx_id": "550e8400-e29b-41d4-a716-446655440000",
    "status": "duplicate",
    "server_transaction_id": "UUID",
    "balance_after": 123.45
  }]
}
```

- [ ] Status is "duplicate"
- [ ] Returns original transaction ID
- [ ] Member balance NOT changed again
- [ ] Member balance same as before

### Test with Invalid IDs
```bash
# Use fake member ID
curl -X POST "https://tcpdca.com/api/transactions/bulk" \
  -H "x-kiosk-token: sk_kiosk_YOUR_ACTUAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "kiosk-test-002",
    "transactions": [{
      "client_tx_id": "550e8400-e29b-41d4-a716-446655440001",
      "business_id": "fake-business-id",
      "member_id": "fake-member-id",
      "amount": 25,
      "description": "test",
      "occurred_at": "2026-02-09T12:00:00Z"
    }]
  }'
```

### Expected Response (Rejected)
```json
{
  "results": [{
    "client_tx_id": "550e8400-e29b-41d4-a716-446655440001",
    "status": "rejected",
    "error": "Member not found"
  }]
}
```

- [ ] Status is "rejected"
- [ ] Error message explains reason
- [ ] Member balance unchanged
- [ ] No transaction created

---

## Phase 4: Kiosk App Verification

### Test in Browser
- [ ] Navigate to `https://tcpdca.com/app/kiosk-app`
- [ ] Page loads (not 404)
- [ ] Shows loading state briefly
- [ ] Lists REAL members from database (not demo data)
- [ ] Lists REAL businesses from database (not demo data)
- [ ] Can search members
- [ ] Can search businesses
- [ ] Can select business → amount → member
- [ ] Success page shows
- [ ] Auto-resets after success

### Verify No Demo Data
- [ ] NO members with IDs: mem-001, mem-002, mem-003
- [ ] NO businesses with IDs: biz-001, biz-002, biz-003
- [ ] All members loaded use real UUIDs from database
- [ ] All businesses loaded use real UUIDs from database

### Test Localization
- [ ] Device ID shown in header (e.g., "kiosk-1707478923456-abc123")
- [ ] Open console: localStorage shows "kiosk_device_id"
- [ ] Refresh page: Device ID persists (same value)
- [ ] Device ID changes only on new localStorage

### Test Error Handling
- [ ] Disconnect internet or block /api/kiosk/data
- [ ] App shows error screen
- [ ] Error message explains issue
- [ ] "Retry" button works

---

## Phase 5: Static Build Verification

### Build for Android
```bash
# Make script executable
chmod +x scripts/build-kiosk.sh

# Run build
npm run build:kiosk
```

### Verify Output
- [ ] `kiosk-build/` folder created
- [ ] `kiosk-build/index.html` exists
- [ ] `kiosk-build/_next/static/` exists with chunks
- [ ] `kiosk-build/_next/static/css/` has styles
- [ ] File sizes reasonable (not empty)

### Test Locally
- [ ] Open `file:///path/to/kiosk-build/index.html` in browser
- [ ] Kiosk app loads
- [ ] Members/businesses shown
- [ ] No console errors (except Android bridge not detected)
- [ ] App is functional offline

### Test in Android WebView (Optional)
- [ ] Copy `kiosk-build/` to Android assets
- [ ] Load in WebView: `file:///android_asset/kiosk-app/index.html`
- [ ] App displays
- [ ] Can interact
- [ ] Android bridge can be called

---

## Phase 6: Production Deployment

### Deploy to Vercel
- [ ] All changes committed to git
- [ ] All env vars set in Vercel project
- [ ] Run deployment: `vercel deploy --prod`
- [ ] Wait for build to complete
- [ ] Deployment successful (no errors)

### Smoke Tests on Production
- [ ] `https://tcpdca.com/app/kiosk-app` loads
- [ ] `/api/kiosk/data` returns members/businesses
- [ ] `/api/transactions/bulk` accepts valid tokens
- [ ] Real transaction goes through
- [ ] Duplicate is detected
- [ ] Invalid IDs are rejected
- [ ] Balances update correctly

### Monitor
- [ ] Check error logs (Vercel, Sentry)
- [ ] No unusual error patterns
- [ ] Database connections stable
- [ ] Response times acceptable

---

## Phase 7: Android Integration

### Android Developer Steps
- [ ] Copy `kiosk-build/` to `app/src/main/assets/kiosk-app/`
- [ ] Create WebView loading the file
- [ ] Implement Android bridge:
  ```kotlin
  webView.addJavascriptInterface(KioskBridge(), "Android")
  
  class KioskBridge {
    @JavascriptInterface
    fun submitTransaction(jsonPayload: String) {
      // Handle offline queueing
      // When online: POST to /api/transactions/bulk
    }
  }
  ```
- [ ] Test app in Android emulator/device
- [ ] Verify transactions queue when offline
- [ ] Verify transactions sync when online
- [ ] Test multiple devices with different IDs

---

## Final Sign-Off

- [ ] All 6 critical issues verified as fixed
- [ ] Database migration successful
- [ ] API accepting real transactions
- [ ] Kiosk app using production data
- [ ] Build script generating exportable output
- [ ] No demo data in production
- [ ] Device IDs unique and tracked
- [ ] Ready for customer deployment

**Deployment Status:** ✅ APPROVED FOR PRODUCTION

**Deployed By:** _________________
**Date:** _________________
**Version:** 1.0.0
