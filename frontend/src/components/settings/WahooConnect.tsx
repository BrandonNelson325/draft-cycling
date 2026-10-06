import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { wahooService } from '../../services/wahooService';

/**
 * Wahoo Cloud API connect/disconnect.
 *
 * The backend owns the OAuth handshake (it holds the client secret and builds
 * the authorize URL), so this component only kicks the user to that URL and
 * reads back status. The backend callback redirects to
 * `${FRONTEND_URL}/settings?wahoo=connected|error`, which we consume below.
 */
export function WahooConnect() {
  const [connected, setConnected] = useState(false);
  const [autoSync, setAutoSync] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Consume the ?wahoo= result from the OAuth callback, then strip it so a
    // refresh doesn't re-show the message.
    const params = new URLSearchParams(window.location.search);
    const result = params.get('wahoo');
    if (result === 'error') {
      setError('Wahoo connection failed. Please try again.');
    }
    if (result) {
      const url = new URL(window.location.href);
      url.searchParams.delete('wahoo');
      window.history.replaceState({}, '', url.toString());
    }
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const status = await wahooService.getStatus();
      setConnected(status.connected);
      setAutoSync(status.auto_sync);
    } catch {
      // Not connected / not reachable — leave defaults.
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    setError('');
    try {
      const authUrl = await wahooService.getAuthUrl();
      window.location.href = authUrl;
    } catch (err: any) {
      setError(err.message || 'Failed to start Wahoo connection');
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    setError('');
    try {
      await wahooService.disconnect();
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
      await wahooService.updateSettings(enabled);
    } catch (err: any) {
      setAutoSync(!enabled); // revert on failure
      setError(err.message || 'Failed to update setting');
    }
  };

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}

      {connected ? (
        <>
          <div className="rounded-lg border border-green-200 bg-green-50 p-3">
            <p className="text-sm font-medium text-green-800">✓ Wahoo Connected</p>
            <p className="text-xs text-green-700">Workouts will sync to your Wahoo ELEMNT</p>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={autoSync}
              onChange={(e) => handleAutoSyncToggle(e.target.checked)}
            />
            Auto-sync workouts when scheduled
          </label>

          <Button
            onClick={handleDisconnect}
            disabled={loading}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            Disconnect
          </Button>
        </>
      ) : (
        <Button
          onClick={handleConnect}
          disabled={loading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white"
        >
          {loading ? 'Connecting…' : 'Connect Wahoo'}
        </Button>
      )}
    </div>
  );
}
