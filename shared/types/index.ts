// Shared types between frontend and backend

export interface Athlete {
  id: string;
  email: string;
  full_name?: string;
  ftp?: number;
  weight_kg?: number;
  strava_athlete_id?: number;
  strava_access_token?: string;
  strava_refresh_token?: string;
  strava_token_expires_at?: string;
  stripe_customer_id?: string;
  subscription_status?: 'active' | 'past_due' | 'canceled' | 'trialing';
  subscription_id?: string;
  subscription_current_period_end?: string;
  beta_access_code?: string;
  beta_access_activated_at?: string;
  created_at: string;
  updated_at: string;
}

export interface Workout {
  id: string;
  athlete_id: string;
  name: string;
  description?: string;
  workout_type: 'endurance' | 'tempo' | 'threshold' | 'vo2max' | 'sprint' | 'recovery' | 'custom';
  duration_minutes: number;
  tss?: number;
  intervals: WorkoutInterval[];
  zwo_file_url?: string;
  fit_file_url?: string;
  generated_by_ai: boolean;
  ai_prompt?: string;
  created_at: string;
}

export interface WorkoutInterval {
  duration: number; // seconds
  power?: number; // % FTP
  power_low?: number; // % FTP for ramps
  power_high?: number; // % FTP for ramps
  type: 'warmup' | 'work' | 'rest' | 'cooldown' | 'ramp';
  cadence?: number;
  repeat?: number;
}

export interface CalendarEntry {
  id: string;
  athlete_id: string;
  workout_id?: string;
  scheduled_date: string;
  completed: boolean;
  completed_at?: string;
  notes?: string;
  ai_rationale?: string;
  strava_activity_id?: number;
  created_at: string;
  workout?: Workout; // Joined data
}

export interface ChatConversation {
  id: string;
  athlete_id: string;
  title?: string;
  last_message_at?: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  conversation_id: string;
  athlete_id: string;
  role: 'user' | 'assistant';
  content: string;
  tool_calls?: any;
  created_at: string;
}

export interface StravaActivity {
  id: string;
  athlete_id: string;
  strava_activity_id: number;
  name?: string;
  start_date?: string;
  distance_meters?: number;
  moving_time_seconds?: number;
  average_watts?: number;
  tss?: number;
  raw_data?: any;
  synced_at: string;
}

export interface AthleteMetrics {
  id: string;
  athlete_id: string;
  date: string;
  ctl?: number; // Chronic Training Load
  atl?: number; // Acute Training Load
  tsb?: number; // Training Stress Balance
  created_at: string;
}

// API Request/Response types
export interface AuthResponse {
  user: Athlete;
  session: {
    access_token: string;
    refresh_token: string;
  };
}

export interface SubscriptionStatus {
  active: boolean;
  status?: string;
  current_period_end?: string;
}

export interface WorkoutGenerateRequest {
  prompt: string;
  workout_type?: string;
  duration_minutes?: number;
}

export interface ChatMessageRequest {
  conversation_id?: string;
  message: string;
}

export interface StravaAuthResponse {
  auth_url: string;
}

export interface ApiError {
  error: string;
  details?: any;
}
