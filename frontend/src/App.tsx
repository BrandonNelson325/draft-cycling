import { useState } from 'react';
import { useAuthStore } from './stores/useAuthStore';
import { LoginForm } from './components/auth/LoginForm';
import { RegisterForm } from './components/auth/RegisterForm';
import { BetaAccessForm } from './components/auth/BetaAccessForm';
import { Dashboard } from './components/layout/Dashboard';
import { StravaCallback } from './pages/StravaCallback';

function App() {
  const [showLogin, setShowLogin] = useState(true);
  const user = useAuthStore((state) => state.user);

  // Strava callback route (accessible without full auth)
  if (window.location.pathname === '/strava/callback') {
    return <StravaCallback />;
  }

  // If user is logged in, check for beta access
  if (user) {
    // Check if user has beta access or subscription
    const hasAccess = !!(
      user.beta_access_code ||
      user.subscription_status === 'active' ||
      user.subscription_status === 'trialing'
    );

    // If no access, show beta access form
    if (!hasAccess) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <BetaAccessForm />
        </div>
      );
    }

    // Has access, show dashboard
    return <Dashboard />;
  }

  // Otherwise show auth forms
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold mb-2">🚴 AI Cycling Coach</h1>
          <p className="text-muted-foreground">
            Your personalized AI-powered cycling training companion
          </p>
        </div>

        {showLogin ? (
          <LoginForm onSwitchToRegister={() => setShowLogin(false)} />
        ) : (
          <RegisterForm onSwitchToLogin={() => setShowLogin(true)} />
        )}
      </div>
    </div>
  );
}

export default App;
