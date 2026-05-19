-- Background jobs for long-running plan builds.
--
-- When the AI coach receives "build me a plan", it inserts a row here, kicks
-- off a background promise (no HTTP request blocking), and returns a fast
-- acknowledgement to the user. The background executor reads/updates this
-- table, then writes a follow-up chat_messages row + sends a push when done.
--
-- The conversation_id link lets the executor write its result into the same
-- chat thread the user started the request in.

CREATE TABLE IF NOT EXISTS training_plan_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES chat_conversations(id) ON DELETE SET NULL,

  status TEXT NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'completed', 'failed')),

  -- The parameters the AI passed to build_training_plan_async (week count,
  -- target FTP, goal event, phases, etc.) — opaque JSON, the executor knows
  -- what to do with it.
  params JSONB NOT NULL,

  -- Populated when the executor finishes (success or failure)
  result JSONB,
  error_message TEXT,

  -- Soft summary the executor can write for the assistant chat message
  summary TEXT,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_training_plan_jobs_athlete_status
  ON training_plan_jobs(athlete_id, status, created_at DESC);

ALTER TABLE training_plan_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Athletes can view their own plan jobs"
  ON training_plan_jobs FOR SELECT
  USING (athlete_id = auth.uid());
