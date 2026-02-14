import { useAuthStore } from '../../stores/useAuthStore';
import { authService } from '../../services/authService';
import { Button } from '../ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../ui/card';

export function Dashboard() {
  const user = useAuthStore((state) => state.user);

  const handleLogout = async () => {
    await authService.logout();
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-2xl font-bold">🚴 AI Cycling Coach</h1>
          <div className="flex items-center gap-4">
            <span className="text-sm text-muted-foreground">{user?.email}</span>
            <Button variant="outline" onClick={handleLogout}>
              Logout
            </Button>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Welcome{user?.full_name ? `, ${user.full_name}` : ''}!</CardTitle>
              <CardDescription>Your AI Cycling Coach Dashboard</CardDescription>
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
              <CardTitle>Get Started</CardTitle>
              <CardDescription>Next steps</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 text-sm">
                <li>✅ Create account</li>
                <li>⬜ Subscribe to premium</li>
                <li>⬜ Connect Strava</li>
                <li>⬜ Chat with AI coach</li>
              </ul>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
