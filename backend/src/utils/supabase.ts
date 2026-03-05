import { createClient } from '@supabase/supabase-js';
import { config } from '../config';

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
