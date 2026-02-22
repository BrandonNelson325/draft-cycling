import { useEffect, useState } from 'react';
import { useAuthStore } from '../stores/useAuthStore';
import { metricsService, type MetricsData } from '../services/metricsService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { getConversionUtils } from '../utils/units';

type TimePeriod = 'week' | 'month' | 'year' | 'all';

export function MetricsPage() {
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
      <div className="container mx-auto p-4 md:p-8">
        <p className="text-muted-foreground">Loading metrics...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-4 md:p-8">
        <p className="text-red-500">{error}</p>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">Training Metrics</h1>
        <p className="text-muted-foreground">Your cycling statistics and achievements</p>
      </div>

      {/* Period Selector */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <Button
          variant={period === 'week' ? 'default' : 'outline'}
          onClick={() => setPeriod('week')}
          size="sm"
        >
          Week
        </Button>
        <Button
          variant={period === 'month' ? 'default' : 'outline'}
          onClick={() => setPeriod('month')}
          size="sm"
        >
          Month
        </Button>
        <Button
          variant={period === 'year' ? 'default' : 'outline'}
          onClick={() => setPeriod('year')}
          size="sm"
        >
          Year
        </Button>
        <Button
          variant={period === 'all' ? 'default' : 'outline'}
          onClick={() => setPeriod('all')}
          size="sm"
        >
          All Time
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {/* Total Distance */}
        <Card>
          <CardHeader>
            <CardTitle>Total Distance</CardTitle>
            <CardDescription>{getPeriodLabel()}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-primary mb-2">
              {units.formatDistance(metrics?.total_distance_meters || 0)}
            </div>
            <p className="text-sm text-muted-foreground">{units.distanceUnit}</p>
          </CardContent>
        </Card>

        {/* Total Time */}
        <Card>
          <CardHeader>
            <CardTitle>Total Time</CardTitle>
            <CardDescription>{getPeriodLabel()}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-primary mb-2">
              {formatDuration(metrics?.total_time_seconds || 0)}
            </div>
            <p className="text-sm text-muted-foreground">riding time</p>
          </CardContent>
        </Card>

        {/* Total Elevation */}
        <Card>
          <CardHeader>
            <CardTitle>Total Elevation</CardTitle>
            <CardDescription>{getPeriodLabel()}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-primary mb-2">
              {units.formatElevation(metrics?.total_elevation_meters || 0)}
            </div>
            <p className="text-sm text-muted-foreground">{units.elevationUnit}</p>
          </CardContent>
        </Card>

        {/* Ride Count */}
        <Card>
          <CardHeader>
            <CardTitle>Total Rides</CardTitle>
            <CardDescription>{getPeriodLabel()}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-primary mb-2">
              {metrics?.ride_count || 0}
            </div>
            <p className="text-sm text-muted-foreground">activities</p>
          </CardContent>
        </Card>

        {/* Average Distance */}
        <Card>
          <CardHeader>
            <CardTitle>Avg Distance</CardTitle>
            <CardDescription>Per ride</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-primary mb-2">
              {units.formatDistance(metrics?.avg_distance_meters || 0)}
            </div>
            <p className="text-sm text-muted-foreground">{units.distanceUnitShort}/ride</p>
          </CardContent>
        </Card>

        {/* Average Time */}
        <Card>
          <CardHeader>
            <CardTitle>Avg Time</CardTitle>
            <CardDescription>Per ride</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-primary mb-2">
              {formatDuration(metrics?.avg_time_seconds || 0)}
            </div>
            <p className="text-sm text-muted-foreground">per ride</p>
          </CardContent>
        </Card>

        {/* Total TSS */}
        <Card>
          <CardHeader>
            <CardTitle>Total TSS</CardTitle>
            <CardDescription>Training Stress Score</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-primary mb-2">
              {metrics?.total_tss?.toFixed(0) || 0}
            </div>
            <p className="text-sm text-muted-foreground">stress points</p>
          </CardContent>
        </Card>

        {/* Power PRs */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle>Power PRs</CardTitle>
            <CardDescription>Best power outputs in {getPeriodLabel().toLowerCase()}</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-2xl font-bold text-primary">
                  {metrics?.power_prs.power_5sec || 0}W
                </div>
                <p className="text-xs text-muted-foreground">5 seconds</p>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  {metrics?.power_prs.power_1min || 0}W
                </div>
                <p className="text-xs text-muted-foreground">1 minute</p>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  {metrics?.power_prs.power_5min || 0}W
                </div>
                <p className="text-xs text-muted-foreground">5 minutes</p>
              </div>
              <div>
                <div className="text-2xl font-bold text-primary">
                  {metrics?.power_prs.power_20min || 0}W
                </div>
                <p className="text-xs text-muted-foreground">20 minutes</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
