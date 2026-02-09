-- Add RLS policies for trusted_devices table
ALTER TABLE trusted_devices ENABLE ROW LEVEL SECURITY;

-- Allow admins to view their own trusted devices
CREATE POLICY "Admins can view their own trusted devices"
ON trusted_devices
FOR SELECT
USING (
  admin_user_id IN (
    SELECT id FROM admin_users WHERE email = auth.email()
  )
);

-- Allow admins to insert their own trusted devices
CREATE POLICY "Admins can insert their own trusted devices"
ON trusted_devices
FOR INSERT
WITH CHECK (
  admin_user_id IN (
    SELECT id FROM admin_users WHERE email = auth.email()
  )
);

-- Allow admins to delete their own trusted devices
CREATE POLICY "Admins can delete their own trusted devices"
ON trusted_devices
FOR DELETE
USING (
  admin_user_id IN (
    SELECT id FROM admin_users WHERE email = auth.email()
  )
);
