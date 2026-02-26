import { Request, Response } from 'express';
import { supabaseAdmin } from '../utils/supabase';
import { AuthRequest } from '../middleware/auth';

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, full_name } = req.body;

    if (!email || !password) {
      res.status(400).json({ error: 'Email and password are required' });
      return;
    }

    // Create user with Supabase Auth
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm in development
    });

    if (authError || !authData.user) {
      res.status(400).json({ error: authError?.message || 'Registration failed' });
      return;
    }

    // The DB trigger (handle_new_user) already created the athlete row when
    // the auth user was inserted. Just update full_name if provided.
    const { data: athlete, error: athleteError } = await supabaseAdmin
      .from('athletes')
      .update({ full_name: full_name || null })
      .eq('id', authData.user.id)
      .select()
      .single();

    if (athleteError) {
      console.error('Error creating athlete:', athleteError);
      // Rollback: delete the auth user
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      res.status(500).json({ error: 'Failed to create user profile' });
      return;
    }

    // Generate session
    const { data: session, error: sessionError } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (sessionError || !session.session) {
      res.status(500).json({ error: 'Registration successful but login failed' });
      return;
    }

    res.status(201).json({
      user: athlete,
      session: {
        access_token: session.session.access_token,
        refresh_token: session.session.refresh_token,
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

    // Sign in with Supabase
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
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

    const { full_name, ftp, weight_kg, unit_system, display_mode } = req.body;

    const updateData: any = { updated_at: new Date().toISOString() };
    if (full_name !== undefined) updateData.full_name = full_name;
    if (ftp !== undefined) updateData.ftp = ftp;
    if (weight_kg !== undefined) updateData.weight_kg = weight_kg;
    if (unit_system !== undefined) updateData.unit_system = unit_system;
    if (display_mode !== undefined) updateData.display_mode = display_mode;

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
