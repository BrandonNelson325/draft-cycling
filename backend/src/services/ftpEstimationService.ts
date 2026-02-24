import { supabaseAdmin } from '../utils/supabase';
import { logger } from '../utils/logger';

/**
 * FTP Estimation — Critical Power Model
 *
 * Formula: P(t) = CP + W'/t  →  W(t) = CP*t + W'
 *
 * Where:
 *   CP  = Critical Power (≈ FTP), the sustainable aerobic power asymptote (watts)
 *   W'  = W-prime (joules), the finite work capacity above CP (~15–25 kJ for trained cyclists)
 *   t   = duration (seconds)
 *   P(t)= maximal average power sustainable for duration t
 *
 * Estimation methods (best to worst):
 *   1. Multi-point CP regression  — linear fit of W(t)=P*t vs t across 3+ durations; solves
 *                                   for both CP and W' simultaneously (most accurate)
 *   2. 2-point CP model           — same formula solved from exactly two well-separated efforts
 *   3. Duration-adjusted estimate — FTP = P_t - W'/t using default W'=20 kJ; take max across
 *                                   all available durations (any maximal effort is a lower bound)
 *
 * Why this beats the 20-min × 0.95 rule:
 *   - The 95% factor is a population average; individual W' ranges from 10–35 kJ
 *   - A 13-min effort at 332W with W'≈21 kJ correctly implies FTP ≈ 305W
 *   - The old formula from a stale 20-min best of 305W gives 290W — 15W too low
 *
 * TODO (needs DB migration): Add power_12min (720s) and power_13min (780s) columns to
 * power_curves. These durations sit in the sweet spot for CP estimation accuracy
 * (low W' sensitivity, close to FTP) and directly capture common 10–15 min intervals.
 */

// Durations used for CP regression — 3 min minimum (below this W' dominates too heavily)
const CP_DURATIONS: { key: string; t: number }[] = [
  { key: 'power_3min', t: 180 },
  { key: 'power_5min', t: 300 },
  { key: 'power_8min', t: 480 },
  { key: 'power_10min', t: 600 },
  { key: 'power_15min', t: 900 },
  { key: 'power_20min', t: 1200 },
  { key: 'power_30min', t: 1800 },
  { key: 'power_45min', t: 2700 },
  { key: 'power_60min', t: 3600 },
];

// Default W' for single-effort estimates — midpoint of trained cyclist range (15–25 kJ)
// Intervals.icu implied ~21 kJ for this athlete; 20 kJ is a safe conservative default
const DEFAULT_W_PRIME_J = 20000;

export const ftpEstimationService = {
  /**
   * Ordinary least-squares linear regression: y = slope*x + intercept
   */
  linearRegression(points: { x: number; y: number }[]): {
    slope: number;
    intercept: number;
    r2: number;
  } | null {
    const n = points.length;
    if (n < 2) return null;

    const sumX = points.reduce((s, p) => s + p.x, 0);
    const sumY = points.reduce((s, p) => s + p.y, 0);
    const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
    const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);

    const denom = n * sumXX - sumX * sumX;
    if (Math.abs(denom) < 1e-6) return null;

    const slope = (n * sumXY - sumX * sumY) / denom;
    const intercept = (sumY - slope * sumX) / n;

    const yMean = sumY / n;
    const ssTot = points.reduce((s, p) => s + Math.pow(p.y - yMean, 2), 0);
    const ssRes = points.reduce((s, p) => s + Math.pow(p.y - (slope * p.x + intercept), 2), 0);
    const r2 = ssTot > 1 ? Math.max(0, 1 - ssRes / ssTot) : 1;

    return { slope, intercept, r2 };
  },

  /**
   * Estimate FTP using the Critical Power model.
   *
   * Combines two approaches and returns the higher (more optimistic, data-justified) estimate:
   *
   * A) Duration-adjusted max: for each stored duration, compute FTP = P - W'/t using default
   *    W'=20kJ, then take the maximum. This ensures any recent hard effort is reflected even
   *    if it's not a 20-min effort.
   *
   * B) Multi-point CP regression: when ≥3 duration data points span a ≥2.5x duration range,
   *    fit W(t)=FTP*t+W' by linear regression. Solves for both FTP and W' without assumptions.
   *
   * The higher of A and B is returned. Taking the max is justified because:
   *   - Any maximal effort at any duration is a valid lower bound on FTP
   *   - We want to reflect most recent fitness, not be dragged down by stale data
   *   - Overestimation from non-maximal efforts is naturally filtered (they produce lower estimates)
   */
  async estimateFTP(athleteId: string): Promise<{
    estimated_ftp: number;
    confidence: 'high' | 'medium' | 'low';
    based_on: string;
    best_20min_power: number;
    w_prime_kj?: number;
    activity_count: number;
  } | null> {
    try {
      // 90-day window — wider than the old 42-day window to get better curve coverage
      const ninetyDaysAgo = new Date();
      ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);

      const { data: curves, error } = await supabaseAdmin
        .from('power_curves')
        .select('*, strava_activities!inner(start_date)')
        .eq('athlete_id', athleteId)
        .gte('strava_activities.start_date', ninetyDaysAgo.toISOString());

      if (error || !curves || curves.length === 0) {
        logger.debug('No power curve data available for FTP estimation');
        return null;
      }

      // Collect best effort at each duration across all recent rides
      const bestByDuration = new Map<string, { t: number; power: number }>();
      let best20Min = 0;

      for (const curve of curves) {
        for (const { key, t } of CP_DURATIONS) {
          if (curve[key] && curve[key] > 0) {
            const current = bestByDuration.get(key);
            if (!current || curve[key] > current.power) {
              bestByDuration.set(key, { t, power: curve[key] });
            }
          }
        }
        if (curve.power_20min && curve.power_20min > best20Min) {
          best20Min = curve.power_20min;
        }
      }

      if (bestByDuration.size === 0) return null;

      // ── Method A: Duration-adjusted estimate (FTP = P - W'/t), take max ──
      // Skip <3 min efforts — too W'-dominated for meaningful FTP inference
      let maxSingleFTP = 0;
      let maxSingleLabel = '';

      for (const { t, power } of bestByDuration.values()) {
        if (t < 180) continue;
        const ftpEstimate = power - DEFAULT_W_PRIME_J / t;
        if (ftpEstimate > maxSingleFTP) {
          maxSingleFTP = ftpEstimate;
          const tLabel = `${Math.round(t / 60)}min`;
          maxSingleLabel = `${tLabel} best (${power}W, W'=20kJ)`;
        }
      }

      // ── Method B: Multi-point CP regression on W(t) = FTP*t + W' ──
      // Use 3–30 min range where the 2-parameter CP model is most valid
      const regressionPoints = Array.from(bestByDuration.values())
        .filter(({ t }) => t >= 180 && t <= 1800)
        .map(({ t, power }) => ({ x: t, y: power * t }));

      let regressionFTP: number | null = null;
      let regressionWPrimeKJ: number | undefined;
      let regressionLabel = '';
      let regressionR2 = 0;

      if (regressionPoints.length >= 3) {
        const times = regressionPoints.map(p => p.x);
        const durationSpread = Math.max(...times) / Math.min(...times);

        if (durationSpread >= 2.5) {
          const reg = this.linearRegression(regressionPoints);
          if (reg) {
            const { slope: cp, intercept: wPrimeJ, r2 } = reg;
            // Validate physiological plausibility: W' 5–40 kJ, CP > 100W
            if (cp > 100 && wPrimeJ >= 5000 && wPrimeJ <= 40000) {
              regressionFTP = Math.round(cp);
              regressionWPrimeKJ = Math.round((wPrimeJ / 1000) * 10) / 10;
              regressionR2 = r2;
              const labels = regressionPoints
                .sort((a, b) => a.x - b.x)
                .map(p => `${Math.round(p.x / 60)}min`)
                .join('+');
              regressionLabel = `CP regression (${labels}, W'=${regressionWPrimeKJ}kJ, R²=${r2.toFixed(3)})`;
            }
          }
        }
      }

      // ── Combine: return the higher of the two methods ──
      const singleFTP = Math.round(maxSingleFTP);
      const useRegression = regressionFTP !== null && regressionFTP >= singleFTP;
      const estimatedFTP = useRegression ? regressionFTP! : singleFTP;
      const wPrimeKJ = useRegression ? regressionWPrimeKJ : DEFAULT_W_PRIME_J / 1000;

      // Confidence: based on method and data quality
      let confidence: 'high' | 'medium' | 'low';
      let basedOn: string;

      if (useRegression) {
        basedOn = regressionLabel;
        confidence = regressionR2 >= 0.99 ? 'high' : 'medium';
      } else {
        basedOn = `Duration-adjusted max: ${maxSingleLabel}`;
        const longestT = Array.from(bestByDuration.values())
          .filter(({ t }) => t >= 180)
          .reduce((max, { t }) => Math.max(max, t), 0);
        confidence = longestT >= 2700 ? 'high' : longestT >= 1200 ? 'medium' : 'low';
      }

      return {
        estimated_ftp: estimatedFTP,
        confidence,
        based_on: basedOn,
        best_20min_power: best20Min,
        w_prime_kj: wPrimeKJ,
        activity_count: curves.length,
      };
    } catch (error) {
      logger.error('Error estimating FTP:', error);
      return null;
    }
  },

  /**
   * Auto-update athlete FTP if estimation is medium or high confidence
   * and the new estimate is meaningfully higher than the current FTP.
   */
  async autoUpdateFTP(athleteId: string): Promise<boolean> {
    try {
      const estimation = await this.estimateFTP(athleteId);

      if (!estimation) return false;

      // Accept medium or high confidence (was high-only before)
      if (estimation.confidence === 'low') {
        logger.debug(`FTP estimation confidence too low (${estimation.confidence})`);
        return false;
      }

      const { data: athlete } = await supabaseAdmin
        .from('athletes')
        .select('ftp')
        .eq('id', athleteId)
        .single();

      // Only update if significantly different (>5W) or not set
      // Never auto-lower FTP — only auto-raise (drops require intentional reset)
      if (
        !athlete?.ftp ||
        (estimation.estimated_ftp > athlete.ftp && estimation.estimated_ftp - athlete.ftp > 5)
      ) {
        await supabaseAdmin
          .from('athletes')
          .update({
            ftp: estimation.estimated_ftp,
            updated_at: new Date().toISOString(),
          })
          .eq('id', athleteId);

        logger.debug(
          `Auto-updated FTP for athlete ${athleteId}: ${athlete?.ftp || 'none'} → ${estimation.estimated_ftp}W`
        );
        return true;
      }

      return false;
    } catch (error) {
      logger.error('Error auto-updating FTP:', error);
      return false;
    }
  },

  /**
   * Get FTP history and trends (weekly best estimate)
   */
  async getFTPHistory(athleteId: string, weeks: number = 12) {
    try {
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - weeks * 7);

      const { data: curves, error } = await supabaseAdmin
        .from('power_curves')
        .select('power_5min, power_8min, power_10min, power_15min, power_20min, power_30min, created_at')
        .eq('athlete_id', athleteId)
        .gte('created_at', startDate.toISOString())
        .order('created_at', { ascending: true });

      if (error || !curves || curves.length === 0) {
        return null;
      }

      // Group by week, compute best duration-adjusted FTP estimate per week
      const weekMap = new Map<string, { ftp: number; power_20min: number }>();

      for (const curve of curves) {
        const week = this.getWeekKey(new Date(curve.created_at));

        // Duration-adjusted FTP estimate for this curve
        let bestFTP = 0;
        const candidates = [
          { power: curve.power_5min, t: 300 },
          { power: curve.power_8min, t: 480 },
          { power: curve.power_10min, t: 600 },
          { power: curve.power_15min, t: 900 },
          { power: curve.power_20min, t: 1200 },
          { power: curve.power_30min, t: 1800 },
        ];
        for (const { power, t } of candidates) {
          if (power && t >= 180) {
            const est = power - DEFAULT_W_PRIME_J / t;
            if (est > bestFTP) bestFTP = est;
          }
        }

        const current = weekMap.get(week);
        if (!current || bestFTP > current.ftp) {
          weekMap.set(week, {
            ftp: Math.round(bestFTP),
            power_20min: curve.power_20min || 0,
          });
        }
      }

      return Array.from(weekMap.entries())
        .map(([week, { ftp, power_20min }]) => ({ week, ftp, power_20min }))
        .sort((a, b) => a.week.localeCompare(b.week));
    } catch (error) {
      logger.error('Error getting FTP history:', error);
      return null;
    }
  },

  getWeekKey(date: Date): string {
    const year = date.getFullYear();
    const week = this.getWeekNumber(date);
    return `${year}-W${String(week).padStart(2, '0')}`;
  },

  getWeekNumber(date: Date): number {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  },
};
