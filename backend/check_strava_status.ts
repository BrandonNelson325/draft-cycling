import { supabaseAdmin } from './src/utils/supabase';

async function checkStatus() {
  // Check athletes with Strava connected
  const { data: athletes, error: athleteError } = await supabaseAdmin
    .from('athletes')
    .select('id, full_name, email, strava_athlete_id, strava_token_expires_at')
    .not('strava_athlete_id', 'is', null);

  console.log('\n📊 Strava Connection Status:');
  console.log('================================');
  
  if (athleteError) {
    console.error('Error:', athleteError);
    return;
  }

  if (!athletes || athletes.length === 0) {
    console.log('❌ No athletes with Strava connected');
    return;
  }

  console.log(`✅ ${athletes.length} athlete(s) with Strava connected:\n`);
  
  for (const athlete of athletes) {
    console.log(`  • ${athlete.full_name || athlete.email}`);
    console.log(`    - Strava ID: ${athlete.strava_athlete_id}`);
    console.log(`    - Token expires: ${athlete.strava_token_expires_at}`);
    
    // Check recent activities
    const { data: activities } = await supabaseAdmin
      .from('strava_activities')
      .select('id, name, start_date')
      .eq('athlete_id', athlete.id)
      .order('start_date', { ascending: false })
      .limit(3);
    
    if (activities && activities.length > 0) {
      console.log(`    - Most recent activity: ${activities[0].name} (${activities[0].start_date})`);
      console.log(`    - Total recent activities: ${activities.length}`);
    } else {
      console.log(`    - No activities found`);
    }
    console.log('');
  }
  
  process.exit(0);
}

checkStatus();
