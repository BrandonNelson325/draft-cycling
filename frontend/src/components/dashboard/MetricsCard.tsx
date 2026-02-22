import { useEffect, useState } from 'react';
import { useAuthStore } from '../../stores/useAuthStore';
import { metricsService, type MetricsData } from '../../services/metricsService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';
import { getConversionUtils } from '../../utils/units';

type TimePeriod = 'week' | 'month' | 'year' | 'all';

export function MetricsCard() {
  const user = useAuthStore((state) => state.user);
  const units = getConversionUtils(user);
  const [period, setPeriod] = useState<TimePeriod>('week');
  const [metrics, setMetrics] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMetrics = async () => {
      try {
        setLoading(true);
        const data = await metricsService.getMetrics(period);
        setMetrics(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load metrics');
      } finally {
        setLoading(false);
      }
    };

    fetchMetrics();
  }, [period]);

  const formatDuration = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    if (hours > 0) {
      return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
  };

  const getPeriodLabel = () => {
    switch (period) {
      case 'week':
        return 'Last 7 Days';
      case 'month':
        return 'Last 30 Days';
      case 'year':
        return 'Last 365 Days';
      case 'all':
        return 'All Time';
    }
  };

  if (loading) {
    return (
      <Card className="md:col-span-2 lg:col-span-3">
        <CardHeader>
          <CardTitle>Training Metrics</CardTitle>
          <CardDescription>Your cycling statistics and achievements</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading metrics...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="md:col-span-2 lg:col-span-3">
        <CardHeader>
          <CardTitle>Training Metrics</CardTitle>
          <CardDescription>Your cycling statistics and achievements</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-500">{error}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {/* Header with Period Selector */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-xl font-bold">Training Metrics</h2>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary"></span>
            <span className="text-xs text-muted-foreground">{getPeriodLabel()}</span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button
            variant={period === 'week' ? 'default' : 'outline'}
            onClick={() => setPeriod('week')}
            size="sm"
            className="rounded-lg"
          >
            Week
          </Button>
          <Button
            variant={period === 'month' ? 'default' : 'outline'}
            onClick={() => setPeriod('month')}
            size="sm"
            className="rounded-lg"
          >
            Month
          </Button>
          <Button
            variant={period === 'year' ? 'default' : 'outline'}
            onClick={() => setPeriod('year')}
            size="sm"
            className="rounded-lg"
          >
            Year
          </Button>
          <Button
            variant={period === 'all' ? 'default' : 'outline'}
            onClick={() => setPeriod('all')}
            size="sm"
            className="rounded-lg"
          >
            All Time
          </Button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid gap-3 grid-cols-3">
        {/* Total Distance */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Distance</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold text-foreground">
              {units.formatDistance(metrics?.total_distance_meters || 0)}
            </div>
            <p className="text-xs text-muted-foreground">{units.distanceUnit}</p>
          </CardContent>
        </Card>

        {/* Total Time */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Time</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold text-foreground">
              {formatDuration(metrics?.total_time_seconds || 0)}
            </div>
            <p className="text-xs text-muted-foreground">riding time</p>
          </CardContent>
        </Card>

        {/* Total Elevation */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Elevation</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold text-foreground">
              {units.formatElevation(metrics?.total_elevation_meters || 0)}
            </div>
            <p className="text-xs text-muted-foreground">{units.elevationUnit}</p>
          </CardContent>
        </Card>

        {/* Total Rides */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Total Rides</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold text-foreground">
              {metrics?.ride_count || 0}
            </div>
            <p className="text-xs text-muted-foreground">activities</p>
          </CardContent>
        </Card>

        {/* Avg Distance */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Avg Distance</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold text-foreground">
              {units.formatDistance(metrics?.avg_distance_meters || 0)}
            </div>
            <p className="text-xs text-muted-foreground">{units.distanceUnitShort}/ride</p>
          </CardContent>
        </Card>

        {/* Avg Time */}
        <Card>
          <CardHeader className="pb-2 pt-4 px-4">
            <CardTitle className="text-xs font-medium text-muted-foreground">Avg Time</CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="text-2xl font-bold text-foreground">
              {formatDuration(metrics?.avg_time_seconds || 0)}
            </div>
            <p className="text-xs text-muted-foreground">per ride</p>
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
