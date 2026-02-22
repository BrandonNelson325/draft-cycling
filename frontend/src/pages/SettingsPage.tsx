import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { ProfileEditForm } from '../components/settings/ProfileEditForm';
import { AccountInfo } from '../components/settings/AccountInfo';
import { StravaConnect } from '../components/strava/StravaConnect';

export function SettingsPage() {
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
      </div>
    </div>
  );
}
