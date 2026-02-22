import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { chartsService, type WeeklyData } from '../../services/chartsService';
import { useAuthStore } from '../../stores/useAuthStore';
import { getConversionUtils } from '../../utils/units';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

export function WeeklyVolumeChart() {
  const user = useAuthStore((state) => state.user);
  const units = getConversionUtils(user);
  const [data, setData] = useState<WeeklyData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const weeklyData = await chartsService.getWeeklyData(6);
        setData(weeklyData);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load chart data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Weekly Volume</CardTitle>
          <CardDescription>Distance over the last 6 weeks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            Loading chart...
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Weekly Volume</CardTitle>
          <CardDescription>Distance over the last 6 weeks</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64 flex items-center justify-center text-red-500">
            {error}
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((week) => ({
    week: new Date(week.week_start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    distance: parseFloat(units.formatDistance(week.total_distance_meters)),
    tss: Math.round(week.total_tss),
  }));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Weekly Volume</CardTitle>
        <CardDescription className="text-xs">Distance and TSS over the last 6 weeks</CardDescription>
      </CardHeader>
      <CardContent className="pb-4">
        <ResponsiveContainer width="100%" height={220}>
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="week" stroke="#64748b" fontSize={12} />
            <YAxis yAxisId="left" stroke="#22c55e" fontSize={12} />
            <YAxis yAxisId="right" orientation="right" stroke="#3b82f6" fontSize={12} />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '12px',
              }}
            />
            <Legend />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="distance"
              stroke="#22c55e"
              strokeWidth={2}
              dot={{ fill: '#22c55e', r: 4 }}
              name={`Distance (${units.distanceUnitShort})`}
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="tss"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ fill: '#3b82f6', r: 4 }}
              name="TSS"
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
