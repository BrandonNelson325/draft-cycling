/**
 * Registration endpoint smoke test.
 *
 *   npx ts-node scripts/test-register.ts              # local backend (http://localhost:3000)
 *   npx ts-node scripts/test-register.ts --prod       # api.draftcycling.com
 *   npx ts-node scripts/test-register.ts --url=...    # custom URL
 *   npx ts-node scripts/test-register.ts --cleanup    # delete ALL leftover test-register-* users and exit
 *
 * Every created test user uses the email prefix TEST_EMAIL_PREFIX so cleanup
 * can always find and purge them, even if a previous run crashed.
 */

import axios, { AxiosError } from 'axios';
import { supabaseAdmin } from '../src/utils/supabase';

const TEST_EMAIL_PREFIX = 'test-register-';
const TEST_EMAIL_DOMAIN = '@cyclingcoach-test.invalid';

const args = process.argv.slice(2);
const CLEANUP_ONLY = args.includes('--cleanup');
const USE_PROD = args.includes('--prod');
const customUrl = args.find(a => a.startsWith('--url='))?.split('=')[1];
const API_URL = customUrl || (USE_PROD ? 'https://api.draftcycling.com' : 'http://localhost:3000');

type Case = {
  name: string;
  body: any;
  expectStatus: number;
  expectErrorIncludes?: string;
};

const createdIds: string[] = [];

function uniqueEmail(label: string): string {
  const stamp = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  return `${TEST_EMAIL_PREFIX}${label}-${stamp}${TEST_EMAIL_DOMAIN}`;
}

async function postRegister(body: any): Promise<{ status: number; data: any }> {
  try {
    const res = await axios.post(`${API_URL}/api/auth/register`, body, {
      timeout: 30_000,
      validateStatus: () => true,
    });
    return { status: res.status, data: res.data };
  } catch (err) {
    const ax = err as AxiosError;
    if (ax.response) return { status: ax.response.status, data: ax.response.data };
    throw err;
  }
}

async function runCase(c: Case): Promise<boolean> {
  const { status, data } = await postRegister(c.body);
  const statusOk = status === c.expectStatus;
  const body = typeof data === 'object' ? data : {};
  const errMsg: string = body?.error || body?.message || '';
  const errOk = c.expectErrorIncludes
    ? errMsg.toLowerCase().includes(c.expectErrorIncludes.toLowerCase())
    : true;

  if (body?.user?.id) createdIds.push(body.user.id);

  const ok = statusOk && errOk;
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(
    `[${mark}] ${c.name} — got ${status}${errMsg ? ` "${errMsg}"` : ''}` +
      (ok ? '' : ` (expected ${c.expectStatus}${c.expectErrorIncludes ? ` containing "${c.expectErrorIncludes}"` : ''})`)
  );
  return ok;
}

async function runBurst(n: number): Promise<{ pass: number; fail: number }> {
  const emails = Array.from({ length: n }, (_, i) => uniqueEmail(`burst${i}`));
  const results = await Promise.all(
    emails.map(email =>
      postRegister({ email, password: 'testpass123', timezone: 'America/Los_Angeles' })
    )
  );
  let pass = 0;
  for (const r of results) {
    if (r.data?.user?.id) createdIds.push(r.data.user.id);
    if (r.status === 201 && r.data?.session?.access_token) pass++;
  }
  const fail = n - pass;
  console.log(`[${fail === 0 ? 'PASS' : 'FAIL'}] burst x${n} — ${pass}/${n} succeeded`);
  return { pass, fail };
}

async function cleanupTracked() {
  if (createdIds.length === 0) return;
  console.log(`\nCleaning up ${createdIds.length} tracked test users...`);
  const results = await Promise.allSettled(
    createdIds.map(id => supabaseAdmin.auth.admin.deleteUser(id))
  );
  const failed = results.filter(r => r.status === 'rejected' || (r as any).value?.error).length;
  console.log(`  deleted ${createdIds.length - failed}/${createdIds.length}`);
}

async function cleanupAll() {
  console.log(`Scanning Supabase auth for leftover ${TEST_EMAIL_PREFIX}* users...`);
  let page = 1;
  const toDelete: string[] = [];
  // listUsers is paginated; walk until empty.
  // supabase-js caps perPage at 1000.
  while (true) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) {
      console.error(`listUsers failed page=${page}: ${error.message}`);
      break;
    }
    const users = data?.users || [];
    for (const u of users) {
      if (u.email?.startsWith(TEST_EMAIL_PREFIX)) toDelete.push(u.id);
    }
    if (users.length < 1000) break;
    page++;
  }
  console.log(`Found ${toDelete.length} leftover test users.`);
  if (toDelete.length === 0) return;
  const results = await Promise.allSettled(
    toDelete.map(id => supabaseAdmin.auth.admin.deleteUser(id))
  );
  const failed = results.filter(r => r.status === 'rejected' || (r as any).value?.error).length;
  console.log(`Deleted ${toDelete.length - failed}/${toDelete.length}.`);
}

async function main() {
  if (CLEANUP_ONLY) {
    await cleanupAll();
    return;
  }

  console.log(`Testing ${API_URL}/api/auth/register\n`);

  // Sanity-check server is up
  try {
    await axios.get(`${API_URL}/health`, { timeout: 5000 });
  } catch (e: any) {
    console.error(`Cannot reach ${API_URL}/health — is the server running? ${e.message}`);
    process.exit(1);
  }

  const sharedEmail = uniqueEmail('dupe');
  const cases: Case[] = [
    {
      name: 'fresh email + valid password',
      body: { email: uniqueEmail('fresh'), password: 'testpass123', timezone: 'America/Los_Angeles' },
      expectStatus: 201,
    },
    {
      name: 'fresh email with full_name',
      body: { email: uniqueEmail('named'), password: 'testpass123', full_name: 'Test User', timezone: 'America/New_York' },
      expectStatus: 201,
    },
    {
      name: 'first signup of shared email',
      body: { email: sharedEmail, password: 'rightpass123' },
      expectStatus: 201,
    },
    {
      name: 'duplicate email with WRONG password → "already exists"',
      body: { email: sharedEmail, password: 'wrongpass456' },
      expectStatus: 400,
      expectErrorIncludes: 'already exists',
    },
    {
      name: 'duplicate email with CORRECT password → reuses account (201)',
      body: { email: sharedEmail, password: 'rightpass123' },
      expectStatus: 201,
    },
    {
      name: 'missing email',
      body: { password: 'testpass123' },
      expectStatus: 400,
      expectErrorIncludes: 'email',
    },
    {
      name: 'missing password',
      body: { email: uniqueEmail('nopass') },
      expectStatus: 400,
      expectErrorIncludes: 'password',
    },
    {
      name: 'empty body',
      body: {},
      expectStatus: 400,
    },
    {
      name: 'short password (< 6 chars)',
      body: { email: uniqueEmail('shortpw'), password: '12345' },
      expectStatus: 400,
    },
    {
      name: 'malformed email',
      body: { email: 'not-an-email', password: 'testpass123' },
      expectStatus: 400,
    },
  ];

  let pass = 0;
  let fail = 0;
  for (const c of cases) {
    const ok = await runCase(c);
    ok ? pass++ : fail++;
  }

  console.log('');
  const burst = await runBurst(10);
  pass += burst.pass;
  fail += burst.fail;

  console.log(`\n${pass} passed, ${fail} failed`);
  if (fail > 0) process.exitCode = 1;
}

main()
  .catch(err => {
    console.error('Test run crashed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (!CLEANUP_ONLY) await cleanupTracked();
  });
