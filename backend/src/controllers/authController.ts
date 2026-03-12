import { Request, Response } from 'express';
import { supabaseAdmin, supabase } from '../utils/supabase';
import { AuthRequest } from '../middleware/auth';

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, full_name, timezone } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    // Create user with Supabase Auth
    let authUser;
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    if (authError || !authData.user) {
      // If user already exists in auth, look them up and reuse
      if (authError?.message?.toLowerCase().includes('already') ||
          authError?.message?.toLowerCase().includes('duplicate') ||
          authError?.message?.toLowerCase().includes('exists')) {
        // User exists in auth — try signing in with the provided password
        // If that works, reuse the existing user. If not, tell them to log in.
        const { data: signIn } = await supabase.auth.signInWithPassword({ email, password });
        if (signIn?.user) {
          authUser = signIn.user;
        } else {
          res.status(400).json({ error: 'An account with this email already exists. Please log in instead.' });
          return;
        }
      } else {
        const msg = authError?.message || 'Registration failed';
        console.error('Auth createUser error:', msg);
        res.status(400).json({ error: msg });
        return;
      }
    } else {
      authUser = authData.user;
    }

    // Upsert athlete row — handles both cases: trigger already created it, or it doesn't exist yet.
    // First try by id (normal case). If that fails due to email uniqueness, clean up any
    // orphaned athlete row from a previous failed registration attempt, then retry.
    let athlete;
    let athleteError;

    const upsertAthleteRow = async () => {
      return supabaseAdmin
        .from('athletes')
        .upsert(
          {
            id: authUser.id,
            email,
            full_name: full_name || null,
            timezone: timezone || 'America/Los_Angeles',
          },
          { onConflict: 'id' }
        )
        .select()
        .single();
    };

    const firstAttempt = await upsertAthleteRow();
    athlete = firstAttempt.data;
    athleteError = firstAttempt.error;

    // If failed due to duplicate email (orphaned row from previous failed registration),
    // delete the orphaned row and retry
    if (athleteError && athleteError.message?.includes('athletes_email_key')) {
      console.warn('Orphaned athlete row detected for email, cleaning up:', email);
      await supabaseAdmin.from('athletes').delete().eq('email', email).neq('id', authUser.id);
      const retry = await upsertAthleteRow();
      athlete = retry.data;
      athleteError = retry.error;
    }

    if (athleteError) {
      console.error('Error creating athlete profile:', athleteError.message, athleteError.details, athleteError.hint);
      await supabaseAdmin.auth.admin.deleteUser(authUser.id);
      res.status(500).json({ error: 'Failed to create user profile' });
      return;
    }

    // Generate session — retry once if rate-limited
    let signInData;
    let signInError;

    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await supabase.auth.signInWithPassword({ email, password });
      signInData = result.data;
      signInError = result.error;
      if (!signInError) break;
      if (attempt === 0) {
        console.warn('signInWithPassword attempt 1 failed, retrying in 1s:', signInError.message);
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    if (signInError || !signInData?.session) {
      console.error('Session generation error after registration:', signInError?.message);
      // Registration succeeded — don't delete the user, just tell them to log in
      res.status(201).json({
        user: athlete,
        session: null,
        message: 'Account created successfully. Please log in.',
      });
      return;
    }

    res.status(201).json({
      user: athlete,
      session: {
        access_token: signInData.session.access_token,
        refresh_token: signInData.session.refresh_token,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  }
};

export const refreshToken = async (req: Request, res: Response): Promise<void> => {
  try {
    const { refresh_token } = req.body;

    if (!refresh_token) {
      res.status(400).json({ error: 'Refresh token is required' });
      return;
    }

    // Refresh the session using Supabase
    const { data, error } = await supabaseAdmin.auth.refreshSession({
      refresh_token,
    });

    if (error || !data.session) {
      res.status(401).json({ error: 'Invalid or expired refresh token' });
      return;
    }

    res.json({
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(500).json({ error: 'Token refresh failed' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    // Sign in with Supabase (use anon client to avoid polluting admin client's auth state)
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data.session) {
      res.status(401).json({ error: 'Invalid credentials' });
      return;
    }

    // Get athlete profile
    const { data: athlete, error: athleteError } = await supabaseAdmin
      .from('athletes')
      .select('*')
      .eq('id', data.user.id)
      .single();

    if (athleteError) {
      console.error('Error fetching athlete:', athleteError);
      res.status(500).json({ error: 'Failed to fetch user profile' });
      return;
    }

    res.json({
      user: athlete,
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  }
};

export const logout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    // Supabase handles logout on the client side
    // This endpoint is mainly for logging purposes
    res.json({ message: 'Logged out successfully' });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({ error: 'Logout failed' });
  }
};

export const getProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { data: athlete, error } = await supabaseAdmin
      .from('athletes')
      .select('*')
      .eq('id', req.user.id)
      .single();

    if (error) {
      console.error('Error fetching profile:', error);
      res.status(500).json({ error: 'Failed to fetch profile' });
      return;
    }

    res.json(athlete);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
};

export const updateProfile = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { full_name, ftp, weight_kg, unit_system, display_mode, push_notifications_enabled, morning_checkin_time, timezone, max_hr, resting_hr, date_of_birth } = req.body;

    const updateData: any = { updated_at: new Date().toISOString() };
    if (full_name !== undefined) updateData.full_name = full_name;
    if (ftp !== undefined) updateData.ftp = ftp;
    if (weight_kg !== undefined) updateData.weight_kg = weight_kg;
    if (unit_system !== undefined) updateData.unit_system = unit_system;
    if (display_mode !== undefined) updateData.display_mode = display_mode;
    if (push_notifications_enabled !== undefined) updateData.push_notifications_enabled = push_notifications_enabled;
    if (morning_checkin_time !== undefined) updateData.morning_checkin_time = morning_checkin_time;
    if (timezone !== undefined) updateData.timezone = timezone;
    if (max_hr !== undefined) updateData.max_hr = max_hr;
    if (resting_hr !== undefined) updateData.resting_hr = resting_hr;
    if (date_of_birth !== undefined) updateData.date_of_birth = date_of_birth;

    const { data: athlete, error } = await supabaseAdmin
      .from('athletes')
      .update(updateData)
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) {
      console.error('Error updating profile:', error);
      res.status(500).json({ error: 'Failed to update profile' });
      return;
    }

    res.json(athlete);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
};
