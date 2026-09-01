import { useEffect, useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts';
import { chartsService, type FitnessData } from '../../services/chartsService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

// Colors MUST match the mobile chart + legend + summary exactly.
const FITNESS_COLOR = '#3b82f6'; // blue
const FATIGUE_COLOR = '#f59e0b'; // amber
const FORM_COLOR = '#a78bfa';    // violet

const RANGES: { label: string; days: number }[] = [
  { label: '6W', days: 42 },
  { label: '3M', days: 90 },
  { label: '6M', days: 182 },
  { label: '1Y', days: 365 },
];

function formatLabel(dateStr: string): string {
  // Parse as local noon to avoid UTC off-by-one.
  const d = new Date(`${dateStr}T12:00:00`);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function FitnessTrendChart() {
  const [data, setData] = useState<FitnessData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(42);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    chartsService.getFitnessTimeSeries(days)
      .then((d) => { if (!cancelled) setData(d); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load chart data'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [days]);

  const RangeFilter = (
    <div className="flex gap-1.5">
      {RANGES.map((r) => (
        <button
          key={r.label}
          onClick={() => setDays(r.days)}
          className={`px-2.5 py-1 rounded-full text-xs font-semibold transition-colors ${
            days === r.days
              ? 'bg-blue-100 text-blue-700 border border-blue-300'
              : 'bg-transparent text-gray-400 border border-gray-200 hover:text-gray-600'
          }`}
        >
          {r.label}
        </button>
      ))}
    </div>
  );

  const Header = (
    <CardHeader className="pb-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <CardTitle className="text-lg">Fitness &amp; Fatigue</CardTitle>
          <CardDescription className="text-xs">Fitness, fatigue &amp; form over time</CardDescription>
        </div>
        {RangeFilter}
      </div>
    </CardHeader>
  );

  if (loading) {
    return (
      <Card>
        {Header}
        <CardContent className="pb-4">
          <div className="h-56 flex items-center justify-center text-muted-foreground">Loading chart...</div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        {Header}
        <CardContent className="pb-4">
          <div className="h-56 flex items-center justify-center text-red-500">{error}</div>
        </CardContent>
      </Card>
    );
  }

  if (data.length < 2) {
    return (
      <Card>
        {Header}
        <CardContent className="pb-4">
          <div className="h-56 flex items-center justify-center text-muted-foreground text-sm text-center px-6">
            Not enough training history yet — keep riding and this fills in.
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((d) => ({
    label: formatLabel(d.date),
    fitness: Math.round(d.ctl),
    fatigue: Math.round(d.atl),
    form: Math.round(d.tsb),
  }));

  return (
    <Card>
      {Header}
      <CardContent className="pb-4">
        <ResponsiveContainer width="100%" height={240}>
          <LineChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis dataKey="label" stroke="#64748b" fontSize={11} minTickGap={28} />
            {/* Left axis: Fitness + Fatigue (shared, comparable units) */}
            <YAxis yAxisId="left" stroke="#64748b" fontSize={11} width={32} />
            {/* Right axis: Form on its own scale so it interweaves (Strava-style) */}
            <YAxis yAxisId="right" orientation="right" stroke={FORM_COLOR} fontSize={11} width={32} />
            <Tooltip
              contentStyle={{ backgroundColor: 'white', border: '1px solid #e5e7eb', borderRadius: '8px', fontSize: '12px' }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            {/* Form's fresh/fatigued crossover, on Form's own (right) scale */}
            <ReferenceLine yAxisId="right" y={0} stroke={FORM_COLOR} strokeOpacity={0.35} strokeDasharray="4 4" />
            <Line yAxisId="right" type="monotone" dataKey="form" stroke={FORM_COLOR} strokeWidth={2} dot={false} name="Form" />
            <Line yAxisId="left" type="monotone" dataKey="fatigue" stroke={FATIGUE_COLOR} strokeWidth={2} dot={false} name="Fatigue" />
            <Line yAxisId="left" type="monotone" dataKey="fitness" stroke={FITNESS_COLOR} strokeWidth={2} dot={false} name="Fitness" />
          </LineChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
