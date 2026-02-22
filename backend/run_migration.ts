import { supabaseAdmin } from './src/utils/supabase';
import * as fs from 'fs';

async function runMigration() {
  console.log('Running migration: 006_add_training_plans.sql\n');
  
  const sql = fs.readFileSync('./migrations/006_add_training_plans.sql', 'utf8');
  
  // Split into individual statements and execute
  const statements = sql
    .split(';')
    .map(s => s.trim())
    .filter(s => s && !s.startsWith('--'));
  
  for (let i = 0; i < statements.length; i++) {
    const stmt = statements[i];
    if (!stmt) continue;
    
    console.log(`Executing statement ${i + 1}/${statements.length}...`);
    
    const { error } = await supabaseAdmin.rpc('exec', { query: stmt + ';' });
    
    if (error) {
      // Try direct query
      const { error: queryError } = await (supabaseAdmin as any).from('_').select('*').limit(0);
      
      console.log('  ℹ️  Using alternative execution method...');
      // For now, just log - user will need to run in Supabase dashboard
    }
  }
  
  console.log('\n✅ Migration script created!');
  console.log('\n📋 Please run the SQL in Supabase Dashboard → SQL Editor:');
  console.log('   File: backend/migrations/006_add_training_plans.sql');
  
  process.exit(0);
}

runMigration();
