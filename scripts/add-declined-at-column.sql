-- Add declined_at column to members table
ALTER TABLE members ADD COLUMN declined_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create index for declined_at for faster queries
CREATE INDEX IF NOT EXISTS idx_members_declined_at ON members(declined_at);
