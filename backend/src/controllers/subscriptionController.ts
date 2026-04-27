import { Request, Response } from 'express';
import { AuthRequest } from '../middleware/auth';
import { subscriptionService } from '../services/subscriptionService';
import { stripe } from '../utils/stripe';
import { config } from '../config';
import { logger } from '../utils/logger';

/**
 * GET /api/subscription/plans
 * Return available subscription plans (public, no auth needed).
 */
export const getPlans = async (_req: Request, res: Response): Promise<void> => {
  res.json({
    plans: [
      {
        id: 'monthly',
        name: 'Monthly',
        price: 9.99,
        interval: 'month',
        description: '$9.99/month',
        trial_days: 7,
      },
      {
        id: 'yearly',
        name: 'Yearly',
        price: 79.0,
        interval: 'year',
        description: '$79/year (save 34%)',
        savings: '34%',
        trial_days: 7,
      },
    ],
  });
};

/**
 * POST /api/subscription/checkout
 * Create a Stripe Checkout session and return the URL.
 */
export const createCheckout = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { plan, mobile } = req.body;

    if (!plan || !['monthly', 'yearly'].includes(plan)) {
      res.status(400).json({ error: 'Invalid plan. Must be "monthly" or "yearly".' });
      return;
    }

    const url = await subscriptionService.createCheckoutSession(
      req.user.id,
      req.user.email,
      plan,
      !!mobile
    );

    res.json({ url });
  } catch (error: any) {
    logger.error('[Subscription] Checkout error:', error);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
};

/**
 * GET /api/subscription/mobile-callback
 * Redirect endpoint for Stripe checkout on mobile.
 * Stripe requires HTTPS success/cancel URLs, so this bounces to the app's deep link.
 */
export const mobileCallback = async (req: Request, res: Response): Promise<void> => {
  const status = req.query.status === 'success' ? 'success' : 'canceled';
  res.redirect(`cyclingcoach://subscription/${status}`);
};

/**
 * POST /api/subscription/portal
 * Create a Stripe Customer Portal session for managing subscription.
 */
export const createPortal = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const url = await subscriptionService.createPortalSession(req.user.id);
    res.json({ url });
  } catch (error: any) {
    logger.error('[Subscription] Portal error:', error);
    res.status(500).json({ error: error.message || 'Failed to create portal session' });
  }
};

/**
 * GET /api/subscription/status
 * Return current subscription status for the authenticated user.
 */
export const getStatus = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { data: athlete } = await (await import('../utils/supabase')).supabaseAdmin
      .from('athletes')
      .select('subscription_status, subscription_current_period_end, beta_access_code')
      .eq('id', req.user.id)
      .single();

    const hasAccess = !!(
      athlete?.beta_access_code ||
      athlete?.subscription_status === 'active' ||
      athlete?.subscription_status === 'trialing'
    );

    res.json({
      has_access: hasAccess,
      access_type: athlete?.beta_access_code
        ? 'beta'
        : athlete?.subscription_status || 'none',
      subscription_status: athlete?.subscription_status || 'none',
      current_period_end: athlete?.subscription_current_period_end,
    });
  } catch (error) {
    logger.error('[Subscription] Status error:', error);
    res.status(500).json({ error: 'Failed to get subscription status' });
  }
};

/**
 * POST /api/subscription/redeem
 * Redeem a promo code (beta access, discount, trial).
 */
export const redeemCode = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }

    const { code } = req.body;
    if (!code) {
      res.status(400).json({ error: 'Promo code is required' });
      return;
    }

    const result = await subscriptionService.redeemPromoCode(req.user.id, code);

    // Refresh the user profile so the client gets updated data
    const { data: athlete } = await (await import('../utils/supabase')).supabaseAdmin
      .from('athletes')
      .select('*')
      .eq('id', req.user.id)
      .single();

    res.json({ ...result, athlete });
  } catch (error: any) {
    res.status(400).json({ error: error.message || 'Failed to redeem code' });
  }
};

/**
 * POST /api/subscription/webhook
 * Stripe webhook handler — must use raw body.
 */
export const handleWebhook = async (req: Request, res: Response): Promise<void> => {
  const sig = req.headers['stripe-signature'] as string;

  if (!sig) {
    res.status(400).json({ error: 'Missing stripe-signature header' });
    return;
  }

  try {
    const event = stripe.webhooks.constructEvent(
      (req as any).rawBody,
      sig,
      config.stripe.webhookSecret
    );

    await subscriptionService.handleWebhookEvent(event);
    res.json({ received: true });
  } catch (error: any) {
    logger.error('[Stripe Webhook] Error:', error.message);
    res.status(400).json({ error: `Webhook error: ${error.message}` });
  }
};
