/**
 * WHOOP Brand & Design Guidelines (developer.whoop.com/docs/developing/design-guidelines):
 * Recovery uses WHOOP's exact band colours, and WHOOP data is attributed
 * ("Data by WHOOP"). Their reviewers check this before raising the API limit.
 */
export const WHOOP_RECOVERY_GREEN = '#16EC06'; // 67–100%
export const WHOOP_RECOVERY_YELLOW = '#FFDE00'; // 34–66%
export const WHOOP_RECOVERY_RED = '#FF0026'; // 0–33%

export const whoopRecoveryColor = (r: number): string =>
  r >= 67 ? WHOOP_RECOVERY_GREEN : r >= 34 ? WHOOP_RECOVERY_YELLOW : WHOOP_RECOVERY_RED;

export const WHOOP_ATTRIBUTION = 'Data by WHOOP';
