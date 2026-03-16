---
name: Training status & chat persistence feedback
description: Critical user feedback from experienced cyclist beta tester about overreaching false positives and chat memory loss
type: feedback
---

Experienced cyclists returning from low volume get incorrectly flagged as "overreaching" because ACWR spikes with a low CTL denominator. Training status must factor in experience level, RPE feedback, and sleep/readiness — not just raw ACWR.

**Why:** Beta tester (advanced cyclist, low recent volume) felt great but app kept saying "overreaching", which made him distrust the training recommendations and prevented him from building a training plan.

**How to apply:** The `determineStatus()` function now accepts a `StatusContext` with experience level, RPE, and readiness. Advanced riders get wider ACWR thresholds and a higher low-CTL guard (40 instead of 15). Always prioritize subjective feedback over pure math for experienced athletes.

---

Chat conversations must persist — defaulting to the most recent conversation instead of creating a new one every time. Preferences like "I don't ride Sundays" must be saved immediately via `update_athlete_preferences` and carried across all future conversations.

**Why:** Beta tester had 10+ conversations that each started from scratch. AI contradicted itself across threads (suggested Sunday workouts after being told no Sundays, said "overreaching" after previously recommending a Friday ride). This made the coach "completely useless" in his words.

**How to apply:** Frontend/mobile now resume the most recent conversation on mount. Message history increased from 10 to 50. System prompt expanded to aggressively save all scheduling/preference info to athlete preferences.
