import { supabaseAdmin } from './src/utils/supabase';

async function checkFTP() {
  const { data, error } = await supabaseAdmin
    .from('athletes')
    .select('id, full_name, ftp')
    .eq('id', '047b0a1e-d754-4c4d-ac45-8b5def75db19')
    .single();

  if (error) {
    console.error('Error:', error);
    process.exit(1);
  }

  console.log('Athlete:', data.full_name);
  console.log('FTP:', data.ftp || 'NOT SET');
  
  if (!data.ftp) {
    console.log('\n💡 Setting default FTP to 250W for testing...');
    const { error: updateError } = await supabaseAdmin
      .from('athletes')
      .update({ ftp: 250 })
      .eq('id', data.id);
    
    if (updateError) {
      console.error('Update error:', updateError);
    } else {
      console.log('✅ FTP set to 250W');
    }
  }
  
  process.exit(0);
}

checkFTP();
