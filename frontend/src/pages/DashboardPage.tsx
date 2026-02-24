import { RecentActivities } from '../components/dashboard/RecentActivities';
import { TrainingStatusCard } from '../components/dashboard/TrainingStatusCard';
import { FTPEstimateCard } from '../components/dashboard/FTPEstimateCard';
import { MetricsCard } from '../components/dashboard/MetricsCard';
import { WeeklyVolumeChart } from '../components/dashboard/WeeklyVolumeChart';
import { PowerCurveChart } from '../components/dashboard/PowerCurveChart';

export function DashboardPage() {

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4">
      {/* Top Row: Metrics + Training Status */}
      <div className="grid gap-4 md:grid-cols-2">
        <MetricsCard />
        <TrainingStatusCard />
      </div>

      {/* Second Row: Weekly Volume + Power Curve */}
      <div className="grid gap-4 md:grid-cols-2">
        <WeeklyVolumeChart />
        <PowerCurveChart />
      </div>

      {/* Bottom Row */}
      <div className="grid gap-4 md:grid-cols-2">
        {/* Recent Activities */}
        <RecentActivities />

        {/* FTP Estimate */}
        <FTPEstimateCard />
      </div>
    </div>
  );
}
