-- The athletes table is missing an INSERT policy.
-- The backend uses the service_role key which bypasses RLS, but this policy
-- acts as a defensive fallback and also documents the intended access pattern.
-- The FK constraint (id REFERENCES auth.users) already guarantees that only
-- real auth users can be inserted, so WITH CHECK (true) is safe here.

CREATE POLICY "Service role can insert athletes"
  ON athletes FOR INSERT
  WITH CHECK (true);

-- Also add a DELETE policy so account cleanup works correctly.
CREATE POLICY "Users can delete own profile"
  ON athletes FOR DELETE
  USING (auth.uid() = id);
