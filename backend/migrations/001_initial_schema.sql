-- AI Cycling Coach Database Schema

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Athletes table (extends auth.users)
CREATE TABLE athletes (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT,
  ftp INTEGER,
  weight_kg DECIMAL(5,2),

  -- Strava integration
  strava_athlete_id BIGINT UNIQUE,
  strava_access_token TEXT,
  strava_refresh_token TEXT,
  strava_token_expires_at TIMESTAMPTZ,

  -- Subscription
  stripe_customer_id TEXT UNIQUE,
  subscription_status TEXT CHECK (subscription_status IN ('active', 'past_due', 'canceled', 'trialing')),
  subscription_id TEXT,
  subscription_current_period_end TIMESTAMPTZ,

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workouts table
CREATE TABLE workouts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  workout_type TEXT CHECK (workout_type IN ('endurance', 'tempo', 'threshold', 'vo2max', 'sprint', 'recovery', 'custom')),
  duration_minutes INTEGER NOT NULL,
  tss INTEGER,
  intervals JSONB NOT NULL DEFAULT '[]'::jsonb,
  zwo_file_url TEXT,
  fit_file_url TEXT,
  generated_by_ai BOOLEAN DEFAULT FALSE,
  ai_prompt TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Calendar entries table
CREATE TABLE calendar_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  workout_id UUID REFERENCES workouts(id) ON DELETE SET NULL,
  scheduled_date DATE NOT NULL,
  completed BOOLEAN DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  notes TEXT,
  ai_rationale TEXT,
  strava_activity_id BIGINT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat conversations table
CREATE TABLE chat_conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  title TEXT,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Chat messages table
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID NOT NULL REFERENCES chat_conversations(id) ON DELETE CASCADE,
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  role TEXT CHECK (role IN ('user', 'assistant')) NOT NULL,
  content TEXT NOT NULL,
  tool_calls JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Strava activities table (cached)
CREATE TABLE strava_activities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  strava_activity_id BIGINT UNIQUE NOT NULL,
  name TEXT,
  start_date TIMESTAMPTZ,
  distance_meters INTEGER,
  moving_time_seconds INTEGER,
  average_watts DECIMAL(6,2),
  tss INTEGER,
  raw_data JSONB,
  synced_at TIMESTAMPTZ DEFAULT NOW()
);

-- Athlete metrics table (fitness tracking)
CREATE TABLE athlete_metrics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  athlete_id UUID NOT NULL REFERENCES athletes(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  ctl DECIMAL(5,2),
  atl DECIMAL(5,2),
  tsb DECIMAL(5,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(athlete_id, date)
);

-- Indexes for better performance
CREATE INDEX idx_workouts_athlete_id ON workouts(athlete_id);
CREATE INDEX idx_calendar_entries_athlete_id ON calendar_entries(athlete_id);
CREATE INDEX idx_calendar_entries_scheduled_date ON calendar_entries(scheduled_date);
CREATE INDEX idx_chat_messages_conversation_id ON chat_messages(conversation_id);
CREATE INDEX idx_strava_activities_athlete_id ON strava_activities(athlete_id);
CREATE INDEX idx_athlete_metrics_athlete_date ON athlete_metrics(athlete_id, date);

-- Enable Row Level Security (RLS)
ALTER TABLE athletes ENABLE ROW LEVEL SECURITY;
ALTER TABLE workouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE calendar_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE strava_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE athlete_metrics ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Users can only access their own data

-- Athletes policies
CREATE POLICY "Users can view own profile"
  ON athletes FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
  ON athletes FOR UPDATE
  USING (auth.uid() = id);

-- Workouts policies
CREATE POLICY "Users can view own workouts"
  ON workouts FOR SELECT
  USING (auth.uid() = athlete_id);

CREATE POLICY "Users can create own workouts"
  ON workouts FOR INSERT
  WITH CHECK (auth.uid() = athlete_id);

CREATE POLICY "Users can update own workouts"
  ON workouts FOR UPDATE
  USING (auth.uid() = athlete_id);

CREATE POLICY "Users can delete own workouts"
  ON workouts FOR DELETE
  USING (auth.uid() = athlete_id);

-- Calendar entries policies
CREATE POLICY "Users can view own calendar entries"
  ON calendar_entries FOR SELECT
  USING (auth.uid() = athlete_id);

CREATE POLICY "Users can create own calendar entries"
  ON calendar_entries FOR INSERT
  WITH CHECK (auth.uid() = athlete_id);

CREATE POLICY "Users can update own calendar entries"
  ON calendar_entries FOR UPDATE
  USING (auth.uid() = athlete_id);

CREATE POLICY "Users can delete own calendar entries"
  ON calendar_entries FOR DELETE
  USING (auth.uid() = athlete_id);

-- Chat conversations policies
CREATE POLICY "Users can view own conversations"
  ON chat_conversations FOR SELECT
  USING (auth.uid() = athlete_id);

CREATE POLICY "Users can create own conversations"
  ON chat_conversations FOR INSERT
  WITH CHECK (auth.uid() = athlete_id);

CREATE POLICY "Users can update own conversations"
  ON chat_conversations FOR UPDATE
  USING (auth.uid() = athlete_id);

CREATE POLICY "Users can delete own conversations"
  ON chat_conversations FOR DELETE
  USING (auth.uid() = athlete_id);

-- Chat messages policies
CREATE POLICY "Users can view own messages"
  ON chat_messages FOR SELECT
  USING (auth.uid() = athlete_id);

CREATE POLICY "Users can create own messages"
  ON chat_messages FOR INSERT
  WITH CHECK (auth.uid() = athlete_id);

-- Strava activities policies
CREATE POLICY "Users can view own activities"
  ON strava_activities FOR SELECT
  USING (auth.uid() = athlete_id);

CREATE POLICY "Users can create own activities"
  ON strava_activities FOR INSERT
  WITH CHECK (auth.uid() = athlete_id);

CREATE POLICY "Users can update own activities"
  ON strava_activities FOR UPDATE
  USING (auth.uid() = athlete_id);

-- Athlete metrics policies
CREATE POLICY "Users can view own metrics"
  ON athlete_metrics FOR SELECT
  USING (auth.uid() = athlete_id);

CREATE POLICY "Users can create own metrics"
  ON athlete_metrics FOR INSERT
  WITH CHECK (auth.uid() = athlete_id);

CREATE POLICY "Users can update own metrics"
  ON athlete_metrics FOR UPDATE
  USING (auth.uid() = athlete_id);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to automatically update updated_at
CREATE TRIGGER update_athletes_updated_at
  BEFORE UPDATE ON athletes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();
