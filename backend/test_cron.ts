import { stravaCronService } from './src/services/stravaCronService';

console.log('🧪 Testing Strava Cron Service...\n');

// Manually trigger sync
stravaCronService.triggerManualSync()
  .then(() => {
    console.log('\n✅ Manual sync complete');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Error:', err);
    process.exit(1);
  });
