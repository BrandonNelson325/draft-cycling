import { useEffect, useState } from 'react';
import { ftpService } from '../../services/ftpService';
import { authService } from '../../services/authService';
import { useAuthStore } from '../../stores/useAuthStore';
import { getConversionUtils } from '../../utils/units';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';

interface FTPEstimate {
  estimated_ftp: number;
  confidence: number;
  based_on_rides: number;
  last_updated: string;
}

export function FTPEstimateCard() {
  const user = useAuthStore((state) => state.user);
  const units = getConversionUtils(user);
  const [estimate, setEstimate] = useState<FTPEstimate | null>(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const fetchEstimate = async () => {
      try {
        const data = await ftpService.getEstimate();
        setEstimate(data || null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load FTP estimate');
      } finally {
        setLoading(false);
      }
    };

    fetchEstimate();
  }, []);

  const handleAcceptEstimate = async () => {
    if (!estimate) return;

    setUpdating(true);
    setMessage(null);

    try {
      await authService.updateProfile({ ftp: estimate.estimated_ftp });
      setMessage('FTP updated successfully!');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Failed to update FTP');
    } finally {
      setUpdating(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>FTP Estimate</CardTitle>
          <CardDescription>AI-powered FTP calculation</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Loading estimate...</p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>FTP Estimate</CardTitle>
          <CardDescription>AI-powered FTP calculation</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-red-500">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!estimate) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>FTP Estimate</CardTitle>
          <CardDescription>AI-powered FTP calculation</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Not enough data to estimate FTP. Complete more rides with power data.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-t-4 border-t-primary">
      <CardHeader>
        <CardTitle>FTP Estimate</CardTitle>
        <CardDescription>AI-powered FTP calculation</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="text-center">
            <div className="text-4xl font-bold text-primary mb-2">
              {estimate.estimated_ftp || 0}W
            </div>
            <p className="text-sm text-muted-foreground">
              Estimated Functional Threshold Power
            </p>
          </div>

          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Current FTP:</span>
              <span className="font-semibold">{user?.ftp ? `${user.ftp}W` : 'Not set'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Weight:</span>
              <span className="font-semibold">
                {user?.weight_kg
                  ? `${units.formatWeight(user.weight_kg)} ${units.weightUnitShort}`
                  : 'Not set'}
              </span>
            </div>
            <div className="border-t border-border my-2"></div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Confidence:</span>
              <span>
                {estimate.confidence != null
                  ? (estimate.confidence * 100).toFixed(0)
                  : '0'}%
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Based on rides:</span>
              <span>{estimate.based_on_rides || 0}</span>
            </div>
          </div>

          {message && (
            <div
              className={`p-2 rounded-md text-sm ${
                message.includes('success')
                  ? 'bg-green-500/10 text-green-500 border border-green-500/20'
                  : 'bg-red-500/10 text-red-500 border border-red-500/20'
              }`}
            >
              {message}
            </div>
          )}

          <Button
            onClick={handleAcceptEstimate}
            disabled={updating}
            className="w-full"
            variant="outline"
          >
            {updating ? 'Updating...' : 'Accept & Update FTP'}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
