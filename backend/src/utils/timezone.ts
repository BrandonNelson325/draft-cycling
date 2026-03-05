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
