import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { stravaService } from '../services/stravaService';
import { authService } from '../services/authService';

export function StravaCallback() {
  const [status, setStatus] = useState('Processing...');
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      try {
        // Parse URL parameters
        const params = new URLSearchParams(window.location.search);
        const accessToken = params.get('access_token');
        const refreshToken = params.get('refresh_token');
        const expiresAt = params.get('expires_at');
        const athleteId = params.get('athlete_id');
        const error = params.get('strava_error');

        if (error) {
          setStatus(`Error: ${error}`);
          setTimeout(() => navigate('/'), 3000);
          return;
        }

        if (!accessToken || !refreshToken || !expiresAt || !athleteId) {
          setStatus('Missing Strava data');
          setTimeout(() => navigate('/'), 3000);
          return;
        }

        setStatus('Connecting to Strava...');

        // Send tokens to backend
        await stravaService.connectStrava({
          access_token: accessToken,
          refresh_token: refreshToken,
          expires_at: parseInt(expiresAt),
          athlete_id: parseInt(athleteId),
        });

        setStatus('Connected! Syncing activities...');

        // Refresh user profile
        await authService.getProfile();

        setStatus('Success! Redirecting...');
        setTimeout(() => navigate('/'), 2000);
      } catch (err: any) {
        console.error('Callback error:', err);
        setStatus(`Error: ${err.message}`);
        setTimeout(() => navigate('/'), 3000);
      }
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
        <h2 className="text-xl font-semibold">{status}</h2>
      </div>
    </div>
  );
}
