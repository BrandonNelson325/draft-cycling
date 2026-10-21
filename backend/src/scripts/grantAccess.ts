/**
 * Grant app access to accounts by email (Android testers, Play reviewer).
 * Android has no in-app purchase, so access is granted per account.
 *
 *   npm run grant-access -- alice@example.com bob@example.com
 *
 * Accounts must already exist (the person signs up in the app first).
 * Emails without an account are listed so you can follow up.
 */
import { supabaseAdmin } from '../utils/supabase';

const CODE = 'ANDROID-TESTER';

(async () => {
  const emails = process.argv.slice(2).map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (!emails.length) {
    console.error('Usage: npm run grant-access -- <email> [email...]');
    process.exit(1);
  }
  for (const email of emails) {
    const { data: a, error } = await supabaseAdmin
      .from('athletes').select('id, beta_access_code, subscription_status').ilike('email', email).maybeSingle();
    if (error) { console.log(`✗ ${email}: ${error.message}`); continue; }
    if (!a) { console.log(`… ${email}: no account yet — they need to sign up in the app first`); continue; }
    if (a.beta_access_code || a.subscription_status === 'active' || a.subscription_status === 'trialing') {
      console.log(`✓ ${email}: already has access`);
      continue;
    }
    const { error: upErr } = await supabaseAdmin.from('athletes')
      .update({ beta_access_code: CODE, beta_access_activated_at: new Date().toISOString() })
      .eq('id', a.id);
    console.log(upErr ? `✗ ${email}: ${upErr.message}` : `✓ ${email}: access granted`);
  }
  process.exit(0);
})();
