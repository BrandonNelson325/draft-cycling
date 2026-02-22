import { useEffect, useState } from 'react';
import { useAuthStore } from '../../stores/useAuthStore';
import { authService } from '../../services/authService';
import { stravaService } from '../../services/stravaService';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';
import { StravaConnect } from '../strava/StravaConnect';

export function Dashboard() {
  const user = useAuthStore((state) => state.user);
  const [stravaConnected, setStravaConnected] = useState(false);

  useEffect(() => {
    const checkStravaStatus = async () => {
      try {
        const status = await stravaService.getConnectionStatus() as any;
        setStravaConnected(status?.connected || false);
      } catch (error) {
        console.error('Failed to check Strava status:', error);
      }
    };

    checkStravaStatus();
  }, []);

  const handleLogout = async () => {
    await authService.logout();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <img src="/logo.png" alt="Draft" className="h-12" />
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user?.email}</span>
            <Button variant="outline" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 mb-6">
          <Card>
            <CardHeader>
              <CardTitle>Welcome{user?.full_name ? `, ${user.full_name}` : ''}!</CardTitle>
              <CardDescription>Your Draft Dashboard</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                Complete your profile to get started with personalized coaching.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Profile Setup</CardTitle>
              <CardDescription>Add your cycling metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">FTP:</span>
                  <span>{user?.ftp ? `${user.ftp}W` : 'Not set'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Weight:</span>
                  <span>{user?.weight_kg ? `${user.weight_kg}kg` : 'Not set'}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Access Status</CardTitle>
              <CardDescription>Your account type</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {user?.beta_access_code && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                    <div className="flex items-center gap-2">
                      <span className="text-blue-700 font-semibold">🧪 Beta Tester</span>
                    </div>
                    <p className="text-xs text-blue-600 mt-1">
                      Full access enabled
                    </p>
                  </div>
                )}
                <ul className="space-y-2 text-sm">
                  <li>✅ Create account</li>
                  <li>✅ Beta access activated</li>
                  <li>{stravaConnected ? '✅' : '⬜'} Connect Strava</li>
                  <li>⬜ Chat with AI coach</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Strava Connection */}
        <div className="max-w-2xl">
          <StravaConnect />
        </div>
      </main>
    </div>
  );
}
