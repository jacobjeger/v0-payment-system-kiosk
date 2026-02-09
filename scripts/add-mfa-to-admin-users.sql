-- Add MFA fields to admin_users table
ALTER TABLE admin_users
ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS mfa_code VARCHAR(6),
ADD COLUMN IF NOT EXISTS mfa_code_expires_at TIMESTAMP,
ADD COLUMN IF NOT EXISTS mfa_verified_at TIMESTAMP;

COMMENT ON COLUMN admin_users.mfa_enabled IS 'Whether MFA is enabled for this admin';
COMMENT ON COLUMN admin_users.mfa_code IS 'Current MFA verification code';
COMMENT ON COLUMN admin_users.mfa_code_expires_at IS 'When the MFA code expires';
COMMENT ON COLUMN admin_users.mfa_verified_at IS 'Last time MFA was verified for current session';
