import { createAdminClient } from '@/lib/supabase/server';

async function createMorningKollelTable() {
  const supabase = createAdminClient();

  // Check if table exists by trying to query it
  const { error: checkError } = await supabase
    .from('morning_kollel_logs')
    .select('id')
    .limit(1);

  // If table doesn't exist, the error will indicate that
  if (checkError?.code === 'PGRST116') {
    console.log('[v0] Creating morning_kollel_logs table...');

    // Create the table using raw SQL
    const { error: createError } = await supabase.rpc('exec_sql', {
      sql: `
        CREATE TABLE IF NOT EXISTS morning_kollel_logs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          count INTEGER NOT NULL DEFAULT 1,
          logged_date DATE NOT NULL DEFAULT CURRENT_DATE,
          logged_at TIMESTAMP NOT NULL DEFAULT NOW(),
          notes TEXT,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMP NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_morning_kollel_logs_logged_date ON morning_kollel_logs(logged_date);
        CREATE INDEX IF NOT EXISTS idx_morning_kollel_logs_logged_at ON morning_kollel_logs(logged_at);
      `
    });

    if (createError) {
      console.error('[v0] Error creating table:', createError);
    } else {
      console.log('[v0] Morning Kollel table created successfully');
    }
  } else {
    console.log('[v0] Morning Kollel table already exists');
  }
}

createMorningKollelTable().catch(console.error);
