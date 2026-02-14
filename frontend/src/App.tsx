import { useState } from 'react';
import { useAuthStore } from './stores/useAuthStore';
import { LoginForm } from './components/auth/LoginForm';
import { RegisterForm } from './components/auth/RegisterForm';
import { Dashboard } from './components/layout/Dashboard';

function App() {
  const [showLogin, setShowLogin] = useState(true);
  const user = useAuthStore((state) => state.user);

  // If user is logged in, show dashboard
  if (user) {
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
