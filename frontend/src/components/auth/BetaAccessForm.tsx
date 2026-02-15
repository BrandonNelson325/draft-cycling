import { useState } from 'react';
import { betaService } from '../../services/betaService';
import { authService } from '../../services/authService';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

export function BetaAccessForm() {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess(false);
    setLoading(true);

    try {
      await betaService.activateBetaAccess(code);
      setSuccess(true);

      // Refresh user profile to get updated beta access
      await authService.getProfile();

      // Give user a moment to see success message
      setTimeout(() => {
        window.location.reload();
      }, 1500);
    } catch (err: any) {
      setError(err.message || 'Failed to activate beta access');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>Beta Access Required</CardTitle>
        <CardDescription>
          Enter your beta access code to start using AI Cycling Coach
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 text-sm text-red-600 bg-red-50 rounded-md">
              {error}
            </div>
          )}

          {success && (
            <div className="p-3 text-sm text-green-600 bg-green-50 rounded-md">
              Beta access activated! Redirecting...
            </div>
          )}

          <div className="space-y-2">
            <label htmlFor="code" className="text-sm font-medium">
              Beta Access Code
            </label>
            <Input
              id="code"
              type="text"
              placeholder="Enter your code"
              value={code}
              onChange={(e) => setCode(e.target.value.toUpperCase())}
              required
              disabled={loading || success}
              className="font-mono"
            />
            <p className="text-xs text-muted-foreground">
              Don't have a code? Contact us to request early access.
            </p>
          </div>

          <Button type="submit" className="w-full" disabled={loading || success}>
            {loading ? 'Activating...' : success ? 'Activated!' : 'Activate Beta Access'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
