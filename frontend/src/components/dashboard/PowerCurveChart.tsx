import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { metricsService } from '../../services/metricsService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

export function PowerCurveChart() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const metrics = await metricsService.getMetrics('all'); // Get all-time PRs
        const prs = metrics.power_prs;

        // Format for chart - show multiple durations
        // Estimate intermediate values for smoother curve
        const chartData = [
          { duration: '5s', seconds: 5, power: prs.power_5sec || 0 },
          { duration: '15s', seconds: 15, power: Math.round((prs.power_5sec * 0.95) || prs.power_5sec || 0) },
          { duration: '30s', seconds: 30, power: Math.round((prs.power_5sec * 0.90) || prs.power_1min || 0) },
          { duration: '1m', seconds: 60, power: prs.power_1min || 0 },
          { duration: '5m', seconds: 300, power: prs.power_5min || 0 },
          { duration: '20m', seconds: 1200, power: prs.power_20min || 0 },
        ];

        setData(chartData);
      } catch (err) {
        console.error('Failed to load power records:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  if (loading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Power Curve</CardTitle>
          <CardDescription className="text-xs">Peak power across durations</CardDescription>
        </CardHeader>
        <CardContent className="pb-4">
          <div className="h-[180px] flex items-center justify-center text-muted-foreground text-xs">
            Loading...
          </div>
        </CardContent>
      </Card>
    );
  }

  const maxPower = Math.max(...data.map(d => d.power));

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg">Power Curve</CardTitle>
        <CardDescription className="text-xs">Peak power across durations</CardDescription>
      </CardHeader>
      <CardContent className="pb-4">
        <ResponsiveContainer width="100%" height={180}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis 
              dataKey="duration" 
              stroke="#64748b" 
              fontSize={10}
              tick={{ fontSize: 10 }}
            />
            <YAxis 
              stroke="#22c55e" 
              fontSize={10}
              tick={{ fontSize: 10 }}
              domain={[0, maxPower * 1.1]}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'white',
                border: '1px solid #e5e7eb',
                borderRadius: '8px',
                fontSize: '11px',
              }}
              formatter={(value: any) => [`${value}W`, 'Power']}
            />
            <Line
              type="monotone"
              dataKey="power"
              stroke="#22c55e"
              strokeWidth={3}
              dot={{ fill: '#22c55e', r: 3 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
