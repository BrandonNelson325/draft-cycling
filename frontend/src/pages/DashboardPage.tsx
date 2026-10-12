import { RecentActivities } from '../components/dashboard/RecentActivities';
import { FTPEstimateCard } from '../components/dashboard/FTPEstimateCard';
import { MetricsCard } from '../components/dashboard/MetricsCard';
import { WeeklyVolumeChart } from '../components/dashboard/WeeklyVolumeChart';
import { PowerCurveChart } from '../components/dashboard/PowerCurveChart';
import { CoachCard } from '../components/dashboard/CoachCard';
import { FitnessTrendChart } from '../components/dashboard/FitnessTrendChart';
import { OtherTrainingCard } from '../components/dashboard/OtherTrainingCard';
import { useAuthStore } from '../stores/useAuthStore';

// Screen anchor: a time-of-day greeting + today's date (also anchors the card's Today/Tomorrow rows).
function DashboardGreeting() {
  const user = useAuthStore((st) => st.user);
  const now = new Date();
  const h = now.getHours();
  const part = h < 5 ? 'evening' : h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening';
  const first = user?.full_name?.trim().split(/\s+/)[0];
  return (
    <div className="pt-1">
      <h1 className="text-xl md:text-2xl font-bold tracking-tight">Good {part}{first ? `, ${first}` : ''}</h1>
      <p className="text-sm text-muted-foreground">{now.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</p>
    </div>
  );
}

export function DashboardPage() {

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-4">
      <DashboardGreeting />

      {/* Coach Card (left) | Fitness & Fatigue (right) — fitness matters more than weekly stats */}
      <div className="grid gap-4 md:grid-cols-2">
        <CoachCard />
        <FitnessTrendChart />
      </div>

      {/* Weekly stats — full width */}
      <MetricsCard />

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
