import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { ProfileEditForm } from '../components/settings/ProfileEditForm';
import { AccountInfo } from '../components/settings/AccountInfo';
import { StravaConnect } from '../components/strava/StravaConnect';
import { WelcomeModal } from '../components/modals/WelcomeModal';
import { useAuthStore } from '../stores/useAuthStore';

export function SettingsPage() {
  const logout = useAuthStore((state) => state.logout);
  const [showGuide, setShowGuide] = useState(false);

  return (
    <div className="container mx-auto p-4 md:p-8 max-w-4xl">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>

      <div className="space-y-6">
        {/* Profile Section */}
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>
              Update your personal information and training metrics
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ProfileEditForm />
          </CardContent>
        </Card>

        {/* Strava Section */}
        <Card>
          <CardHeader>
            <CardTitle>Strava Connection</CardTitle>
            <CardDescription>
              Connect your Strava account to sync activities and training data
            </CardDescription>
          </CardHeader>
          <CardContent>
            <StravaConnect />
          </CardContent>
        </Card>

        {/* Account Section */}
        <Card>
          <CardHeader>
            <CardTitle>Account Information</CardTitle>
            <CardDescription>
              View your account details and subscription status
            </CardDescription>
          </CardHeader>
          <CardContent>
            <AccountInfo />
          </CardContent>
        </Card>

        {/* App Guide */}
        <Button
          variant="outline"
          className="w-full"
          onClick={() => setShowGuide(true)}
        >
          App Guide
        </Button>

        {/* Logout */}
        <Button
          variant="outline"
          className="w-full text-red-600 border-red-200 hover:bg-red-50 hover:text-red-700"
          onClick={logout}
        >
          Log Out
        </Button>
      </div>

      {showGuide && (
        <WelcomeModal onClose={() => setShowGuide(false)} showWelcome={false} />
      )}
    </div>
  );
}
