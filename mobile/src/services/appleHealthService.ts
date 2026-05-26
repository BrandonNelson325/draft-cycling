import { Platform } from 'react-native';
import apiClient from '../api/client';

// Lazy-load the HealthKit module so importing this file on Android doesn't crash.
// The native module only exists in iOS builds with the config plugin applied.
// The package exposes top-level named functions (Nitro Modules — no method-on-object).
let HealthKit: any = null;
function getHealthKit() {
  if (Platform.OS !== 'ios') return null;
  if (HealthKit) return HealthKit;
  try {
    HealthKit = require('@kingstinct/react-native-healthkit');
    return HealthKit;
  } catch {
    return null;
  }
}

const READ_TYPES = [
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKCategoryTypeIdentifierSleepAnalysis',
];

interface DailyWellness {
  hrv: number | null;
  rhr: number | null;
  sleep_seconds: number | null;
}

export const appleHealthService = {
  isAvailable(): boolean {
    return Platform.OS === 'ios' && getHealthKit() !== null;
  },

  /**
   * Prompt the user for read access to HRV, RHR, and Sleep.
   *
   * Apple intentionally doesn't tell apps which permissions were actually
   * granted — empty query results are the only signal. So we report success
   * any time the prompt resolves; data availability is verified at sync time.
   */
  async requestPermissions(): Promise<boolean> {
    const HK = getHealthKit();
    if (!HK) return false;
    try {
      await HK.requestAuthorization({ toRead: READ_TYPES, toShare: [] });
      return true;
    } catch (err) {
      console.warn('[AppleHealth] Permission request failed:', err);
      return false;
    }
  },

  /**
   * Read today's wellness from HealthKit. Returns nulls for any field that
   * isn't available (no device sync, user doesn't track that metric, etc.).
   *
   * Sleep is computed by summing all "asleep" intervals from the previous
   * night (6pm yesterday → now), so a full overnight session is captured.
   */
  async readTodayWellness(): Promise<DailyWellness> {
    const HK = getHealthKit();
    if (!HK) return { hrv: null, rhr: null, sleep_seconds: null };

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const sleepWindowStart = new Date(startOfToday);
    sleepWindowStart.setDate(sleepWindowStart.getDate() - 1);
    sleepWindowStart.setHours(18, 0, 0, 0);

    const todayFilter = { filter: { date: { startDate: startOfToday, endDate: now } }, limit: 20, ascending: false };
    const sleepFilter = { filter: { date: { startDate: sleepWindowStart, endDate: now } }, limit: 200, ascending: true };

    const [hrvSamples, rhrSamples, sleepSamples] = await Promise.allSettled([
      HK.queryQuantitySamples('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', { ...todayFilter, unit: 'ms' }),
      HK.queryQuantitySamples('HKQuantityTypeIdentifierRestingHeartRate', { ...todayFilter, unit: 'count/min' }),
      HK.queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', sleepFilter),
    ]);

    let hrv: number | null = null;
    let rhr: number | null = null;
    let sleep_seconds: number | null = null;

    if (hrvSamples.status === 'fulfilled' && hrvSamples.value?.length) {
      // Most recent reading (queried descending) is most relevant for "today's HRV"
      hrv = Math.round(hrvSamples.value[0].quantity);
    }

    if (rhrSamples.status === 'fulfilled' && rhrSamples.value?.length) {
      rhr = Math.round(rhrSamples.value[0].quantity);
    }

    if (sleepSamples.status === 'fulfilled' && sleepSamples.value?.length) {
      // Sum all "asleep" sub-categories (Core, REM, Deep, plus generic asleep).
      // Apple uses these category values:
      //   0 = inBed, 1 = asleepUnspecified, 2 = awake,
      //   3 = asleepCore, 4 = asleepDeep, 5 = asleepREM
      const ASLEEP_VALUES = new Set([1, 3, 4, 5]);
      let totalSeconds = 0;
      for (const s of sleepSamples.value) {
        if (!ASLEEP_VALUES.has(s.value)) continue;
        const start = new Date(s.startDate).getTime();
        const end = new Date(s.endDate).getTime();
        totalSeconds += Math.max(0, (end - start) / 1000);
      }
      sleep_seconds = totalSeconds > 0 ? Math.round(totalSeconds) : null;
    }

    return { hrv, rhr, sleep_seconds };
  },

  /**
   * Read today's wellness from HealthKit and push it to the backend.
   * Safe to call repeatedly; the backend upserts on (athlete_id, date).
   */
  async syncToday(): Promise<boolean> {
    if (!this.isAvailable()) return false;
    try {
      const data = await this.readTodayWellness();
      if (data.hrv == null && data.rhr == null && data.sleep_seconds == null) {
        return false;
      }

      const today = new Date();
      const dateStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

      await apiClient.post('/api/integrations/apple-health/wellness', {
        date: dateStr,
        ...data,
      });
      return true;
    } catch (err) {
      console.warn('[AppleHealth] Sync failed:', err);
      return false;
    }
  },

  // Settings ---------------------------------------------------------------

  async getStatus(): Promise<{ enabled: boolean; use_for_wellness: boolean; last_sync_at: string | null }> {
    const { data } = await apiClient.get<{ enabled: boolean; use_for_wellness: boolean; last_sync_at: string | null }>(
      '/api/integrations/apple-health/status'
    );
    return data;
  },

  async updateSettings(updates: { enabled?: boolean; use_for_wellness?: boolean }): Promise<void> {
    await apiClient.post('/api/integrations/apple-health/settings', updates);
  },
};
