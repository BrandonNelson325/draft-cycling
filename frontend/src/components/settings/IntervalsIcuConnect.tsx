import { useState, useEffect } from 'react';
import { intervalsIcuService } from '../../services/intervalsIcuService';
import { Button } from '../ui/button';

export function IntervalsIcuConnect() {
  const [connected, setConnected] = useState(false);
  const [autoSync, setAutoSync] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [showSyncPrompt, setShowSyncPrompt] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Check URL params for OAuth callback — offer to sync existing workouts
    const params = new URLSearchParams(window.location.search);
    if (params.get('intervals_icu') === 'connected') {
      const url = new URL(window.location.href);
      url.searchParams.delete('intervals_icu');
      window.history.replaceState({}, '', url.toString());
      setShowSyncPrompt(true);
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

  const handleSyncAll = async () => {
    setSyncing(true);
    setError('');
    setShowSyncPrompt(false);
    try {
      const result = await intervalsIcuService.syncAll();
      alert(result.message);
    } catch (err: any) {
      setError(err.message || 'Failed to sync workouts');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div>
      {error && (
        <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 rounded-md">{error}</div>
      )}

      {showSyncPrompt && connected && (
        <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-md">
          <p className="text-sm text-blue-700 font-medium">Would you like to sync your existing scheduled workouts to Intervals.icu?</p>
          <div className="flex gap-2 mt-2">
            <Button onClick={handleSyncAll} disabled={syncing} size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
              {syncing ? 'Syncing...' : 'Yes, sync now'}
            </Button>
            <Button onClick={() => setShowSyncPrompt(false)} size="sm" variant="outline">
              No thanks
            </Button>
          </div>
        </div>
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

          <div className="flex gap-2">
            <Button onClick={handleSyncAll} disabled={syncing} variant="outline">
              {syncing ? 'Syncing...' : 'Sync All Workouts'}
            </Button>
            <Button onClick={handleDisconnect} disabled={loading} className="bg-red-600 hover:bg-red-700 text-white">
              {loading ? 'Disconnecting...' : 'Disconnect'}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
            <p className="text-sm text-gray-700">Connect Intervals.icu to sync workouts to your devices and platforms:</p>
            <ul className="text-xs text-gray-600 mt-2 space-y-1 ml-4 list-disc">
              <li>Head units — Garmin, Wahoo ELEMNT</li>
              <li>Training platforms — Zwift, Rouvy</li>
              <li>Track training across all your platforms</li>
            </ul>
            <p className="text-xs text-gray-500 mt-3">
              Create a free account at{' '}
              <a href="https://intervals.icu" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                intervals.icu
              </a>
              , then connect your Garmin, Wahoo, Zwift, or Rouvy accounts in their settings. Workouts will automatically sync to all connected devices.
            </p>
          </div>

          <Button onClick={handleConnect} disabled={loading} className="w-full bg-blue-600 hover:bg-blue-700 text-white">
            {loading ? 'Connecting...' : 'Connect with Intervals.icu'}
          </Button>
        </div>
      )}
    </div>
  );
}
