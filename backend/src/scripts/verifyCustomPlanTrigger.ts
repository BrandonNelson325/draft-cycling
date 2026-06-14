/**
 * Proves "Create custom plan" reliably starts the plan-setup flow even when a
 * conversation is already active (the bug: the fast-path used to require
 * conversation_id == null, so once the app had auto-selected a recent chat the
 * button silently fell through to the normal AI path).
 *
 * Run: npm run test:custom-plan
 */
import { aiCoachService } from '../services/aiCoachService';

let failures = 0;
function check(label: string, cond: boolean, detail?: string) {
  console.log(`${cond ? '✓ PASS' : '✗ FAIL'}  ${label}${detail ? `  — ${detail}` : ''}`);
  if (!cond) failures++;
}

// If the fast-path is skipped, chatStream would call buildAthleteContext (the
// AI path). Make that throw so we can prove the fast-path short-circuits first.
(aiCoachService as any).buildAthleteContext = async () => {
  throw new Error('AI path reached — fast-path did NOT fire');
};
(aiCoachService as any).persistUserMessage = async () => {};
(aiCoachService as any).persistAssistantMessage = async () => {};

async function run(label: string, conversationId: string | null) {
  const events: Array<Record<string, any>> = [];
  await aiCoachService.chatStream(
    'athlete-1',
    conversationId,
    'I want to create a custom training plan',
    undefined,
    (e) => events.push(e)
  );
  const types = events.map((e) => e.type);
  const text = events.filter((e) => e.type === 'token').map((e) => e.text).join('');
  const startConv = events.find((e) => e.type === 'start')?.conversation_id;

  console.log(`\n--- ${label} ---`);
  check('emits the canned plan-setup intro (fast-path fired, not the AI path)', /build your plan/i.test(text) && /GPX/i.test(text));
  check('does NOT emit an error', !types.includes('error'));
  check('ends with done', types.includes('done'));
  if (conversationId) {
    check('reuses the active conversation (so the mobile UI shows it)', startConv === conversationId, `start conv = ${startConv}`);
  }
}

(async () => {
  console.log('Verifying "Create custom plan" trigger');
  // The reported bug: a conversation is already active.
  await run('Active conversation already set (the broken case)', 'existing-conversation-123');

  console.log(`\n${failures === 0 ? '✅ ALL CHECKS PASSED' : `❌ ${failures} CHECK(S) FAILED`}`);
  process.exit(failures === 0 ? 0 : 1);
})();
