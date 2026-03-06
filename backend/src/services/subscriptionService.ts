import { stripe } from '../utils/stripe';
import { supabaseAdmin } from '../utils/supabase';
import { config } from '../config';
import { logger } from '../utils/logger';
import type Stripe from 'stripe';

export const subscriptionService = {
  /**
   * Get or create a Stripe customer for an athlete.
   */
  async getOrCreateCustomer(athleteId: string, email: string): Promise<string> {
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('stripe_customer_id')
      .eq('id', athleteId)
      .single();

    if (athlete?.stripe_customer_id) {
      return athlete.stripe_customer_id;
    }

    const customer = await stripe.customers.create({
      email,
      metadata: { athlete_id: athleteId },
    });

    await supabaseAdmin
      .from('athletes')
      .update({ stripe_customer_id: customer.id })
      .eq('id', athleteId);

    return customer.id;
  },

  /**
   * Create a Stripe Checkout Session for a new subscription.
   */
  async createCheckoutSession(
    athleteId: string,
    email: string,
    plan: 'monthly' | 'yearly',
    promoCode?: string
  ): Promise<string> {
    const customerId = await this.getOrCreateCustomer(athleteId, email);

    const priceId = plan === 'yearly'
      ? config.stripe.yearlyPriceId
      : config.stripe.monthlyPriceId;

    const sessionParams: Stripe.Checkout.SessionCreateParams = {
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${config.frontendUrl}/settings?subscription=success`,
      cancel_url: `${config.frontendUrl}/subscribe?canceled=true`,
      metadata: { athlete_id: athleteId },
      subscription_data: {
        metadata: { athlete_id: athleteId },
        trial_period_days: 7,
      },
    };

    // If there's a promo/discount code, look up the Stripe coupon
    if (promoCode) {
      const { data: promo } = await supabaseAdmin
        .from('promo_codes')
        .select('stripe_coupon_id, type, trial_days')
        .eq('code', promoCode.toUpperCase())
        .eq('is_active', true)
        .single();

      if (promo?.stripe_coupon_id) {
        sessionParams.discounts = [{ coupon: promo.stripe_coupon_id }];
      }
      if (promo?.trial_days) {
        sessionParams.subscription_data!.trial_period_days = promo.trial_days;
      }
    }

    const session = await stripe.checkout.sessions.create(sessionParams);
    return session.url!;
  },

  /**
   * Create a Stripe Customer Portal session for managing subscription.
   */
  async createPortalSession(athleteId: string): Promise<string> {
    const { data: athlete } = await supabaseAdmin
      .from('athletes')
      .select('stripe_customer_id')
      .eq('id', athleteId)
      .single();

    if (!athlete?.stripe_customer_id) {
      throw new Error('No Stripe customer found');
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: athlete.stripe_customer_id,
      return_url: `${config.frontendUrl}/settings`,
    });

    return session.url;
  },

  /**
   * Handle Stripe webhook events to sync subscription state.
   */
  async handleWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const athleteId = session.metadata?.athlete_id;
        if (athleteId && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          await this.syncSubscription(athleteId, subscription);
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const athleteId = subscription.metadata?.athlete_id;
        if (athleteId) {
          await this.syncSubscription(athleteId, subscription);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const athleteId = subscription.metadata?.athlete_id;
        if (athleteId) {
          await supabaseAdmin
            .from('athletes')
            .update({
              subscription_status: 'canceled',
              subscription_id: null,
              subscription_current_period_end: null,
            })
            .eq('id', athleteId);
          logger.info(`[Stripe] Subscription canceled for athlete ${athleteId}`);
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = (invoice as any).subscription as string;
        if (subscriptionId) {
          const subscription = await stripe.subscriptions.retrieve(subscriptionId);
          const athleteId = subscription.metadata?.athlete_id;
          if (athleteId) {
            await supabaseAdmin
              .from('athletes')
              .update({ subscription_status: 'past_due' })
              .eq('id', athleteId);
            logger.warn(`[Stripe] Payment failed for athlete ${athleteId}`);
          }
        }
        break;
      }

      default:
        logger.debug(`[Stripe] Unhandled event type: ${event.type}`);
    }
  },

  /**
   * Sync a Stripe subscription object to the athletes table.
   */
  async syncSubscription(athleteId: string, subscription: Stripe.Subscription): Promise<void> {
    const status = subscription.status === 'active' || subscription.status === 'trialing'
      ? subscription.status
      : subscription.status === 'past_due'
        ? 'past_due'
        : 'canceled';

    const periodEnd = new Date((subscription as any).current_period_end * 1000).toISOString();

    await supabaseAdmin
      .from('athletes')
      .update({
        subscription_status: status,
        subscription_id: subscription.id,
        subscription_current_period_end: periodEnd,
      })
      .eq('id', athleteId);

    logger.info(
      `[Stripe] Synced subscription for athlete ${athleteId}: status=${status}, ends=${periodEnd}`
    );
  },

  /**
   * Validate and redeem a promo code.
   */
  async redeemPromoCode(
    athleteId: string,
    code: string
  ): Promise<{ type: string; message: string }> {
    const { data: promo, error } = await supabaseAdmin
      .from('promo_codes')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('is_active', true)
      .single();

    if (error || !promo) {
      throw new Error('Invalid promo code');
    }

    // Check if expired
    if (promo.active_until && new Date(promo.active_until) < new Date()) {
      throw new Error('This promo code has expired');
    }

    // Check if not yet active
    if (new Date(promo.active_from) > new Date()) {
      throw new Error('This promo code is not yet active');
    }

    // Check max uses
    if (promo.max_uses !== null && promo.current_uses >= promo.max_uses) {
      throw new Error('This promo code has reached its usage limit');
    }

    // Check if already redeemed by this user
    const { data: existing } = await supabaseAdmin
      .from('promo_code_redemptions')
      .select('id')
      .eq('promo_code_id', promo.id)
      .eq('athlete_id', athleteId)
      .single();

    if (existing) {
      throw new Error('You have already used this promo code');
    }

    // Handle based on type
    if (promo.type === 'beta_access') {
      // Grant beta access directly
      await supabaseAdmin
        .from('athletes')
        .update({
          beta_access_code: code.toUpperCase(),
          beta_access_activated_at: new Date().toISOString(),
        })
        .eq('id', athleteId);
    }

    // Record redemption
    await supabaseAdmin
      .from('promo_code_redemptions')
      .insert({ promo_code_id: promo.id, athlete_id: athleteId });

    // Increment usage count
    await supabaseAdmin
      .from('promo_codes')
      .update({ current_uses: promo.current_uses + 1 })
      .eq('id', promo.id);

    return { type: promo.type, message: this.getRedemptionMessage(promo.type) };
  },

  getRedemptionMessage(type: string): string {
    switch (type) {
      case 'beta_access':
        return 'Beta access activated! Welcome to Draft.';
      case 'discount_percent':
      case 'discount_fixed':
        return 'Discount applied! Proceed to subscribe.';
      case 'free_trial':
        return 'Free trial activated!';
      default:
        return 'Code redeemed successfully.';
    }
  },
};
