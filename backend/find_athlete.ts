import { supabaseAdmin } from './src/utils/supabase';

async function findAthlete() {
  const { data, error } = await supabaseAdmin
    .from('athletes')
    .select('id, full_name, email, ftp')
    .limit(5);

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  console.log('Athletes in database:');
  data?.forEach(a => {
    console.log(`  - ${a.full_name || a.email} (ID: ${a.id}, FTP: ${a.ftp || 'NOT SET'})`);
  });
  
  process.exit(0);
}

findAthlete();
