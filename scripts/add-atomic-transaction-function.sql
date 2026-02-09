-- Atomic idempotent transaction function for offline kiosk sync
-- This function ensures transaction insert + balance update are atomic

CREATE OR REPLACE FUNCTION process_kiosk_transaction(
  p_device_id VARCHAR,
  p_client_tx_id UUID,
  p_member_id UUID,
  p_business_id UUID,
  p_amount NUMERIC,
  p_description TEXT,
  p_occurred_at TIMESTAMP WITH TIME ZONE
)
RETURNS TABLE (
  status TEXT,
  server_transaction_id UUID,
  balance_after NUMERIC,
  error_message TEXT
) AS $$
DECLARE
  v_existing_tx_id UUID;
  v_member_balance NUMERIC;
  v_new_balance NUMERIC;
  v_new_tx_id UUID;
BEGIN
  -- Check for duplicate transaction (idempotency key)
  SELECT id INTO v_existing_tx_id
  FROM transactions
  WHERE device_id = p_device_id 
    AND client_tx_id = p_client_tx_id
  LIMIT 1;

  IF v_existing_tx_id IS NOT NULL THEN
    -- Duplicate found, return existing transaction
    RETURN QUERY
    SELECT 
      'duplicate'::TEXT,
      v_existing_tx_id,
      (SELECT balance_after FROM transactions WHERE id = v_existing_tx_id),
      NULL::TEXT;
    RETURN;
  END IF;

  -- Verify member exists and lock for update
  SELECT balance INTO v_member_balance
  FROM members
  WHERE id = p_member_id
  FOR UPDATE;

  IF v_member_balance IS NULL THEN
    RETURN QUERY SELECT 'rejected'::TEXT, NULL::UUID, NULL::NUMERIC, 'Member not found'::TEXT;
    RETURN;
  END IF;

  -- Verify business exists
  IF NOT EXISTS (SELECT 1 FROM businesses WHERE id = p_business_id) THEN
    RETURN QUERY SELECT 'rejected'::TEXT, NULL::UUID, NULL::NUMERIC, 'Business not found'::TEXT;
    RETURN;
  END IF;

  -- Calculate new balance
  v_new_balance := v_member_balance - p_amount;

  -- Insert transaction and update balance atomically
  INSERT INTO transactions (
    member_id,
    business_id,
    amount,
    balance_before,
    balance_after,
    description,
    device_id,
    client_tx_id,
    created_at
  ) VALUES (
    p_member_id,
    p_business_id,
    p_amount,
    v_member_balance,
    v_new_balance,
    p_description,
    p_device_id,
    p_client_tx_id,
    p_occurred_at
  ) RETURNING id INTO v_new_tx_id;

  -- Update member balance atomically in same transaction
  UPDATE members
  SET balance = v_new_balance,
      updated_at = NOW()
  WHERE id = p_member_id;

  -- Return success
  RETURN QUERY
  SELECT 
    'accepted'::TEXT,
    v_new_tx_id,
    v_new_balance,
    NULL::TEXT;

EXCEPTION WHEN OTHERS THEN
  RETURN QUERY
  SELECT 
    'rejected'::TEXT,
    NULL::UUID,
    NULL::NUMERIC,
    SQLERRM::TEXT;
END;
$$ LANGUAGE plpgsql;
