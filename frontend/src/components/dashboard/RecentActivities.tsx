import { useEffect, useState } from 'react';
import { useAuthStore } from '../../stores/useAuthStore';
import { stravaService } from '../../services/stravaService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { getConversionUtils } from '../../utils/units';

interface Activity {
  id: number;
  name: string;
  type: string;
  start_date: string;
  distance: number;
  moving_time: number;
  total_elevation_gain: number;
  average_watts?: number;
  tss?: number;
}

export function RecentActivities() {
  const user = useAuthStore((state) => state.user);
  const units = getConversionUtils(user);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchActivities = async () => {
      try {
        const data = await stravaService.getActivities() as any;
        // Get last 5 activities
        setActivities(data?.activities?.slice(0, 5) || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load activities');
      } finally {
        setLoading(false);
      }
    };

    fetchActivities();
  }, []);

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const formatDuration = (seconds?: number) => {
    if (seconds == null) return '0m';
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    return hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Activities</CardTitle>
          <CardDescription>Your latest rides from Strava</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading activities...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Activities</CardTitle>
          <CardDescription>Your latest rides from Strava</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-500">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (activities.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Recent Activities</CardTitle>
          <CardDescription>Your latest rides from Strava</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No activities found. Connect Strava to sync your rides.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Activities</CardTitle>
        <CardDescription>Your latest rides from Strava</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          {activities.map((activity) => (
            <div
              key={activity.id}
              className="border-b border-border last:border-0 pb-3 last:pb-0"
            >
              <div className="flex justify-between items-start mb-1">
                <h4 className="font-medium text-sm">{activity.name}</h4>
                <span className="text-xs text-muted-foreground">
                  {formatDate(activity.start_date)}
                </span>
              </div>
              <div className="flex gap-4 text-xs text-muted-foreground">
                <span>{units.formatDistance(activity.distance)} {units.distanceUnitShort}</span>
                <span>{formatDuration(activity.moving_time)}</span>
                {activity.average_watts && <span>{activity.average_watts}W</span>}
                {activity.tss && <span>TSS: {activity.tss}</span>}
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
