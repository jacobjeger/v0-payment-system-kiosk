-- Create kiosk_settings table for global settings
CREATE TABLE IF NOT EXISTS kiosk_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default preset amounts
INSERT INTO kiosk_settings (key, value) 
VALUES ('preset_amounts', '[5, 10, 15, 20, 25, 50]'::jsonb)
ON CONFLICT (key) DO NOTHING;

-- Add business-specific preset amounts column
ALTER TABLE businesses ADD COLUMN IF NOT EXISTS preset_amounts JSONB;

-- Create email_templates table
CREATE TABLE IF NOT EXISTS email_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_key TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  subject TEXT NOT NULL,
  body_html TEXT NOT NULL,
  description TEXT,
  variables TEXT[] DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default email templates
INSERT INTO email_templates (template_key, name, subject, body_html, description, variables) VALUES
('business_welcome', 'Business Welcome', 'Welcome - Set Up Your Password', 
'<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #6366f1;">Welcome!</h1>
  <p>Hello <strong>{{name}}</strong>,</p>
  <p>Your business account has been created. Click below to set up your password:</p>
  <p style="text-align: center; margin: 30px 0;">
    <a href="{{reset_link}}" style="background: #6366f1; color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px;">Set Up Password</a>
  </p>
</div>',
'Sent when a new business account is created', 
ARRAY['name', 'email', 'reset_link']),

('member_welcome', 'Member Welcome', 'Welcome - Set Up Your Password',
'<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #10b981;">Welcome!</h1>
  <p>Hello <strong>{{name}}</strong>,</p>
  <p>Your member account has been created. Click below to set up your password:</p>
  <p style="text-align: center; margin: 30px 0;">
    <a href="{{reset_link}}" style="background: #10b981; color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px;">Set Up Password</a>
  </p>
</div>',
'Sent when a new member account is created',
ARRAY['name', 'email', 'reset_link']),

('temp_password', 'Temporary Password', 'Your Temporary Password',
'<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #f97316;">Temporary Password</h1>
  <p>Hello <strong>{{name}}</strong>,</p>
  <p>A temporary password has been created for your account:</p>
  <div style="background: #1f2937; color: white; padding: 20px; border-radius: 8px; text-align: center; margin: 20px 0;">
    <code style="font-size: 24px; letter-spacing: 4px;">{{temp_password}}</code>
  </div>
  <p style="color: #f97316;"><strong>You will be prompted to change this password on first login.</strong></p>
  <p style="text-align: center;">
    <a href="{{login_link}}" style="background: #f97316; color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px;">Log In Now</a>
  </p>
</div>',
'Sent when a temporary password is generated',
ARRAY['name', 'email', 'temp_password', 'login_link']),

('magic_link', 'Magic Login Link', 'Your Login Link',
'<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #3b82f6;">Login Link</h1>
  <p>Click below to log in - no password needed:</p>
  <p style="text-align: center; margin: 30px 0;">
    <a href="{{login_link}}" style="background: #3b82f6; color: white; padding: 14px 30px; text-decoration: none; border-radius: 8px;">Log In</a>
  </p>
  <p style="font-size: 12px; color: #9ca3af;">This link expires in 1 hour.</p>
</div>',
'Sent when a magic login link is requested',
ARRAY['email', 'login_link']),

('invoice', 'Invoice', 'Your Invoice - {{billing_period}}',
'<div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
  <h1 style="color: #f59e0b;">Invoice</h1>
  <p>Hello <strong>{{name}}</strong>,</p>
  <p>Your invoice for <strong>{{billing_period}}</strong>:</p>
  <div style="background: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb;">
    <p style="font-size: 14px; color: #6b7280; margin: 0;">Total Amount Due:</p>
    <p style="font-size: 32px; font-weight: bold; margin: 5px 0;">{{currency}}{{total_amount}}</p>
  </div>
  <p>{{custom_message}}</p>
</div>',
'Invoice sent to members',
ARRAY['name', 'email', 'billing_period', 'total_amount', 'currency', 'custom_message'])

ON CONFLICT (template_key) DO NOTHING;

-- Add email settings
INSERT INTO kiosk_settings (key, value) 
VALUES ('email_settings', '{"from_name": "Payment Kiosk", "currency": "₪"}'::jsonb)
ON CONFLICT (key) DO NOTHING;
