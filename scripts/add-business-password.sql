-- Add password_hash column to businesses table for username-only login
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS password_hash TEXT;
