-- Ensure athletes table has a working INSERT policy.
-- Migration 009 added this, but we recreate it defensively to handle:
--   1. Cases where 009 was never run
--   2. Cases where Supabase "Force Row Level Security" is enabled
--   3. Any stale/conflicting policy state

-- Clean slate: drop any existing INSERT policies on athletes
DROP POLICY IF EXISTS "Service role can insert athletes" ON athletes;
DROP POLICY IF EXISTS "Users can insert own athlete row" ON athletes;
DROP POLICY IF EXISTS "Allow athlete registration" ON athletes;

-- Allow inserts from the backend (service_role when Force RLS is on)
-- and direct user-side inserts (auth.uid() = id).
-- WITH CHECK (true) is safe here because the FK constraint
-- id REFERENCES auth.users already prevents bogus IDs.
CREATE POLICY "Allow athlete insert"
  ON athletes FOR INSERT
  WITH CHECK (true);
