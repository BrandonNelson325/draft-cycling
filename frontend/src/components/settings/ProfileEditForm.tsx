import { useState, useMemo, useEffect } from 'react';
import { useAuthStore } from '../../stores/useAuthStore';
import { authService } from '../../services/authService';
import { wahooService } from '../../services/wahooService';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { getConversionUtils, convertToMetric } from '../../utils/units';

const ALL_TIMEZONES: string[] = (() => {
  try {
    return Intl.supportedValuesOf('timeZone');
  } catch {
    return ['America/New_York', 'America/Chicago', 'America/Denver', 'America/Los_Angeles', 'America/Anchorage', 'Pacific/Honolulu', 'Europe/London', 'Europe/Paris', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Shanghai', 'Australia/Sydney'];
  }
})();

export function ProfileEditForm() {
  const user = useAuthStore((state) => state.user);
  const units = getConversionUtils(user);

  const [fullName, setFullName] = useState(user?.full_name || '');
  const [ftp, setFtp] = useState(user?.ftp?.toString() || '');
  const [weight, setWeight] = useState(
    user?.weight_kg ? units.formatWeightValue(user.weight_kg).toString() : ''
  );
  const [unitSystem, setUnitSystem] = useState<'metric' | 'imperial'>(
    user?.unit_system || 'metric'
  );
  const [maxHr, setMaxHr] = useState(user?.max_hr?.toString() || '');
  const [restingHr, setRestingHr] = useState(user?.resting_hr?.toString() || '');
  const [dateOfBirth, setDateOfBirth] = useState(user?.date_of_birth || '');
  const [displayMode, setDisplayMode] = useState<'simple' | 'advanced'>(
    user?.display_mode || 'advanced'
  );
  const [experienceLevel, setExperienceLevel] = useState<'beginner' | 'intermediate' | 'advanced'>(
    user?.experience_level || 'intermediate'
  );
  const [weeklyHours, setWeeklyHours] = useState(
    user?.weekly_training_hours?.toString() || ''
  );
  const [timezone, setTimezone] = useState(
    user?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Los_Angeles'
  );
  const [tzSearch, setTzSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Wahoo integration state
  const [wahooConnected, setWahooConnected] = useState(false);
  const [wahooAutoSync, setWahooAutoSync] = useState(false);
  const [wahooLoading, setWahooLoading] = useState(false);

  const filteredTimezones = useMemo(() => {
    if (!tzSearch) return ALL_TIMEZONES;
    const q = tzSearch.toLowerCase();
    return ALL_TIMEZONES.filter(tz => tz.toLowerCase().includes(q));
  }, [tzSearch]);

  useEffect(() => {
    // Check URL params for Wahoo OAuth callback
    const params = new URLSearchParams(window.location.search);
    if (params.get('wahoo') === 'connected') {
      // Clean up the URL param
      const url = new URL(window.location.href);
      url.searchParams.delete('wahoo');
      window.history.replaceState({}, '', url.toString());
    }

    // Fetch Wahoo connection status
    wahooService.getStatus()
      .then((status) => {
        setWahooConnected(status.connected);
        setWahooAutoSync(status.auto_sync);
      })
      .catch((err) => {
        console.error('Failed to fetch Wahoo status:', err);
      });
  }, []);

  const handleWahooConnect = async () => {
    setWahooLoading(true);
    try {
      const authUrl = await wahooService.getAuthUrl();
      window.open(authUrl, '_blank');
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to connect Wahoo' });
    } finally {
      setWahooLoading(false);
    }
  };

  const handleWahooDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Wahoo?')) return;
    setWahooLoading(true);
    try {
      await wahooService.disconnect();
      setWahooConnected(false);
      setWahooAutoSync(false);
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Failed to disconnect Wahoo' });
    } finally {
      setWahooLoading(false);
    }
  };

  const handleWahooAutoSyncToggle = async (enabled: boolean) => {
    setWahooAutoSync(enabled);
    try {
      await wahooService.updateSettings(enabled);
    } catch (err: any) {
      // Revert on failure
      setWahooAutoSync(!enabled);
      setMessage({ type: 'error', text: err.message || 'Failed to update Wahoo settings' });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const updates: Record<string, any> = {};

      if (fullName !== user?.full_name) {
        updates.full_name = fullName;
      }

      const ftpNum = parseFloat(ftp);
      if (!isNaN(ftpNum) && ftpNum !== user?.ftp) {
        updates.ftp = ftpNum;
      }

      const weightNum = parseFloat(weight);
      if (!isNaN(weightNum)) {
        // Convert weight to kg for storage
        const weightInKg = convertToMetric(weightNum, unitSystem, 'weight');
        if (weightInKg !== user?.weight_kg) {
          updates.weight_kg = weightInKg;
        }
      }

      if (unitSystem !== user?.unit_system) {
        updates.unit_system = unitSystem;
      }

      if (displayMode !== user?.display_mode) {
        updates.display_mode = displayMode;
      }

      if (experienceLevel !== user?.experience_level) {
        updates.experience_level = experienceLevel;
      }

      const weeklyHoursNum = parseFloat(weeklyHours);
      if (!isNaN(weeklyHoursNum) && weeklyHoursNum !== user?.weekly_training_hours) {
        updates.weekly_training_hours = weeklyHoursNum;
      }

      if (timezone !== user?.timezone) {
        (updates as any).timezone = timezone;
      }

      const maxHrNum = parseInt(maxHr);
      if (!isNaN(maxHrNum) && maxHrNum !== user?.max_hr) {
        (updates as any).max_hr = maxHrNum;
      }

      const restingHrNum = parseInt(restingHr);
      if (!isNaN(restingHrNum) && restingHrNum !== user?.resting_hr) {
        (updates as any).resting_hr = restingHrNum;
      }

      if (dateOfBirth && dateOfBirth !== user?.date_of_birth) {
        (updates as any).date_of_birth = dateOfBirth;
      }

      if (Object.keys(updates).length === 0) {
        setMessage({ type: 'error', text: 'No changes to save' });
        setLoading(false);
        return;
      }

      await authService.updateProfile(updates);
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: error instanceof Error ? error.message : 'Failed to update profile',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label htmlFor="fullName" className="block text-sm font-medium mb-2">
          Full Name
        </label>
        <Input
          id="fullName"
          type="text"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Enter your full name"
        />
      </div>

      <div>
        <label htmlFor="ftp" className="block text-sm font-medium mb-2">
          FTP (watts)
        </label>
        <Input
          id="ftp"
          type="number"
          value={ftp}
          onChange={(e) => setFtp(e.target.value)}
          placeholder="Enter your FTP"
          min="0"
          step="1"
        />
      </div>

      <div>
        <label htmlFor="weight" className="block text-sm font-medium mb-2">
          Weight ({units.weightUnitShort})
        </label>
        <Input
          id="weight"
          type="number"
          value={weight}
          onChange={(e) => setWeight(e.target.value)}
          placeholder="Enter your weight"
          min="0"
          step="0.1"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label htmlFor="maxHr" className="block text-sm font-medium mb-2">
            Max Heart Rate
          </label>
          <Input
            id="maxHr"
            type="number"
            value={maxHr}
            onChange={(e) => setMaxHr(e.target.value)}
            placeholder="185"
            min="100"
            max="250"
          />
        </div>
        <div>
          <label htmlFor="restingHr" className="block text-sm font-medium mb-2">
            Resting Heart Rate
          </label>
          <Input
            id="restingHr"
            type="number"
            value={restingHr}
            onChange={(e) => setRestingHr(e.target.value)}
            placeholder="55"
            min="30"
            max="120"
          />
        </div>
      </div>

      <div>
        <label htmlFor="dob" className="block text-sm font-medium mb-2">
          Date of Birth
        </label>
        <Input
          id="dob"
          type="date"
          value={dateOfBirth}
          onChange={(e) => setDateOfBirth(e.target.value)}
        />
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Unit System</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="unitSystem"
              value="metric"
              checked={unitSystem === 'metric'}
              onChange={(e) => setUnitSystem(e.target.value as 'metric' | 'imperial')}
              className="w-4 h-4"
            />
            <span className="text-sm">Metric (km, kg)</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="unitSystem"
              value="imperial"
              checked={unitSystem === 'imperial'}
              onChange={(e) => setUnitSystem(e.target.value as 'metric' | 'imperial')}
              className="w-4 h-4"
            />
            <span className="text-sm">Imperial (mi, lbs)</span>
          </label>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">App Detail Level</label>
        <div className="flex gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="displayMode"
              value="simple"
              checked={displayMode === 'simple'}
              onChange={(e) => setDisplayMode(e.target.value as 'simple' | 'advanced')}
              className="w-4 h-4"
            />
            <span className="text-sm">Simple — quick &amp; concise</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name="displayMode"
              value="advanced"
              checked={displayMode === 'advanced'}
              onChange={(e) => setDisplayMode(e.target.value as 'simple' | 'advanced')}
              className="w-4 h-4"
            />
            <span className="text-sm">Advanced — full details</span>
          </label>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium mb-2">Experience Level</label>
        <p className="text-xs text-muted-foreground mb-2">
          How long you've been cycling with structured training
        </p>
        <div className="flex gap-2">
          {([
            { value: 'beginner', label: 'Beginner', desc: '0-2 years' },
            { value: 'intermediate', label: 'Intermediate', desc: '2-5 years' },
            { value: 'advanced', label: 'Advanced', desc: '5+ years' },
          ] as const).map((opt) => (
            <label
              key={opt.value}
              className={`flex-1 flex flex-col items-center gap-1 p-3 rounded-md border cursor-pointer transition-colors ${
                experienceLevel === opt.value
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-input hover:border-muted-foreground'
              }`}
            >
              <input
                type="radio"
                name="experienceLevel"
                value={opt.value}
                checked={experienceLevel === opt.value}
                onChange={(e) => setExperienceLevel(e.target.value as 'beginner' | 'intermediate' | 'advanced')}
                className="sr-only"
              />
              <span className="text-sm font-medium">{opt.label}</span>
              <span className="text-xs text-muted-foreground">{opt.desc}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="weeklyHours" className="block text-sm font-medium mb-2">
          Weekly Training Hours
        </label>
        <p className="text-xs text-muted-foreground mb-2">
          How many hours per week you can commit to riding
        </p>
        <Input
          id="weeklyHours"
          type="number"
          value={weeklyHours}
          onChange={(e) => setWeeklyHours(e.target.value)}
          placeholder="e.g. 8"
          min="1"
          max="30"
          step="0.5"
        />
      </div>

      <div>
        <label htmlFor="timezone" className="block text-sm font-medium mb-2">
          Timezone
        </label>
        <Input
          type="text"
          placeholder="Search timezones..."
          value={tzSearch}
          onChange={(e) => setTzSearch(e.target.value)}
          className="mb-1"
        />
        <select
          id="timezone"
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {filteredTimezones.map(tz => (
            <option key={tz} value={tz}>{tz.replace(/_/g, ' ')}</option>
          ))}
        </select>
      </div>

      {/* Wahoo Integration */}
      <div className="pt-2">
        <h3 className="text-sm font-medium mb-3">Wahoo</h3>
        {wahooConnected ? (
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 rounded-md border border-green-500/30 bg-green-500/10">
              <span className="text-green-500 text-sm font-medium">Connected</span>
            </div>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={wahooAutoSync}
                onChange={(e) => handleWahooAutoSyncToggle(e.target.checked)}
                className="w-4 h-4"
                disabled={wahooLoading}
              />
              <span className="text-sm">Auto-sync workouts to Wahoo SYSTM</span>
            </label>
            <Button
              type="button"
              variant="outline"
              onClick={handleWahooDisconnect}
              disabled={wahooLoading}
              className="text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
            >
              {wahooLoading ? 'Disconnecting...' : 'Disconnect Wahoo'}
            </Button>
          </div>
        ) : (
          <Button
            type="button"
            onClick={handleWahooConnect}
            disabled={wahooLoading}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            {wahooLoading ? 'Connecting...' : 'Connect Wahoo'}
          </Button>
        )}
      </div>

      {message && (
        <div
          className={`p-3 rounded-md text-sm ${
            message.type === 'success'
              ? 'bg-green-500/10 text-green-500 border border-green-500/20'
              : 'bg-red-500/10 text-red-500 border border-red-500/20'
          }`}
        >
          {message.text}
        </div>
      )}

      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Saving...' : 'Save Changes'}
      </Button>
    </form>
  );
}
