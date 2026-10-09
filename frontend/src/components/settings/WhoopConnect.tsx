import { useState, useEffect } from 'react';
import { Button } from '../ui/button';
import { whoopService } from '../../services/whoopService';

/**
 * WHOOP connect/disconnect. WHOOP becomes the athlete's recovery source:
 * recovery, HRV, sleep and strain guide the coach's daily suggestions (the
 * coach always suggests — the athlete decides). The backend owns the OAuth
 * handshake and redirects to `${FRONTEND_URL}/settings?whoop=connected|error`.
 */
export function WhoopConnect() {
  const [connected, setConnected] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const result = params.get('whoop');
    if (result === 'error') setError('WHOOP connection failed. Please try again.');
    if (result === 'connected') setMessage('WHOOP connected — pulling your last 60 days.');
    if (result) {
      const url = new URL(window.location.href);
      url.searchParams.delete('whoop');
      window.history.replaceState({}, '', url.toString());
    }
    whoopService.getStatus()
      .then((s) => { setConnected(s.connected); setLastSync(s.last_sync_at); })
      .catch(() => {});
  }, []);

  const handleConnect = async () => {
    setLoading(true);
    setError('');
    try {
      window.location.href = await whoopService.getAuthUrl();
    } catch (err: any) {
      setError(err.message || 'Failed to start WHOOP connection');
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setLoading(true);
    setError('');
    try {
      await whoopService.sync(7);
      setLastSync(new Date().toISOString());
      setMessage('Latest WHOOP data pulled.');
    } catch (err: any) {
      setError(err.message || 'Failed to sync');
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    setLoading(true);
    setError('');
    try {
      await whoopService.disconnect();
      setConnected(false);
      setLastSync(null);
      setMessage('');
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {message && !error && <p className="text-sm text-green-700">{message}</p>}
      {connected ? (
        <>
          <div className="rounded-lg border border-green-200 bg-green-50 p-3">
            <p className="text-sm font-medium text-green-800">✓ WHOOP Connected</p>
            <p className="text-xs text-green-700">
              Recovery, HRV, sleep and strain guide your coach's daily suggestions.
              {lastSync ? ` Last sync: ${new Date(lastSync).toLocaleString()}` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            <Button onClick={handleSync} disabled={loading} variant="outline">
              {loading ? 'Syncing…' : 'Sync now'}
            </Button>
            <Button onClick={handleDisconnect} disabled={loading} className="bg-red-600 hover:bg-red-700 text-white">
              Disconnect
            </Button>
          </div>
        </>
      ) : (
        <Button onClick={handleConnect} disabled={loading} className="w-full bg-gray-900 hover:bg-black text-white">
          {loading ? 'Connecting…' : 'Connect WHOOP'}
        </Button>
      )}
    </div>
  );
}
