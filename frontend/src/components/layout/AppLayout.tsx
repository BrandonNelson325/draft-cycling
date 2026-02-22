import { Outlet } from 'react-router-dom';
import { DesktopNav } from '../navigation/DesktopNav';
import { MobileNav } from '../navigation/MobileNav';

export function AppLayout() {
  return (
    <div className="min-h-screen bg-gray-50">
      <DesktopNav className="hidden md:block" />
      <main className="pb-16 md:pb-0">
        <Outlet />
      </main>
      <MobileNav className="md:hidden" />
    </div>
  );
}
