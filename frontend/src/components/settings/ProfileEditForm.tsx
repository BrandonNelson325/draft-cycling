import { useState } from 'react';
import { useAuthStore } from '../../stores/useAuthStore';
import { authService } from '../../services/authService';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { getConversionUtils, convertToMetric } from '../../utils/units';

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
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage(null);

    try {
      const updates: { full_name?: string; ftp?: number; weight_kg?: number; unit_system?: 'metric' | 'imperial' } = {};

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
