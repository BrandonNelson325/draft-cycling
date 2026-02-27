/**
 * Safe local date parsing — never use new Date('YYYY-MM-DD') which is UTC.
 * Always use this helper when parsing date strings from the API.
 */
export function parseLocalDate(dateStr: string): Date {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(year, month - 1, day);
}

/**
 * Format a Date to YYYY-MM-DD in local time.
 */
export function toDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Get today's date as YYYY-MM-DD in local time.
 */
export function getTodayString(): string {
  return toDateString(new Date());
}

/**
 * Check if two date strings (YYYY-MM-DD) represent the same calendar day.
 */
export function isSameDay(a: string, b: string): boolean {
  return a === b;
}

/**
 * Format seconds as h:mm or m:ss
 */
export function formatDuration(seconds: number): string {
  if (seconds >= 3600) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
  }
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}
