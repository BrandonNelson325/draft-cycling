import { useState, useEffect } from 'react';
import { stravaService } from '../../services/stravaService';
import { authService } from '../../services/authService';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

export function StravaConnect() {
  const [connected, setConnected] = useState(false);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    checkConnection();
  }, []);

  const checkConnection = async () => {
    try {
      const status: any = await stravaService.getConnectionStatus();
      setConnected(status.connected);
    } catch (err) {
      console.error('Failed to check connection:', err);
    }
  };

  const handleConnect = async () => {
    setLoading(true);
    setError('');

    try {
      const { auth_url } = (await stravaService.getAuthUrl()) as any;
      // Redirect to Strava authorization
      window.location.href = auth_url;
    } catch (err: any) {
      setError(err.message || 'Failed to connect to Strava');
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm('Are you sure you want to disconnect Strava?')) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      await stravaService.disconnectStrava();
      setConnected(false);

      // Refresh user profile
      await authService.getProfile();
    } catch (err: any) {
      setError(err.message || 'Failed to disconnect Strava');
    } finally {
      setLoading(false);
    }
  };

  const handleSync = async () => {
    setSyncing(true);
    setError('');

    try {
      const result: any = await stravaService.syncActivities();
      alert(`Synced ${result.synced} activities`);
    } catch (err: any) {
      setError(err.message || 'Failed to sync activities');
    } finally {
      setSyncing(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <svg className="w-6 h-6" viewBox="0 0 24 24" fill="#FC4C02">
            <path d="M15.387 17.944l-2.089-4.116h-3.065L15.387 24l5.15-10.172h-3.066m-7.008-5.599l2.836 5.598h4.172L10.463 0l-7 13.828h4.169" />
          </svg>
          Strava Connection
        </CardTitle>
        <CardDescription>
          Connect your Strava account to sync rides and get AI-powered analysis
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-3 text-sm text-red-600 bg-red-50 rounded-md">
            {error}
          </div>
        )}

        {connected ? (
          <div className="space-y-4">
            <div className="p-3 bg-green-50 border border-green-200 rounded-md">
              <p className="text-sm text-green-700 font-semibold flex items-center gap-2">
                ✓ Strava Connected
              </p>
              <p className="text-xs text-green-600 mt-1">
                Your rides are being synced automatically
              </p>
            </div>

            <div className="flex gap-2">
              <Button onClick={handleSync} disabled={syncing} variant="outline">
                {syncing ? 'Syncing...' : 'Sync Now'}
              </Button>
              <Button onClick={handleDisconnect} disabled={loading} variant="destructive">
                Disconnect
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="p-3 bg-gray-50 border border-gray-200 rounded-md">
              <p className="text-sm text-gray-700">
                Connect Strava to:
              </p>
              <ul className="text-xs text-gray-600 mt-2 space-y-1 ml-4 list-disc">
                <li>Auto-sync rides after each activity</li>
                <li>Get AI analysis of your performance</li>
                <li>Automatically calculate your FTP</li>
                <li>Track training load and status</li>
                <li>View power curve analysis</li>
              </ul>
            </div>

            <Button onClick={handleConnect} disabled={loading} className="w-full">
              {loading ? 'Connecting...' : 'Connect with Strava'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
