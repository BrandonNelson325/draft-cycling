import { Platform } from 'react-native';
import apiClient from '../api/client';

// Lazy-load the HealthKit module so importing this file on Android doesn't crash.
// The native module only exists in iOS builds with the config plugin applied.
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

const READ_PERMISSIONS = [
  'HKQuantityTypeIdentifierHeartRateVariabilitySDNN',
  'HKQuantityTypeIdentifierRestingHeartRate',
  'HKCategoryTypeIdentifierSleepAnalysis',
];

interface DailyWellness {
  hrv: number | null; // ms (SDNN)
  rhr: number | null; // bpm
  sleep_seconds: number | null;
}

export const appleHealthService = {
  isAvailable(): boolean {
    return Platform.OS === 'ios' && getHealthKit() !== null;
  },

  /**
   * Request HealthKit permissions. Returns true if the user granted (or had
   * previously granted) read access to the categories we care about.
   *
   * Note: Apple intentionally does NOT tell apps which permissions were
   * granted — calling read() and getting empty results is the only signal.
   * So we always assume "true" after the prompt resolves; the actual data
   * availability is verified at sync time.
   */
  async requestPermissions(): Promise<boolean> {
    const HK = getHealthKit();
    if (!HK) return false;
    try {
      await HK.requestAuthorization(READ_PERMISSIONS, []);
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
   * night — typically the most recent contiguous sleep block ending today.
   */
  async readTodayWellness(): Promise<DailyWellness> {
    const HK = getHealthKit();
    if (!HK) return { hrv: null, rhr: null, sleep_seconds: null };

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    // Sleep window: 6pm yesterday through now (catches a full night)
    const sleepWindowStart = new Date(startOfToday);
    sleepWindowStart.setDate(sleepWindowStart.getDate() - 1);
    sleepWindowStart.setHours(18, 0, 0, 0);

    const [hrvSamples, rhrSamples, sleepSamples] = await Promise.allSettled([
      HK.queryQuantitySamples('HKQuantityTypeIdentifierHeartRateVariabilitySDNN', {
        from: startOfToday,
        to: now,
        unit: 'ms',
      }),
      HK.queryQuantitySamples('HKQuantityTypeIdentifierRestingHeartRate', {
        from: startOfToday,
        to: now,
        unit: 'count/min',
      }),
      HK.queryCategorySamples('HKCategoryTypeIdentifierSleepAnalysis', {
        from: sleepWindowStart,
        to: now,
      }),
    ]);

    let hrv: number | null = null;
    let rhr: number | null = null;
    let sleep_seconds: number | null = null;

    if (hrvSamples.status === 'fulfilled' && hrvSamples.value?.length) {
      // Most recent reading is most relevant for "today's HRV"
      const latest = hrvSamples.value[hrvSamples.value.length - 1];
      hrv = Math.round(latest.quantity);
    }

    if (rhrSamples.status === 'fulfilled' && rhrSamples.value?.length) {
      const latest = rhrSamples.value[rhrSamples.value.length - 1];
      rhr = Math.round(latest.quantity);
    }

    if (sleepSamples.status === 'fulfilled' && sleepSamples.value?.length) {
      // Sum all "asleep" sub-categories (Core, REM, Deep). Apple uses values:
      //   1 = inBed, 2 = asleepUnspecified, 3 = awake, 4 = asleepCore,
      //   5 = asleepDeep, 6 = asleepREM
      const ASLEEP_VALUES = new Set([2, 4, 5, 6]);
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
   * Read today's wellness from HealthKit and push it to the backend. Returns
   * true if any field was successfully synced. Safe to call repeatedly.
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

  async getStatus(): Promise<{ enabled: boolean; last_sync_at: string | null }> {
    const { data } = await apiClient.get<{ enabled: boolean; last_sync_at: string | null }>(
      '/api/integrations/apple-health/status'
    );
    return data;
  },

  async updateSettings(enabled: boolean): Promise<void> {
    await apiClient.post('/api/integrations/apple-health/settings', { enabled });
  },
};
