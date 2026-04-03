import { useState, useEffect } from 'react';
import { intervalsIcuService } from '../../services/intervalsIcuService';
import { Button } from '../ui/button';

export function IntervalsIcuConnect() {
  const [connected, setConnected] = useState(false);
  const [autoSync, setAutoSync] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Check URL params for OAuth callback
    const params = new URLSearchParams(window.location.search);
    if (params.get('intervals_icu') === 'connected') {
      const url = new URL(window.location.href);
      url.searchParams.delete('intervals_icu');
      window.history.replaceState({}, '', url.toString());
    }

    checkStatus();
  }, []);

  const checkStatus = async () => {
    try {
      const status = await intervalsIcuService.getStatus();
      setConnected(status.connected);
      setAutoSync(status.auto_sync);
    } catch {
      // not connected
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    setError('');
    try {
      const authUrl = await intervalsIcuService.getAuthUrl();
      window.location.href = authUrl;
    } catch (err: any) {
      setError(err.message || 'Failed to connect');
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Disconnect Intervals.icu? Workouts will no longer sync.')) return;
    setLoading(true);
    setError('');
    try {
      await intervalsIcuService.disconnect();
      setConnected(false);
      setAutoSync(false);
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect');
    } finally {
      setLoading(false);
    }
  };

  const handleAutoSyncToggle = async (enabled: boolean) => {
    setAutoSync(enabled);
    try {
      await intervalsIcuService.updateSettings(enabled);
    } catch (err: any) {
      setAutoSync(!enabled);
      setError(err.message || 'Failed to update settings');
    }
  };

  return (
    <div>
      {error && (
        <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 rounded-md">{error}</div>
      )}

      {connected ? (
        <div className="space-y-4">
          <div className="p-3 bg-green-50 border border-green-200 rounded-md">
            <p className="text-sm text-green-700 font-semibold">✓ Intervals.icu Connected</p>
            <p className="text-xs text-green-600 mt-1">
              Workouts will sync to your Intervals.icu calendar
            </p>
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={autoSync}
              onChange={(e) => handleAutoSyncToggle(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm">Auto-sync workouts when scheduled</span>
          </label>

          <Button onClick={handleDisconnect} disabled={loading} variant="destructive">
            {loading ? 'Disconnecting...' : 'Disconnect'}
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
            <p className="text-sm text-gray-700">Connect Intervals.icu to:</p>
            <ul className="text-xs text-gray-600 mt-2 space-y-1 ml-4 list-disc">
              <li>Sync planned workouts to your calendar</li>
              <li>Push workouts to Zwift via Intervals.icu</li>
              <li>Track training across platforms</li>
            </ul>
          </div>

          <Button onClick={handleConnect} disabled={loading} className="w-full">
            {loading ? 'Connecting...' : 'Connect with Intervals.icu'}
          </Button>
        </div>
      )}
    </div>
  );
}
