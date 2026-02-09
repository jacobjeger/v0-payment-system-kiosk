-- Add columns to track offline transactions for Android kiosk app
ALTER TABLE transactions
ADD COLUMN IF NOT EXISTS device_id VARCHAR(255),
ADD COLUMN IF NOT EXISTS client_tx_id UUID;

-- Create partial unique index to prevent duplicates (only index non-NULL values)
-- This allows multiple NULL values but ensures (device_id, client_tx_id) pairs are unique when both present
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_device_client_tx_id 
ON transactions(device_id, client_tx_id) 
WHERE device_id IS NOT NULL AND client_tx_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN transactions.device_id IS 'Device ID for offline kiosk sync - used to deduplicate offline submissions';
COMMENT ON COLUMN transactions.client_tx_id IS 'Client-generated UUID for offline transaction tracking - enables idempotency';
