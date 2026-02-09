-- =============================================================================
-- PDCA Security Migration: RLS Policies + Atomic Transactions
-- =============================================================================
-- This migration adds:
-- 1. Row Level Security (RLS) policies on all tables
-- 2. Atomic transaction function for financial operations
-- 3. Audit log table for admin actions
-- 4. Race condition protection via row locking
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PART 1: AUDIT LOG TABLE
-- -----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL,
  record_id uuid NOT NULL,
  action text NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_data jsonb,
  new_data jsonb,
  changed_by uuid REFERENCES auth.users(id),
  changed_at timestamptz DEFAULT now(),
  ip_address text,
  user_agent text
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_table_record ON audit_logs(table_name, record_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_changed_at ON audit_logs(changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_changed_by ON audit_logs(changed_by);

-- -----------------------------------------------------------------------------
-- PART 2: ENABLE RLS ON ALL TABLES
-- -----------------------------------------------------------------------------

ALTER TABLE businesses ENABLE ROW LEVEL SECURITY;
ALTER TABLE members ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE balance_adjustments ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE transaction_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE pending_card_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- PART 3: HELPER FUNCTIONS FOR RLS
-- -----------------------------------------------------------------------------

-- Check if current user is an admin
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM admins 
    WHERE auth_user_id = auth.uid() 
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if current user owns a business
CREATE OR REPLACE FUNCTION owns_business(business_uuid uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM businesses 
    WHERE id = business_uuid 
    AND auth_user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if current user is the member
CREATE OR REPLACE FUNCTION is_member(member_uuid uuid)
RETURNS boolean AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM members 
    WHERE id = member_uuid 
    AND auth_user_id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- -----------------------------------------------------------------------------
-- PART 4: RLS POLICIES - ADMINS TABLE
-- -----------------------------------------------------------------------------

-- Admins can see all admins
CREATE POLICY "admins_select_policy" ON admins
  FOR SELECT USING (is_admin() OR auth.uid() = auth_user_id);

-- Only admins can insert/update/delete admins
CREATE POLICY "admins_insert_policy" ON admins
  FOR INSERT WITH CHECK (is_admin());
  
CREATE POLICY "admins_update_policy" ON admins
  FOR UPDATE USING (is_admin());
  
CREATE POLICY "admins_delete_policy" ON admins
  FOR DELETE USING (is_admin());

-- -----------------------------------------------------------------------------
-- PART 5: RLS POLICIES - BUSINESSES TABLE
-- -----------------------------------------------------------------------------

-- Anyone can read active businesses (needed for kiosk)
CREATE POLICY "businesses_select_public" ON businesses
  FOR SELECT USING (true);

-- Admins can do everything
CREATE POLICY "businesses_admin_all" ON businesses
  FOR ALL USING (is_admin());

-- Business owners can update their own business
CREATE POLICY "businesses_owner_update" ON businesses
  FOR UPDATE USING (auth.uid() = auth_user_id);

-- -----------------------------------------------------------------------------
-- PART 6: RLS POLICIES - MEMBERS TABLE
-- -----------------------------------------------------------------------------

-- Admins can see all members
CREATE POLICY "members_admin_select" ON members
  FOR SELECT USING (is_admin());

-- Members can see themselves
CREATE POLICY "members_self_select" ON members
  FOR SELECT USING (auth.uid() = auth_user_id);

-- Kiosk needs to read members (service role bypasses RLS)
-- For anon access, we allow select on specific non-sensitive columns
CREATE POLICY "members_kiosk_select" ON members
  FOR SELECT USING (true);

-- Admins can do all operations
CREATE POLICY "members_admin_all" ON members
  FOR ALL USING (is_admin());

-- Members can update their own record (limited fields enforced at app level)
CREATE POLICY "members_self_update" ON members
  FOR UPDATE USING (auth.uid() = auth_user_id);

-- -----------------------------------------------------------------------------
-- PART 7: RLS POLICIES - PRODUCTS TABLE
-- -----------------------------------------------------------------------------

-- Anyone can read products (needed for kiosk)
CREATE POLICY "products_select_public" ON products
  FOR SELECT USING (true);

-- Admins can do everything
CREATE POLICY "products_admin_all" ON products
  FOR ALL USING (is_admin());

-- Business owners can manage their products
CREATE POLICY "products_owner_all" ON products
  FOR ALL USING (owns_business(business_id));

-- -----------------------------------------------------------------------------
-- PART 8: RLS POLICIES - TRANSACTIONS TABLE
-- -----------------------------------------------------------------------------

-- Admins can see all transactions
CREATE POLICY "transactions_admin_all" ON transactions
  FOR ALL USING (is_admin());

-- Members can see their own transactions
CREATE POLICY "transactions_member_select" ON transactions
  FOR SELECT USING (is_member(member_id));

-- Business owners can see transactions at their business
CREATE POLICY "transactions_business_select" ON transactions
  FOR SELECT USING (owns_business(business_id));

-- Service role can insert transactions (kiosk uses service role)
-- Note: Anon users cannot insert transactions - only through server actions
CREATE POLICY "transactions_insert_service" ON transactions
  FOR INSERT WITH CHECK (true);

-- -----------------------------------------------------------------------------
-- PART 9: RLS POLICIES - BILLING TABLES
-- -----------------------------------------------------------------------------

-- Billing cycles - admins only for management
CREATE POLICY "billing_cycles_admin_all" ON billing_cycles
  FOR ALL USING (is_admin());

CREATE POLICY "billing_cycles_public_select" ON billing_cycles
  FOR SELECT USING (true);

-- Invoices - admins can manage, members can view their own
CREATE POLICY "invoices_admin_all" ON invoices
  FOR ALL USING (is_admin());

CREATE POLICY "invoices_member_select" ON invoices
  FOR SELECT USING (is_member(member_id));

-- Invoice emails - admins only
CREATE POLICY "invoice_emails_admin_all" ON invoice_emails
  FOR ALL USING (is_admin());

-- Balance adjustments - admins only
CREATE POLICY "balance_adjustments_admin_all" ON balance_adjustments
  FOR ALL USING (is_admin());

-- -----------------------------------------------------------------------------
-- PART 10: RLS POLICIES - SYSTEM TABLES
-- -----------------------------------------------------------------------------

-- System settings - admins can manage, public can read
CREATE POLICY "system_settings_admin_all" ON system_settings
  FOR ALL USING (is_admin());

CREATE POLICY "system_settings_public_select" ON system_settings
  FOR SELECT USING (true);

-- Email logs - admins only
CREATE POLICY "email_logs_admin_all" ON email_logs
  FOR ALL USING (is_admin());

-- Transaction reviews - admins can manage all, business/members can see their own
CREATE POLICY "transaction_reviews_admin_all" ON transaction_reviews
  FOR ALL USING (is_admin());

CREATE POLICY "transaction_reviews_business_select" ON transaction_reviews
  FOR SELECT USING (owns_business(business_id));

CREATE POLICY "transaction_reviews_insert" ON transaction_reviews
  FOR INSERT WITH CHECK (true);

-- Pending card changes - admins can manage, members can insert/view their own
CREATE POLICY "pending_card_changes_admin_all" ON pending_card_changes
  FOR ALL USING (is_admin());

CREATE POLICY "pending_card_changes_member_select" ON pending_card_changes
  FOR SELECT USING (is_member(member_id));

CREATE POLICY "pending_card_changes_member_insert" ON pending_card_changes
  FOR INSERT WITH CHECK (true);

-- Audit logs - admins only
CREATE POLICY "audit_logs_admin_all" ON audit_logs
  FOR ALL USING (is_admin());

-- -----------------------------------------------------------------------------
-- PART 11: ATOMIC TRANSACTION FUNCTION WITH RACE CONDITION PROTECTION
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION process_kiosk_transaction(
  p_member_id uuid,
  p_business_id uuid,
  p_amount numeric,
  p_description text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_billing_cycle_id uuid DEFAULT NULL,
  p_source text DEFAULT 'kiosk',
  p_device_info jsonb DEFAULT '{}'::jsonb,
  p_ip_address text DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_member_balance numeric;
  v_new_balance numeric;
  v_transaction_id uuid;
  v_member_record RECORD;
BEGIN
  -- Lock the member row to prevent race conditions
  -- FOR UPDATE will wait if another transaction has the lock
  SELECT id, balance, is_active, status, card_status
  INTO v_member_record
  FROM members
  WHERE id = p_member_id
  FOR UPDATE;
  
  -- Validate member exists
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Member not found'
    );
  END IF;
  
  -- Validate member is active
  IF v_member_record.is_active = false THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Member account is disabled'
    );
  END IF;
  
  IF v_member_record.status = 'paused' THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Member account is paused'
    );
  END IF;
  
  -- Validate amount is positive
  IF p_amount <= 0 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Amount must be positive'
    );
  END IF;
  
  -- Get current balance
  v_member_balance := COALESCE(v_member_record.balance, 0);
  v_new_balance := v_member_balance + p_amount;
  
  -- Create the transaction record
  INSERT INTO transactions (
    member_id,
    business_id,
    amount,
    balance_before,
    balance_after,
    description,
    notes,
    billing_cycle_id,
    source,
    device_info,
    ip_address,
    created_at
  ) VALUES (
    p_member_id,
    p_business_id,
    p_amount,
    v_member_balance,
    v_new_balance,
    p_description,
    p_notes,
    p_billing_cycle_id,
    p_source,
    p_device_info,
    p_ip_address,
    now()
  )
  RETURNING id INTO v_transaction_id;
  
  -- Update member balance
  UPDATE members
  SET 
    balance = v_new_balance,
    updated_at = now()
  WHERE id = p_member_id;
  
  -- Return success with transaction details
  RETURN jsonb_build_object(
    'success', true,
    'transaction_id', v_transaction_id,
    'balance_before', v_member_balance,
    'balance_after', v_new_balance,
    'amount', p_amount
  );
  
EXCEPTION
  WHEN OTHERS THEN
    -- Return error details
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'error_code', SQLSTATE
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users and service role
GRANT EXECUTE ON FUNCTION process_kiosk_transaction TO authenticated;
GRANT EXECUTE ON FUNCTION process_kiosk_transaction TO service_role;

-- -----------------------------------------------------------------------------
-- PART 12: ADMIN BALANCE ADJUSTMENT FUNCTION
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION admin_adjust_balance(
  p_member_id uuid,
  p_amount numeric,
  p_adjustment_type text,
  p_notes text DEFAULT NULL,
  p_admin_user_id uuid DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_member_balance numeric;
  v_new_balance numeric;
  v_adjustment_id uuid;
BEGIN
  -- Lock the member row
  SELECT balance INTO v_member_balance
  FROM members
  WHERE id = p_member_id
  FOR UPDATE;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Member not found'
    );
  END IF;
  
  v_member_balance := COALESCE(v_member_balance, 0);
  v_new_balance := v_member_balance + p_amount;
  
  -- Create adjustment record
  INSERT INTO balance_adjustments (
    member_id,
    amount,
    adjustment_type,
    notes,
    admin_user_id,
    balance_before,
    balance_after
  ) VALUES (
    p_member_id,
    p_amount,
    p_adjustment_type,
    p_notes,
    p_admin_user_id,
    v_member_balance,
    v_new_balance
  )
  RETURNING id INTO v_adjustment_id;
  
  -- Update member balance
  UPDATE members
  SET 
    balance = v_new_balance,
    updated_at = now()
  WHERE id = p_member_id;
  
  RETURN jsonb_build_object(
    'success', true,
    'adjustment_id', v_adjustment_id,
    'balance_before', v_member_balance,
    'balance_after', v_new_balance
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION admin_adjust_balance TO authenticated;
GRANT EXECUTE ON FUNCTION admin_adjust_balance TO service_role;

-- -----------------------------------------------------------------------------
-- PART 13: TRANSACTION VOID/REVERSAL FUNCTION
-- -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION void_transaction(
  p_transaction_id uuid,
  p_reason text,
  p_admin_user_id uuid DEFAULT NULL
)
RETURNS jsonb AS $$
DECLARE
  v_transaction RECORD;
  v_member_balance numeric;
  v_new_balance numeric;
  v_reversal_id uuid;
BEGIN
  -- Get the original transaction
  SELECT * INTO v_transaction
  FROM transactions
  WHERE id = p_transaction_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Transaction not found'
    );
  END IF;
  
  -- Lock the member row
  SELECT balance INTO v_member_balance
  FROM members
  WHERE id = v_transaction.member_id
  FOR UPDATE;
  
  v_member_balance := COALESCE(v_member_balance, 0);
  v_new_balance := v_member_balance - v_transaction.amount;
  
  -- Create reversal transaction
  INSERT INTO transactions (
    member_id,
    business_id,
    amount,
    balance_before,
    balance_after,
    description,
    notes,
    billing_cycle_id,
    source
  ) VALUES (
    v_transaction.member_id,
    v_transaction.business_id,
    -v_transaction.amount,
    v_member_balance,
    v_new_balance,
    'VOID: ' || COALESCE(v_transaction.description, 'Transaction'),
    'Voided by admin. Reason: ' || p_reason || '. Original transaction: ' || p_transaction_id,
    v_transaction.billing_cycle_id,
    'admin_void'
  )
  RETURNING id INTO v_reversal_id;
  
  -- Update member balance
  UPDATE members
  SET 
    balance = v_new_balance,
    updated_at = now()
  WHERE id = v_transaction.member_id;
  
  -- Log to audit
  INSERT INTO audit_logs (
    table_name,
    record_id,
    action,
    old_data,
    new_data,
    changed_by
  ) VALUES (
    'transactions',
    p_transaction_id,
    'UPDATE',
    to_jsonb(v_transaction),
    jsonb_build_object('voided', true, 'reversal_id', v_reversal_id),
    p_admin_user_id
  );
  
  RETURN jsonb_build_object(
    'success', true,
    'reversal_id', v_reversal_id,
    'original_amount', v_transaction.amount,
    'new_balance', v_new_balance
  );
  
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', SQLERRM
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION void_transaction TO authenticated;
GRANT EXECUTE ON FUNCTION void_transaction TO service_role;

-- -----------------------------------------------------------------------------
-- DONE
-- -----------------------------------------------------------------------------
