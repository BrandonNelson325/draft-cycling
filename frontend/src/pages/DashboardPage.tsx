import { RecentActivities } from '../components/dashboard/RecentActivities';
import { FTPEstimateCard } from '../components/dashboard/FTPEstimateCard';
import { MetricsCard } from '../components/dashboard/MetricsCard';
import { WeeklyVolumeChart } from '../components/dashboard/WeeklyVolumeChart';
import { PowerCurveChart } from '../components/dashboard/PowerCurveChart';
import { CoachCard } from '../components/dashboard/CoachCard';
import { FitnessTrendChart } from '../components/dashboard/FitnessTrendChart';
import { WhoopRecoveryCard } from '../components/dashboard/WhoopRecoveryCard';
import { OtherTrainingCard } from '../components/dashboard/OtherTrainingCard';

export function DashboardPage() {

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4">
      {/* Coach Card: gauge + AI summary + workout + wellness + chat */}
      <div className="grid gap-4 md:grid-cols-2">
        <CoachCard />
        <MetricsCard />
      </div>

      {/* WHOOP recovery — renders only for Whoop users */}
      <WhoopRecoveryCard />

      {/* Fitness & Fatigue trend — full width */}
      <FitnessTrendChart />

      {/* Second Row: Weekly Volume + Power Curve */}
      <div className="grid gap-4 md:grid-cols-2">
        <WeeklyVolumeChart />
        <PowerCurveChart />
      </div>

      {/* Bottom Row */}
      <div className="grid gap-4 md:grid-cols-2">
        <FTPEstimateCard />
        <RecentActivities />
      </div>

      {/* Non-cycling training — renders only when there is some */}
      <OtherTrainingCard />
    </div>
  );
}
