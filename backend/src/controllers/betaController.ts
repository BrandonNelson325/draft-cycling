import { Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { supabaseAdmin } from '../utils/supabase';
import { config } from '../config';

export const activateBetaAccess = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { code } = req.body;

    if (!code) {
      res.status(400).json({ error: 'Beta code is required' });
      return;
    }

    // Validate the code against the global beta access code
    if (code.toUpperCase() !== config.beta.accessCode.toUpperCase()) {
      res.status(400).json({ error: 'Invalid beta code' });
      return;
    }

    // Check if user already has beta access
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('beta_access_code, beta_access_activated_at')
      .eq('id', req.user.id)
      .single();

    if (athlete?.beta_access_code) {
      res.status(400).json({
        error: 'Beta access already activated',
        activated_at: athlete.beta_access_activated_at
      });
      return;
    }

    // Activate beta access
    const { data: updatedAthlete, error } = await supabaseAdmin
      .from('athletes')
      .update({
        beta_access_code: code.toUpperCase(),
        beta_access_activated_at: new Date().toISOString(),
      })
      .eq('id', req.user.id)
      .select()
      .single();

    if (error) {
      console.error('Error activating beta access:', error);
      res.status(500).json({ error: 'Failed to activate beta access' });
      return;
    }

    res.json({
      message: 'Beta access activated successfully',
      athlete: updatedAthlete,
    });
  } catch (error) {
    console.error('Beta activation error:', error);
    res.status(500).json({ error: 'Failed to activate beta access' });
  }
};

export const checkBetaAccess = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('beta_access_code, beta_access_activated_at, subscription_status')
      .eq('id', req.user.id)
      .single();

    const hasAccess = !!(
      athlete?.beta_access_code ||
      athlete?.subscription_status === 'active' ||
      athlete?.subscription_status === 'trialing'
    );

    res.json({
      has_access: hasAccess,
      access_type: athlete?.beta_access_code ? 'beta' : athlete?.subscription_status || 'none',
      beta_activated_at: athlete?.beta_access_activated_at,
    });
  } catch (error) {
    console.error('Check beta access error:', error);
    res.status(500).json({ error: 'Failed to check access' });
  }
};
