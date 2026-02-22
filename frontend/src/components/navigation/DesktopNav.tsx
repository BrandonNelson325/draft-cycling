import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../stores/useAuthStore';
import { DashboardIcon } from '../icons/DashboardIcon';
import { WorkoutsIcon } from '../icons/WorkoutsIcon';
import { CalendarIcon } from '../icons/CalendarIcon';
import { ChatIcon } from '../icons/ChatIcon';
import { SettingsIcon } from '../icons/SettingsIcon';
import { TrainingPlanIcon } from '../icons/TrainingPlanIcon';

interface DesktopNavProps {
  className?: string;
}

export function DesktopNav({ className = '' }: DesktopNavProps) {
  const location = useLocation();
  const { user, logout } = useAuthStore();

  const navItems = [
    { path: '/', label: 'Dashboard', Icon: DashboardIcon },
    { path: '/workouts', label: 'Workouts', Icon: WorkoutsIcon },
    { path: '/calendar', label: 'Calendar', Icon: CalendarIcon },
    { path: '/training-plan', label: 'Training Plan', Icon: TrainingPlanIcon },
    { path: '/chat', label: 'Chat', Icon: ChatIcon },
    { path: '/settings', label: 'Settings', Icon: SettingsIcon },
  ];

  const isActive = (path: string) => {
    if (path === '/') {
      return location.pathname === '/';
    }
    return location.pathname.startsWith(path);
  };

  return (
    <nav className={`h-16 bg-white border-b border-border ${className}`}>
      <div className="container mx-auto h-full px-6 flex items-center justify-between">
        {/* Logo */}
        <Link to="/" className="flex items-center gap-2">
          <img src="/logo.png" alt="Draft" className="h-8" />
        </Link>

        {/* Nav Items */}
        <div className="flex items-center gap-1 h-full">
          {navItems.map(({ path, label, Icon }) => {
            const active = isActive(path);
            return (
              <Link
                key={path}
                to={path}
                className={`relative flex items-center gap-2 px-6 h-full transition-colors ${
                  active
                    ? 'text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Icon className="w-5 h-5" />
                <span className="font-medium">{label}</span>
                {active && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary rounded-t-sm" />
                )}
              </Link>
            );
          })}
        </div>

        {/* User Menu */}
        <div className="flex items-center gap-4">
          <span className="text-sm font-medium text-foreground">
            {user?.full_name || user?.email}
          </span>
          <button
            onClick={logout}
            className="text-sm text-muted-foreground hover:text-foreground transition-colors font-medium"
          >
            Logout
          </button>
        </div>
      </div>
    </nav>
  );
}
