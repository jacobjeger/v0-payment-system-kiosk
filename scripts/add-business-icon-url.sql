-- Add icon_url column to businesses table
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS icon_url TEXT;

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_businesses_icon_url ON businesses(icon_url);
