-- Add pin_confirmed column to members table
-- This tracks whether a member has seen and confirmed their PIN

ALTER TABLE members 
ADD COLUMN IF NOT EXISTS pin_confirmed BOOLEAN DEFAULT false;

-- Set existing members with PINs to unconfirmed (they need to see the confirmation screen)
UPDATE members 
SET pin_confirmed = false 
WHERE pin_code IS NOT NULL AND pin_code != '';

-- Set members without PINs to confirmed (they don't need to see it)
UPDATE members 
SET pin_confirmed = true 
WHERE pin_code IS NULL OR pin_code = '';

COMMENT ON COLUMN members.pin_confirmed IS 'Whether the member has seen and confirmed their PIN in the kiosk';
