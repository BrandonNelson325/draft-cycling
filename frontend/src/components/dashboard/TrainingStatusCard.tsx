import { useEffect, useState } from 'react';
import { trainingService } from '../../services/trainingService';
import { healthDataService, type HealthData } from '../../services/healthDataService';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { FreshnessGauge } from './FreshnessGauge';
import { Moon, Activity, Heart, Battery, TrendingUp, AlertCircle } from 'lucide-react';
import { InfoTooltip } from '../ui/InfoTooltip';

interface TrainingStatus {
  ctl: number;
  atl: number;
  tsb: number;
  form_status: string;
  last_updated: string;
}

export function TrainingStatusCard() {
  const [status, setStatus] = useState<TrainingStatus | null>(null);
  const [healthData, setHealthData] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        // Fetch training status (required)
        const trainingData = await trainingService.getTrainingStatus();
        setStatus(trainingData || null);

        // Fetch health data (optional - don't let it break the card)
        try {
          const healthInfo = await healthDataService.getTodaysHealthData();
          setHealthData(healthInfo);
        } catch (healthErr) {
          // Health data is optional - just log the error
          console.warn('Failed to fetch health data:', healthErr);
          setHealthData(null);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load training status');
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
          <CardTitle>Training Status</CardTitle>
          <CardDescription>Your current fitness metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading status...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Training Status</CardTitle>
          <CardDescription>Your current fitness metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-500">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!status) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Training Status</CardTitle>
          <CardDescription>Your current fitness metrics</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No training data available yet. Sync activities to get started.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <CardTitle className="text-lg">Training Status</CardTitle>
          <InfoTooltip content={
            <div className="space-y-2.5">
              <p className="font-semibold text-foreground">Training Load Metrics</p>
              <div className="space-y-1.5">
                <p><span className="font-medium">TSB (Form / Freshness)</span> = CTL − ATL. Positive means rested and ready. Negative means carrying fatigue from recent training. The productive zone is roughly −10 to +5.</p>
                <p><span className="font-medium">CTL (Fitness)</span> — 42-day rolling average of daily training stress. Represents your long-term aerobic fitness base. Higher = more fit.</p>
                <p><span className="font-medium">ATL (Fatigue)</span> — 7-day rolling average of daily training stress. Represents short-term fatigue from recent training. Rises quickly with hard weeks, drops on rest days.</p>
              </div>
            </div>
          } />
        </div>
        <CardDescription className="text-xs">Your current fitness metrics</CardDescription>
      </CardHeader>
      <CardContent className="pb-4">
        <div className="space-y-4">
          {/* Freshness Gauge */}
          <div>
            <h4 className="text-xs font-semibold mb-2 text-center text-muted-foreground">Freshness</h4>
            <FreshnessGauge tsb={status.tsb || 0} />
          </div>

          <div className="border-t border-gray-200 pt-3 space-y-2">
            <div className="border-l-4 border-primary pl-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-muted-foreground">CTL (Fitness)</span>
                <span className="text-xl font-bold text-foreground">
                  {status.ctl != null ? status.ctl.toFixed(1) : '0.0'}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Chronic Training Load
              </p>
            </div>

            <div className="border-l-4 border-gray-300 pl-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-muted-foreground">ATL (Fatigue)</span>
                <span className="text-xl font-bold text-foreground">
                  {status.atl != null ? status.atl.toFixed(1) : '0.0'}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Acute Training Load
              </p>
            </div>

            <div className="border-l-4 border-blue-400 pl-2">
              <div className="flex justify-between items-center">
                <span className="text-xs font-medium text-muted-foreground">TSB (Form)</span>
                <span className={`text-xl font-bold ${
                  status.tsb > 5 ? 'text-blue-500' :
                  status.tsb >= -10 ? 'text-green-500' :
                  status.tsb >= -20 ? 'text-orange-500' :
                  'text-red-500'
                }`}>
                  {status.tsb != null ? status.tsb.toFixed(1) : '0.0'}
                </span>
              </div>
              <p className="text-[10px] text-muted-foreground">
                Training Stress Balance (CTL − ATL)
              </p>
            </div>
          </div>

          {/* Health Data Section */}
          {healthData && (
            <div className="border-t border-gray-200 pt-3 space-y-2">
              <h4 className="text-xs font-semibold text-muted-foreground mb-2">Today's Wellness</h4>

              <div className="grid grid-cols-2 gap-2">
                {/* Sleep */}
                {healthData.sleep_hours && (
                  <div className="flex items-center gap-2 p-2 bg-blue-50 dark:bg-blue-950 rounded-lg">
                    <Moon className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        {healthData.sleep_hours}h
                      </div>
                      <div className="text-[10px] text-muted-foreground">
                        Sleep{healthData.sleep_quality ? ` (${healthData.sleep_quality}/5)` : ''}
                      </div>
                    </div>
                  </div>
                )}

                {/* HRV */}
                {healthData.hrv && (
                  <div className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950 rounded-lg">
                    <Activity className="w-4 h-4 text-green-600 dark:text-green-400" />
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        {healthData.hrv}ms
                      </div>
                      <div className="text-[10px] text-muted-foreground">HRV</div>
                    </div>
                  </div>
                )}

                {/* Resting HR */}
                {healthData.resting_heart_rate && (
                  <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-950 rounded-lg">
                    <Heart className="w-4 h-4 text-red-600 dark:text-red-400" />
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        {healthData.resting_heart_rate}
                      </div>
                      <div className="text-[10px] text-muted-foreground">Resting HR</div>
                    </div>
                  </div>
                )}

                {/* Body Battery */}
                {healthData.body_battery !== undefined && healthData.body_battery !== null && (
                  <div className="flex items-center gap-2 p-2 bg-amber-50 dark:bg-amber-950 rounded-lg">
                    <Battery className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        {healthData.body_battery}%
                      </div>
                      <div className="text-[10px] text-muted-foreground">Body Battery</div>
                    </div>
                  </div>
                )}

                {/* Readiness Score */}
                {healthData.readiness_score !== undefined && healthData.readiness_score !== null && (
                  <div className="flex items-center gap-2 p-2 bg-purple-50 dark:bg-purple-950 rounded-lg">
                    <TrendingUp className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        {healthData.readiness_score}%
                      </div>
                      <div className="text-[10px] text-muted-foreground">Readiness</div>
                    </div>
                  </div>
                )}

                {/* Stress Level */}
                {healthData.stress_level && (
                  <div className="flex items-center gap-2 p-2 bg-orange-50 dark:bg-orange-950 rounded-lg">
                    <AlertCircle className="w-4 h-4 text-orange-600 dark:text-orange-400" />
                    <div>
                      <div className="text-sm font-semibold text-foreground">
                        {healthData.stress_level}/5
                      </div>
                      <div className="text-[10px] text-muted-foreground">Stress</div>
                    </div>
                  </div>
                )}
              </div>

              {/* Notes if present */}
              {healthData.notes && (
                <div className="text-xs text-muted-foreground italic bg-gray-50 dark:bg-gray-900 p-2 rounded">
                  "{healthData.notes}"
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
