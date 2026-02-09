-- Add active_days_average setting to businesses table
ALTER TABLE businesses
ADD COLUMN IF NOT EXISTS active_days_average BOOLEAN DEFAULT false;

-- Add comment explaining the field
COMMENT ON COLUMN businesses.active_days_average IS 'When true, daily averages are calculated using only days with transactions instead of all calendar days';
