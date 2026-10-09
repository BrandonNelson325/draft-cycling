/**
 * Turn stored WHOOP days into what the COACH needs: the band, the trend, sleep
 * vs need, and non-ride load. Whoop measures the body; Draft decides the
 * training — this is the bridge. Pure + exported for tests.
 */
export interface WellnessDay {
  date: string;
  wellness_source?: string | null;
  readiness_score?: number | null; // Whoop recovery %
  hrv?: number | null;
  rhr?: number | null;
  sleep_seconds?: number | null;
  sleep_need_seconds?: number | null;
  sleep_debt_seconds?: number | null;
  day_strain?: number | string | null;
  recovery_calibrating?: boolean | null;
  other_activities?: { sport: string; minutes: number; strain: number | null; start?: string }[] | null;
}

export type RecoveryBand = 'green' | 'yellow' | 'red';
export const bandFor = (recovery: number): RecoveryBand => (recovery >= 67 ? 'green' : recovery >= 34 ? 'yellow' : 'red');

const hm = (sec: number) => `${Math.floor(sec / 3600)}h${String(Math.round((sec % 3600) / 60)).padStart(2, '0')}`;

export interface WhoopSummary {
  hasToday: boolean;
  band: RecoveryBand | null;
  consecutiveReds: number;
  /** RED that the other signals don't support (good sleep, normal RHR, green
   *  yesterday, light day) — likely a loose strap / bad read. Ask, don't assume. */
  suspect: boolean;
  /** One line for the LIVE STATE snapshot. */
  line: string;
}

export function summarizeWhoop(todayIso: string, history: WellnessDay[], stravaOtherStarts: string[] = []): WhoopSummary {
  const seenOnStrava = (start?: string) => !!start && stravaOtherStarts.some((s) =>
    Math.abs(new Date(s).getTime() - new Date(start).getTime()) <= 45 * 60_000);
  const byDate = new Map(history.map((d) => [d.date, d]));
  const today = byDate.get(todayIso);
  const whoopDays = history.filter((d) => d.wellness_source === 'whoop' && d.readiness_score != null)
    .sort((a, b) => b.date.localeCompare(a.date)); // newest first

  const yIso = new Date(new Date(todayIso + 'T12:00:00Z').getTime() - 86_400_000).toISOString().slice(0, 10);
  const yesterday = byDate.get(yIso);
  // Strava's copy (with HR, distance and a load rating) wins over Whoop's.
  const yOther = (yesterday?.other_activities || []).filter((a: any) => a && !seenOnStrava(a.start));
  const otherTxt = yOther.length
    ? ` Yesterday off the bike: ${yOther.map((a) => `${a.sport} ${a.minutes}min${a.strain != null ? ` (strain ${a.strain})` : ''}`).join(', ')}.`
    : '';

  const hasToday = !!today && today.wellness_source === 'whoop' && today.readiness_score != null;
  if (!hasToday) {
    return {
      hasToday: false, band: null, consecutiveReds: 0, suspect: false,
      line: `- Whoop: no recovery scored yet today (not synced, strap off, or still processing) — coach from training load and how the athlete says they feel; don't invent a recovery number.${otherTxt}`,
    };
  }

  const rec = today!.readiness_score as number;
  const band = bandFor(rec);
  let consecutiveReds = 0;
  for (const d of whoopDays) { if (bandFor(d.readiness_score as number) === 'red') consecutiveReds++; else break; }

  const parts: string[] = [`recovery ${rec}% (${band.toUpperCase()})`];
  if (today!.recovery_calibrating) parts.push('still calibrating — treat as low confidence');

  // HRV vs the athlete's prior-7-day average (excluding today).
  const prior = whoopDays.filter((d) => d.date < todayIso && d.hrv != null).slice(0, 7);
  if (today!.hrv != null) {
    if (prior.length >= 3) {
      const avg = prior.reduce((s, d) => s + (d.hrv as number), 0) / prior.length;
      const pct = Math.round(((today!.hrv - avg) / avg) * 100);
      parts.push(`HRV ${today!.hrv}ms (${pct >= 0 ? '+' : ''}${pct}% vs 7-day avg ${Math.round(avg)})`);
    } else parts.push(`HRV ${today!.hrv}ms`);
  }
  if (today!.rhr != null) parts.push(`RHR ${today!.rhr}`);

  // Last 3 recoveries as a trend.
  const last3 = whoopDays.slice(0, 3).map((d) => d.readiness_score).reverse();
  if (last3.length >= 2) parts.push(`3-day recovery ${last3.join('→')}%`);
  if (consecutiveReds >= 2) parts.push(`${consecutiveReds} RED days in a row`);

  // RED that nothing else supports → likely a strap/data issue. Needs ALL of:
  // green yesterday, sleep ≥ 85% of need, resting HR within 4 bpm of its recent
  // average, and no big non-ride load yesterday.
  const priorRhr = whoopDays.filter((d) => d.date < todayIso && d.rhr != null).slice(0, 7);
  const rhrAvg = priorRhr.length >= 3 ? priorRhr.reduce((s, d) => s + (d.rhr as number), 0) / priorRhr.length : null;
  const yesterdayGreen = yesterday?.wellness_source === 'whoop' && yesterday.readiness_score != null && bandFor(yesterday.readiness_score) === 'green';
  const sleptOk = today!.sleep_seconds != null && !!today!.sleep_need_seconds && today!.sleep_seconds >= 0.85 * today!.sleep_need_seconds;
  const rhrNormal = today!.rhr != null && rhrAvg != null && today!.rhr <= rhrAvg + 4;
  const lightYesterday = !yOther.some((a) => (a.strain ?? 0) >= 12);
  const suspect = band === 'red' && yesterdayGreen && sleptOk && rhrNormal && lightYesterday;

  if (today!.sleep_seconds != null) {
    const need = today!.sleep_need_seconds;
    parts.push(`sleep ${hm(today!.sleep_seconds)}${need ? ` of ${hm(need)} needed` : ''}${today!.sleep_debt_seconds ? `, sleep debt ${hm(today!.sleep_debt_seconds)}` : ''}`);
  }

  const suspectTxt = suspect
    ? ' ⚠ This RED is not supported by the other signals (green yesterday, enough sleep, normal resting HR) — possibly a loose strap or bad read. CHECK with the athlete before recommending any change.'
    : '';
  return { hasToday: true, band, consecutiveReds, suspect, line: `- Whoop: ${parts.join('; ')}.${otherTxt}${suspectTxt}` };
}

/** System-prompt rules — only included when the athlete has Whoop connected. */
export const WHOOP_COACHING_RULES = `**WHOOP (the athlete's recovery source):**
Whoop MEASURES the body (recovery, HRV, sleep, non-ride strain). YOU make the training decisions — combine Whoop with training load (CTL/ATL/TSB), the plan, and how important today's session is. Use Whoop's numbers as-is; never re-derive your own recovery score.
- NEVER change the plan automatically because of Whoop. ALWAYS SUGGEST, with the reason, and respect the athlete's call — straps get loose or misplaced, and a rider who feels good can still do the work. Phrase Whoop-based calls as strong recommendations ("I'd skip the VO2 today — here's why"), not orders, and say they can override. A concrete alternative is great; propose it and wait for their OK. Offer a fallback: "start it, and if the first rep feels off, cut to Z2."
- GREEN (67–100): go as planned; on a key day it's fine to push the top end.
- YELLOW (34–66): do it, but suggest shortening or capping a hard session (e.g. drop a rep, hold the low end of the range). Mid-block on purpose (stage-race block)? Usually train through.
- RED (0–33): make a STRONG recommendation (Z2 or rest on a non-key day; on a race or critical session keep it, warm up longer, set honest expectations). Two or more REDs in a row → strongly recommend backing off. Then ASK before changing anything: propose the change and wait for their yes — never assume it.
- RED THAT DOESN'T ADD UP (flagged ⚠ in LIVE STATE: green yesterday, enough sleep, normal resting HR) → likely a loose strap or bad read. Don't assume a change is needed: ask ONE quick check first ("Whoop shows 24%, but your sleep and resting HR look normal — how do the legs feel?"), then make the call from their answer.
- Trend beats one day: a single red after a late night ≠ a falling HRV trend over several days. Mention which one it is.
- Sleep debt / short sleep before a long or hard session → suggest trimming duration or intensity.
- Non-ride activities (soccer, gym, runs) are real load the power data can't see — account for them when judging the next day.
- Still calibrating (first days on Whoop) → low confidence; lean on how they feel.
- No Whoop recovery today → say so plainly and coach from load + how they feel. Never invent a number.`;
