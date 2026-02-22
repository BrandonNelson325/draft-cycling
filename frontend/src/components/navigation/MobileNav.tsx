import { Link, useLocation } from 'react-router-dom';
import { DashboardIcon } from '../icons/DashboardIcon';
import { CalendarIcon } from '../icons/CalendarIcon';
import { ChatIcon } from '../icons/ChatIcon';
import { SettingsIcon } from '../icons/SettingsIcon';
import { TrainingPlanIcon } from '../icons/TrainingPlanIcon';

interface MobileNavProps {
  className?: string;
}

export function MobileNav({ className = '' }: MobileNavProps) {
  const location = useLocation();

  const navItems = [
    { path: '/', label: 'Dashboard', Icon: DashboardIcon },
    { path: '/calendar', label: 'Calendar', Icon: CalendarIcon },
    { path: '/training-plan', label: 'Plan', Icon: TrainingPlanIcon },
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
    <nav className={`fixed bottom-0 left-0 right-0 z-50 h-16 bg-background border-t border-border ${className}`}>
      <div className="flex h-full items-center justify-around backdrop-blur-xl bg-background/95">
        {navItems.map(({ path, label, Icon }) => {
          const active = isActive(path);
          return (
            <Link
              key={path}
              to={path}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                active ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <div className={`flex flex-col items-center ${active ? 'border-t-2 border-primary pt-1' : 'pt-2'}`}>
                <Icon className="w-6 h-6" />
                <span className="text-xs mt-1">{label}</span>
              </div>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
