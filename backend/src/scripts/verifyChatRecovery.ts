/**
 * Standalone verification for the chatStream graceful-recovery fix.
 *
 * Reproduces the failure from the screenshots: a plan build throws mid-turn.
 * Before the fix, chatStream emitted {type:'error'} and re-threw, and the
 * mobile client wiped the whole turn → "it looked like it never tried".
 *
 * All error paths in chatStream funnel through ONE outer catch, so forcing a
 * throw anywhere after convId is set exercises the exact recovery code that the
 * real tool-loop timeout hits. We force it via buildAthleteContext (no need to
 * mock the Anthropic SDK or Supabase — we override the service's own methods).
 *
 * Run: SUPABASE_URL=https://x.supabase.co SUPABASE_ANON_KEY=a \
 *      SUPABASE_SERVICE_ROLE_KEY=b ANTHROPIC_API_KEY=c \
 *      npx ts-node src/scripts/verifyChatRecovery.ts
 */
import { aiCoachService } from '../services/aiCoachService';

let failures = 0;
function check(label: string, cond: boolean) {
  console.log(`${cond ? '✓ PASS' : '✗ FAIL'}  ${label}`);
  if (!cond) failures++;
}

async function runCase(opts: {
  name: string;
  jobPending: boolean;
  expectInMessage: RegExp;
}) {
  console.log(`\n--- Case: ${opts.name} ---`);

  // Force a throw partway through the turn (stands in for the tool-loop /
  // AI-call timeout that was nuking the conversation).
  (aiCoachService as any).buildAthleteContext = async () => {
    throw new Error('AI response timed out after 120s (simulated)');
  };
  // Simulate whether a background plan job had already been enqueued.
  (aiCoachService as any).hasRecentPlanJob = async () => opts.jobPending;

  // Capture what would be written to the DB instead of hitting Supabase.
  const persisted: string[] = [];
  (aiCoachService as any).persistUserMessage = async () => {};
  (aiCoachService as any).persistAssistantMessage = async (
    _convId: string,
    _athleteId: string,
    content: string
  ) => {
    persisted.push(content);
  };
  (aiCoachService as any).maybeGenerateTitle = async () => {};

  const events: Array<Record<string, any>> = [];
  let threw = false;
  try {
    // Pass an existing conversationId so convId is set from the start (the
    // realistic case — the user is mid-conversation building a plan).
    await aiCoachService.chatStream(
      'athlete-1',
      'conversation-1',
      'build me a training plan for my race',
      undefined,
      (e) => events.push(e)
    );
  } catch {
    threw = true;
  }

  const types = events.map((e) => e.type);
  const tokenText = events
    .filter((e) => e.type === 'token')
    .map((e) => e.text)
    .join('');

  check('chatStream resolves (does NOT re-throw → controller won\'t send 500)', !threw);
  check('emits "done" (client commits the message instead of wiping)', types.includes('done'));
  check('does NOT emit "error" (the wipe trigger)', !types.includes('error'));
  check('persists exactly one assistant message (survives refresh)', persisted.length === 1);
  check(
    `persisted message matches expected recovery copy (${opts.expectInMessage})`,
    persisted.length === 1 && opts.expectInMessage.test(persisted[0])
  );
  check('streamed token text equals persisted message (UI === DB)', tokenText.trim() === (persisted[0] || '').trim());

  console.log(`   events: [${types.join(', ')}]`);
  console.log(`   persisted: ${JSON.stringify(persisted[0] || null)}`);
}

(async () => {
  console.log('Verifying chatStream graceful-recovery (the "vanishing turn" fix)\n');

  await runCase({
    name: 'Plan job WAS enqueued before the failure',
    jobPending: true,
    expectInMessage: /background/i,
  });

  await runCase({
    name: 'Failure before any job was enqueued',
    jobPending: false,
    expectInMessage: /snag|didn't change|go ahead/i,
  });

  console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})();
