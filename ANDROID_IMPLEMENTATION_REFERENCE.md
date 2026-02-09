// PDCA Offline Kiosk - Android Implementation Reference
// This is pseudo-code showing how to integrate the web app with Android

// ============================================================================
// 1. Set up WebView in your Activity
// ============================================================================

class KioskActivity : AppCompatActivity() {
    private lateinit var webView: WebView
    private val transactionQueue = TransactionQueue(this)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_kiosk)
        webView = findViewById(R.id.webView)
        setupWebView()
    }

    private fun setupWebView() {
        webView.settings.apply {
            javaScriptEnabled = true
            cacheMode = WebSettings.LOAD_CACHE_ELSE_NETWORK
            domStorageEnabled = true
            databaseEnabled = true
        }

        // Add the JavaScript bridge
        webView.addJavascriptInterface(
            KioskBridge(this, transactionQueue),
            "Android"
        )

        // Load offline HTML
        webView.loadUrl("file:///android_asset/index.html")
    }
}

// ============================================================================
// 2. JavaScript Bridge - receives transactions from web app
// ============================================================================

class KioskBridge(
    private val context: Context,
    private val queue: TransactionQueue
) {
    @JavascriptInterface
    fun submitTransaction(jsonPayload: String) {
        try {
            val transaction = JSONObject(jsonPayload)
            Log.d("KioskBridge", "Received transaction: $transaction")

            // Save to local SQLite queue
            queue.save(OfflineTransaction(
                clientTxId = transaction.getString("client_tx_id"),
                deviceId = transaction.getString("device_id"),
                businessId = transaction.getString("business_id"),
                memberId = transaction.getString("member_id"),
                amount = transaction.getDouble("amount"),
                description = transaction.getString("description"),
                occurredAt = transaction.getString("occurred_at"),
                status = "pending"
            ))

            Log.d("KioskBridge", "Transaction queued: ${transaction.getString("client_tx_id")}")

            // Show toast or notification
            Toast.makeText(
                context,
                "Transaction saved. Will sync when online.",
                Toast.LENGTH_SHORT
            ).show()

        } catch (e: Exception) {
            Log.e("KioskBridge", "Error processing transaction", e)
            Toast.makeText(context, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
        }
    }
}

// ============================================================================
// 3. Local SQLite Database - stores offline transactions
// ============================================================================

data class OfflineTransaction(
    val clientTxId: String,
    val deviceId: String,
    val businessId: String,
    val memberId: String,
    val amount: Double,
    val description: String,
    val occurredAt: String,
    val status: String // "pending", "syncing", "synced", "failed"
)

class TransactionQueue(context: Context) {
    private val db = TransactionDatabase.getInstance(context).transactionDao()

    fun save(transaction: OfflineTransaction) {
        // Insert into SQLite
        db.insert(transaction)
    }

    fun getPending(): List<OfflineTransaction> {
        return db.getByStatus("pending")
    }

    fun updateStatus(clientTxId: String, status: String) {
        db.updateStatus(clientTxId, status)
    }

    fun delete(clientTxId: String) {
        db.deleteByClientTxId(clientTxId)
    }
}

// ============================================================================
// 4. Sync Service - periodically syncs to server when online
// ============================================================================

class TransactionSyncService(context: Context) {
    private val queue = TransactionQueue(context)
    private val retrofit = RetrofitClient.getInstance()
    private val apiService = retrofit.create(KioskApiService::class.java)

    suspend fun syncPending() {
        val pending = queue.getPending()
        if (pending.isEmpty()) return

        Log.d("SyncService", "Syncing ${pending.size} transactions...")

        try {
            val response = apiService.syncTransactions(
                BulkSyncRequest(
                    device_id = "kiosk-01", // Or from device settings
                    transactions = pending.map { it.toApiFormat() }
                )
            )

            if (response.success) {
                // Process results
                for (result in response.results) {
                    when (result.status) {
                        "accepted", "duplicate" -> {
                            queue.updateStatus(result.client_tx_id, "synced")
                            queue.delete(result.client_tx_id)
                        }
                        "rejected" -> {
                            queue.updateStatus(result.client_tx_id, "failed")
                            Log.w("SyncService", "TX rejected: ${result.error}")
                        }
                    }
                }
                Log.d("SyncService", "Sync complete")
            }
        } catch (e: Exception) {
            Log.e("SyncService", "Sync failed", e)
            // Will retry next time
        }
    }
}

// ============================================================================
// 5. API Service - Retrofit definition
// ============================================================================

interface KioskApiService {
    @POST("/api/transactions/bulk")
    suspend fun syncTransactions(
        @Body request: BulkSyncRequest,
        @Header("x-kiosk-token") token: String = BuildConfig.KIOSK_SYNC_TOKEN
    ): BulkSyncResponse
}

data class BulkSyncRequest(
    val device_id: String,
    val transactions: List<Map<String, Any>>
)

data class BulkSyncResponse(
    val success: Boolean,
    val processed: Int,
    val results: List<TransactionResult>
)

data class TransactionResult(
    val client_tx_id: String,
    val status: String, // "accepted", "duplicate", "rejected"
    val server_transaction_id: String?,
    val balance_after: Double?,
    val error: String?
)

// ============================================================================
// 6. Network Monitor - trigger sync when online
// ============================================================================

class NetworkMonitor(context: Context) : BroadcastReceiver() {
    private val syncService = TransactionSyncService(context)

    override fun onReceive(context: Context, intent: Intent?) {
        if (isOnline(context)) {
            Log.d("NetworkMonitor", "Back online - syncing transactions...")
            // Launch sync (using coroutines or executor)
            GlobalScope.launch(Dispatchers.Main) {
                syncService.syncPending()
            }
        }
    }

    private fun isOnline(context: Context): Boolean {
        val connectivityManager =
            context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val activeNetwork = connectivityManager.activeNetwork ?: return false
        val caps = connectivityManager.getNetworkCapabilities(activeNetwork) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }
}

// ============================================================================
// 7. AndroidManifest.xml - Permissions needed
// ============================================================================

/*
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

<application>
    <activity android:name=".KioskActivity" />
    <service android:name=".TransactionSyncService" />
    <receiver
        android:name=".NetworkMonitor"
        android:exported="true">
        <intent-filter>
            <action android:name="android.net.conn.CONNECTIVITY_CHANGE" />
        </intent-filter>
    </receiver>
</application>
*/

// ============================================================================
// 8. Usage Example - In your Activity
// ============================================================================

class KioskActivity : AppCompatActivity() {
    private val syncService by lazy { TransactionSyncService(this) }
    private val networkMonitor by lazy { NetworkMonitor(this) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_kiosk)
        setupWebView()
        registerNetworkMonitor()
        syncOnStartup()
    }

    private fun syncOnStartup() {
        lifecycleScope.launch {
            syncService.syncPending()
        }
    }

    private fun registerNetworkMonitor() {
        val filter = IntentFilter(ConnectivityManager.CONNECTIVITY_ACTION)
        registerReceiver(networkMonitor, filter)
    }

    override fun onDestroy() {
        super.onDestroy()
        unregisterReceiver(networkMonitor)
    }
}

// ============================================================================
// 9. Testing - cURL test command
// ============================================================================

/*
# Test sync endpoint

TOKEN="sk_kiosk_your_token_here"
SERVER="https://tcpdca.com"

curl -X POST "$SERVER/api/transactions/bulk" \
  -H "x-kiosk-token: $TOKEN" \
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

# Expected response:
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
*/

// ============================================================================
// Key Implementation Points
// ============================================================================

/*
1. WebView Setup:
   - Enable JavaScript
   - Set up cache mode (LOAD_CACHE_ELSE_NETWORK for offline)
   - Add JavascriptInterface for Android bridge

2. Bridge Communication:
   - Web calls: window.Android.submitTransaction(JSON.stringify(payload))
   - Android receives: parse JSON, save to SQLite

3. Local Storage:
   - Use SQLite with columns: clientTxId, deviceId, businessId, memberId, amount, status
   - Status values: pending → syncing → synced (or failed)

4. Network Sync:
   - Batch pending transactions
   - POST to /api/transactions/bulk with x-kiosk-token header
   - Process results and delete synced transactions

5. Error Handling:
   - "rejected": log error, mark as failed, alert user
   - "duplicate": already synced, just delete from queue
   - Network error: retry on next online event

6. Security:
   - Store token in BuildConfig (secrets management)
   - Use HTTPS only in production
   - Validate SSL certificates
   - Consider adding certificate pinning
*/
