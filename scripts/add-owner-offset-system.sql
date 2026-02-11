-- Add member_id to businesses table to track owner relationship
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS owner_member_id UUID REFERENCES members(id) ON DELETE SET NULL;

-- Create an offset_credits table to track balance offsets during payouts
CREATE TABLE IF NOT EXISTS offset_credits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES businesses(id) ON DELETE CASCADE,
  member_id UUID NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  billing_cycle_id UUID REFERENCES billing_cycles(id) ON DELETE SET NULL,
  offset_amount DECIMAL(10, 2) NOT NULL,
  member_balance_at_offset DECIMAL(10, 2) NOT NULL,
  notes TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  created_by_user_id UUID,
  UNIQUE(business_id, member_id, billing_cycle_id)
);

CREATE INDEX IF NOT EXISTS offset_credits_business_id ON offset_credits(business_id);
CREATE INDEX IF NOT EXISTS offset_credits_member_id ON offset_credits(member_id);
CREATE INDEX IF NOT EXISTS offset_credits_billing_cycle_id ON offset_credits(billing_cycle_id);
