import { useState } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/useAuthStore';
import { LoginForm } from './components/auth/LoginForm';
import { RegisterForm } from './components/auth/RegisterForm';
import { BetaAccessForm } from './components/auth/BetaAccessForm';
import { AppLayout } from './components/layout/AppLayout';
import { DashboardPage } from './pages/DashboardPage';
import { WorkoutsPage } from './pages/WorkoutsPage';
import { CalendarPage } from './pages/CalendarPage';
import { ChatPage } from './pages/ChatPage';
import { SettingsPage } from './pages/SettingsPage';
import { StravaCallback } from './pages/StravaCallback';
import { TrainingPlanPage } from './pages/TrainingPlanPage';
import { DailyMorningModal } from './components/modals/DailyMorningModal';
import { PostRideModal } from './components/modals/PostRideModal';
import { useDailyMorning } from './hooks/useDailyMorning';
import { useNewActivities } from './hooks/useNewActivities';

function ProtectedRoutes() {
  const user = useAuthStore((state) => state.user);
  const { shouldShow, analysis, readiness, dismiss } = useDailyMorning();
  const { activities, currentIndex, acknowledge, skip } = useNewActivities();
  const currentActivity = activities[currentIndex] ?? null;

  // Check if user has beta access or subscription
  const hasAccess = !!(
    user?.beta_access_code ||
    user?.subscription_status === 'active' ||
    user?.subscription_status === 'trialing'
  );

  // If no access, show beta access form
  if (!hasAccess) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <BetaAccessForm />
      </div>
    );
  }

  // Has access, show app with routing
  return (
    <>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/workouts" element={<WorkoutsPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/training-plan" element={<TrainingPlanPage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/chat/:conversationId" element={<ChatPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      {/* Morning modal — only shows when user hasn't checked in today */}
      {shouldShow && readiness && (
        <DailyMorningModal
          analysis={analysis}
          readiness={readiness}
          onClose={dismiss}
        />
      )}

      {/* Post-ride modal — only shows when morning modal is not active */}
      {!shouldShow && currentActivity && (
        <PostRideModal
          activity={currentActivity}
          displayMode={user?.display_mode ?? 'advanced'}
          onAcknowledge={acknowledge}
          onSkip={skip}
          activityNumber={currentIndex + 1}
          totalActivities={activities.length}
        />
      )}
    </>
  );
}

function AuthScreen() {
  const [showLogin, setShowLogin] = useState(true);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <img src="/logo.png" alt="Draft" className="h-32" />
          </div>
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

function App() {
  const user = useAuthStore((state) => state.user);

  return (
    <Routes>
      {/* Strava callback route (accessible without full auth) */}
      <Route path="/strava/callback" element={<StravaCallback />} />

      {/* Protected routes if user is logged in */}
      {user ? (
        <Route path="*" element={<ProtectedRoutes />} />
      ) : (
        <Route path="*" element={<AuthScreen />} />
      )}
    </Routes>
  );
}

export default App;
