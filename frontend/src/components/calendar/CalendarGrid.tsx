import { useState } from 'react';
import { CalendarDay } from './CalendarDay';
import { Button } from '../ui/button';

interface Activity {
  id: number;
  start_date: string;
  name: string;
}

interface CalendarGridProps {
  activities: Activity[];
  onDayClick?: (date: Date, activities: Activity[]) => void;
}

export function CalendarGrid({ activities, onDayClick }: CalendarGridProps) {
  const [currentDate, setCurrentDate] = useState(new Date());

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // Get first day of month and calculate grid
  const firstDayOfMonth = new Date(year, month, 1);
  const lastDayOfMonth = new Date(year, month + 1, 0);
  const startDay = firstDayOfMonth.getDay(); // 0 = Sunday

  // Get days from previous month to fill first week
  const daysInPrevMonth = new Date(year, month, 0).getDate();
  const prevMonthDays = Array.from(
    { length: startDay },
    (_, i) => new Date(year, month - 1, daysInPrevMonth - startDay + i + 1)
  );

  // Get days in current month
  const currentMonthDays = Array.from(
    { length: lastDayOfMonth.getDate() },
    (_, i) => new Date(year, month, i + 1)
  );

  // Get days from next month to fill last week
  const remainingDays = 42 - (prevMonthDays.length + currentMonthDays.length);
  const nextMonthDays = Array.from(
    { length: remainingDays },
    (_, i) => new Date(year, month + 1, i + 1)
  );

  const allDays = [...prevMonthDays, ...currentMonthDays, ...nextMonthDays];

  // Group activities by date
  const activitiesByDate = activities.reduce((acc, activity) => {
    const date = new Date(activity.start_date).toDateString();
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(activity);
    return acc;
  }, {} as Record<string, Activity[]>);

  const handlePrevMonth = () => {
    setCurrentDate(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const handleToday = () => {
    setCurrentDate(new Date());
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">
          {monthNames[month]} {year}
        </h2>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handlePrevMonth}>
            ←
          </Button>
          <Button variant="outline" size="sm" onClick={handleToday}>
            Today
          </Button>
          <Button variant="outline" size="sm" onClick={handleNextMonth}>
            →
          </Button>
        </div>
      </div>

      {/* Day names */}
      <div className="grid grid-cols-7 gap-2">
        {dayNames.map((day) => (
          <div key={day} className="text-center text-sm font-medium text-muted-foreground p-2">
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-2">
        {allDays.map((date, index) => {
          const dateString = date.toDateString();
          const dayActivities = activitiesByDate[dateString] || [];
          const isCurrentMonth = date.getMonth() === month;

          return (
            <CalendarDay
              key={index}
              date={date}
              isCurrentMonth={isCurrentMonth}
              hasActivities={dayActivities.length > 0}
              activityCount={dayActivities.length}
              onClick={() => onDayClick?.(date, dayActivities)}
            />
          );
        })}
      </div>
    </div>
  );
}
