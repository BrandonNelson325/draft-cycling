import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

// Log key type at startup to catch misconfiguration
const keyPrefix = config.supabase.serviceRoleKey?.substring(0, 20) || 'MISSING';
console.log(`[Supabase] Service role key starts with: ${keyPrefix}...`);
if (config.supabase.serviceRoleKey === config.supabase.anonKey) {
  console.error('[Supabase] WARNING: Service role key is the same as anon key! RLS will block inserts.');
}

// Admin client (use service role key for server-side operations)
// IMPORTANT: Never call signInWithPassword on this client — it pollutes the auth
// state and causes subsequent requests to use a user JWT instead of the service role.
export const supabaseAdmin = createClient(
  config.supabase.url,
  config.supabase.serviceRoleKey,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

// Client for user-specific operations (with anon key)
export const supabase = createClient(
  config.supabase.url,
  config.supabase.anonKey
);
