import { useEffect, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { metricsService } from '../../services/metricsService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

export function PowerCurveChart() {
  const [data, setData] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<'8weeks' | 'all'>('all');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const metrics = await metricsService.getMetrics(period);
        const prs = metrics.power_prs;

        // Format for chart - show multiple durations
        // Estimate intermediate values for smoother curve
        const p5s = prs.power_5sec || 0;
        const chartData = [
          { duration: '5s',  seconds: 5,    power: p5s },
          { duration: '15s', seconds: 15,   power: Math.round(p5s * 0.95) },
          { duration: '30s', seconds: 30,   power: Math.round(p5s * 0.90) },
          { duration: '1m',  seconds: 60,   power: prs.power_1min  || 0 },
          { duration: '3m',  seconds: 180,  power: prs.power_3min  || 0 },
          { duration: '5m',  seconds: 300,  power: prs.power_5min  || 0 },
          { duration: '10m', seconds: 600,  power: prs.power_10min || 0 },
          { duration: '20m', seconds: 1200, power: prs.power_20min || 0 },
        ].filter(d => d.power > 0);

        setData(chartData);
      } catch (err) {
        console.error('Failed to load power records:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [period]);

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
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">Power Curve</CardTitle>
            <CardDescription className="text-xs">Peak power across durations</CardDescription>
          </div>
          <div className="flex gap-1 bg-muted rounded-lg p-0.5">
            <button
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                period === '8weeks'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setPeriod('8weeks')}
            >
              8 Weeks
            </button>
            <button
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                period === 'all'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setPeriod('all')}
            >
              All Time
            </button>
          </div>
        </div>
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
