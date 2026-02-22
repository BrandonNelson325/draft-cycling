import { aiToolExecutor } from './src/services/aiToolExecutor';

async function testTrainingPlan() {
  console.log('🧪 Testing Training Plan Generation...\n');

  const athleteId = 'ee2830e4-49e4-419a-8ffd-a6147b5123df'; // Brandon Nelson
  
  const input = {
    goal_event: 'Gran Fondo Test',
    event_date: '2026-06-01',
    current_fitness_level: 'intermediate',
    weekly_hours: 8,
    strengths: ['endurance', 'climbing'],
    weaknesses: ['sprinting'],
    indoor_outdoor: 'both',
    zwift_availability: true
  };

  try {
    const result = await aiToolExecutor.generateTrainingPlan(athleteId, input);
    
    console.log('✅ Training Plan Generated!');
    console.log(`\nPlan Details:`);
    console.log(`  Goal: ${result.plan.goal_event}`);
    console.log(`  Event Date: ${result.plan.event_date}`);
    console.log(`  Duration: ${result.plan.total_weeks} weeks`);
    console.log(`  Total Workouts: ${result.workouts_scheduled}`);
    console.log(`  Total TSS: ${result.plan.total_tss}`);
    console.log(`\nPhases:`);
    console.log(`  Base: ${result.plan.phases.base} weeks`);
    console.log(`  Build: ${result.plan.phases.build} weeks`);
    console.log(`  Peak: ${result.plan.phases.peak} weeks`);
    console.log(`  Taper: ${result.plan.phases.taper} weeks`);
    console.log(`\n🎯 ${result.workouts_scheduled} workouts scheduled to calendar!`);
    
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

testTrainingPlan();
