-- Add can_add_transactions field to businesses table
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS can_add_transactions BOOLEAN DEFAULT false;

-- Add comment explaining the field
COMMENT ON COLUMN businesses.can_add_transactions IS 'Allows service businesses to add their own transactions';
