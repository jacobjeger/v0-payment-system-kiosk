-- Create morning_kollel_logs table
CREATE TABLE IF NOT EXISTS morning_kollel_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  count INTEGER NOT NULL DEFAULT 1,
  logged_date DATE NOT NULL DEFAULT CURRENT_DATE,
  logged_at TIMESTAMP NOT NULL DEFAULT NOW(),
  notes TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW()
);

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_morning_kollel_logs_logged_date ON morning_kollel_logs(logged_date);
CREATE INDEX IF NOT EXISTS idx_morning_kollel_logs_logged_at ON morning_kollel_logs(logged_at);
