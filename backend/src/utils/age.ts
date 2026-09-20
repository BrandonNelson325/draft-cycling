/**
 * Age helpers for age-aware ("masters") coaching.
 *
 * We deliberately reason from the athlete's ACTUAL date of birth and, where
 * available, their measured max HR — not the 220-age formula. Age shifts
 * recovery needs, sustainable hard-day frequency, and taper length; the model
 * uses these as guidance, not hardcoded zones.
 */

/** Whole years from a YYYY-MM-DD (or ISO) date of birth. Null if unusable. */
export function ageFromDob(dob: string | null | undefined): number | null {
  if (!dob) return null;
  const birth = new Date(String(dob).slice(0, 10) + 'T12:00:00');
  if (isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const m = now.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
  // Sanity clamp — reject obviously bad data (future DOB, implausible age).
  if (age < 5 || age > 110) return null;
  return age;
}

/** Coarse masters band used to tune the coaching guidance. */
export function mastersBand(age: number | null): 'none' | 'masters' | 'masters50' | 'masters60' {
  if (age == null) return 'none';
  if (age >= 60) return 'masters60';
  if (age >= 50) return 'masters50';
  if (age >= 45) return 'masters';
  return 'none';
}

/**
 * A short, prompt-ready coaching block for the athlete's age band. Returns ''
 * for non-masters athletes so younger riders' prompts are unchanged.
 */
export function mastersGuidance(age: number | null): string {
  const band = mastersBand(age);
  if (band === 'none') return '';

  const common = `AGE-AWARE COACHING (athlete is ${age}):
- Prioritize recovery: masters athletes clear fatigue from high-intensity work more slowly. Avoid stacking hard days unless clearly intentional, and prefer an extra easy/recovery day over an extra hard one when in doubt.
- Keep the aerobic base large: bias volume toward Z2 endurance and reserve high-intensity for focused, high-quality doses rather than frequent hard efforts.
- Watch readiness signals (HRV, resting HR, sleep, RPE) more closely and back off sooner when they trend poorly.
- Lengthen tapers slightly and protect the day(s) before hard sessions.`;

  if (band === 'masters') {
    return common + `\n- At 45+, most athletes handle 2 genuinely hard days/week well; add a third only with strong recovery evidence.\n`;
  }
  if (band === 'masters50') {
    return common + `\n- At 50+, cap hard days around 2/week and put at least one easy or rest day between them. Recovery weeks should be genuinely light.\n`;
  }
  // masters60
  return common + `\n- At 60+, generally cap hard days at ~2/week (often 1–2), always separated by easy/rest days, and extend recovery between intensity blocks. Favor durability and consistency over peak intensity volume.\n`;
}
