import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { ProfileEditForm } from '../components/settings/ProfileEditForm';
import { AccountInfo } from '../components/settings/AccountInfo';
import { StravaConnect } from '../components/strava/StravaConnect';
import { IntervalsIcuConnect } from '../components/settings/IntervalsIcuConnect';
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

        {/* Intervals.icu Section */}
        <Card>
          <CardHeader>
            <CardTitle>Intervals.icu</CardTitle>
            <CardDescription>
              Sync workouts to your head unit (Garmin, Wahoo, and more) or training platform (Zwift, Rouvy, and more) via Intervals.icu. Create a free account at intervals.icu and connect your devices there.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <IntervalsIcuConnect />
          </CardContent>
        </Card>

        {/* Wahoo Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <img src="/wahoo-logo.svg" alt="Wahoo" className="w-6 h-6" />
              <div>
                <CardTitle>Wahoo</CardTitle>
                <CardDescription>Push structured workouts to your Wahoo ELEMNT head unit</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button disabled className="bg-gray-600 text-white opacity-60 cursor-not-allowed">
              Connect Wahoo
            </Button>
            <p className="text-xs text-muted-foreground mt-2">Coming soon — connect to Intervals.icu above to sync workouts to your Wahoo head unit now.</p>
          </CardContent>
        </Card>

        {/* Garmin Section */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <img src="/garmin-logo.svg" alt="Garmin" className="w-6 h-6" />
              <div>
                <CardTitle>Garmin</CardTitle>
                <CardDescription>Sync workouts to your Garmin device</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Button disabled className="bg-gray-600 text-white opacity-60 cursor-not-allowed">
              Connect Garmin
            </Button>
            <p className="text-xs text-muted-foreground mt-2">Coming soon — connect to Intervals.icu above to sync workouts to your Garmin device now.</p>
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
