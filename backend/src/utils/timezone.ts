/**
 * Get today's date string (YYYY-MM-DD) in the given IANA timezone.
 */
export function todayInTimezone(tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
  } catch {
    return new Date().toISOString().split('T')[0];
  }
}

/**
 * Convert a UTC ISO date string to a local YYYY-MM-DD in the given timezone.
 * Useful for grouping UTC-stored activities by their local calendar day.
 */
export function utcToLocalDate(utcDateStr: string, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date(utcDateStr));
  } catch {
    return new Date(utcDateStr).toISOString().split('T')[0];
  }
}

/**
 * Get the Monday (week start) for a local YYYY-MM-DD date string.
 * Returns YYYY-MM-DD of the Monday for that week (Mon–Sun).
 */
export function mondayOfWeek(localDateStr: string): string {
  // Parse as local noon to avoid DST issues
  const [y, m, d] = localDateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const day = date.getUTCDay(); // 0=Sun, 1=Mon, ...
  const diffToMonday = day === 0 ? 6 : day - 1;
  date.setUTCDate(date.getUTCDate() - diffToMonday);
  return date.toISOString().split('T')[0];
}

/**
 * Get the Monday of the current week in the athlete's timezone.
 */
export function weekStartInTimezone(tz: string): string {
  const today = todayInTimezone(tz);
  return mondayOfWeek(today);
}

/**
 * Get the 1st of the current month in the athlete's timezone.
 */
export function monthStartInTimezone(tz: string): string {
  const today = todayInTimezone(tz);
  return today.substring(0, 8) + '01';
}

/**
 * Convert a local date (YYYY-MM-DD) + timezone into a UTC start/end range.
 *
 * Example: localDayToUTCRange('2026-03-04', 'America/Denver')
 *   → { start: '2026-03-04T07:00:00.000Z', end: '2026-03-05T06:59:59.000Z' }
 *
 * This lets us query a TIMESTAMPTZ column for "all events that happened
 * on March 4 in the athlete's local timezone".
 */
export function localDayToUTCRange(dateStr: string, tz: string): { start: string; end: string } {
  // Use noon UTC as a reference point to compute the timezone offset
  const noon = new Date(dateStr + 'T12:00:00Z');

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(noon);

  const localHour = parseInt(parts.find(p => p.type === 'hour')?.value || '12');
  const localMinute = parseInt(parts.find(p => p.type === 'minute')?.value || '0');

  // Offset in minutes: how far ahead local time is from UTC
  // e.g. America/Denver (UTC-7): localHour=5 → (5*60+0) - 720 = -420
  // e.g. Asia/Kolkata (UTC+5:30): localHour=17,min=30 → (17*60+30) - 720 = +330
  const offsetMinutes = (localHour * 60 + localMinute) - 720;

  // Midnight local in UTC: subtract the offset from midnight UTC
  const startUTC = new Date(dateStr + 'T00:00:00Z');
  startUTC.setMinutes(startUTC.getMinutes() - offsetMinutes);

  const endUTC = new Date(dateStr + 'T23:59:59Z');
  endUTC.setMinutes(endUTC.getMinutes() - offsetMinutes);

  return {
    start: startUTC.toISOString(),
    end: endUTC.toISOString(),
  };
}
