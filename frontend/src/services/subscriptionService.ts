import { api } from './api';

export interface SubscriptionPlan {
  id: 'monthly' | 'yearly';
  name: string;
  price: number;
  interval: string;
  description: string;
  savings?: string;
}

export const subscriptionService = {
  async getPlans(): Promise<SubscriptionPlan[]> {
    const { data, error } = await api.get('/api/subscription/plans', false);
    if (error) throw new Error('Failed to load plans');
    return (data as any).plans;
  },

  async createCheckout(plan: 'monthly' | 'yearly', promoCode?: string): Promise<string> {
    const { data, error } = await api.post(
      '/api/subscription/checkout',
      { plan, promo_code: promoCode },
      true
    );
    if (error) throw new Error((error as any).error || 'Failed to create checkout');
    return (data as any).url;
  },

  async createPortal(): Promise<string> {
    const { data, error } = await api.post('/api/subscription/portal', {}, true);
    if (error) throw new Error((error as any).error || 'Failed to open billing portal');
    return (data as any).url;
  },

  async getStatus() {
    const { data, error } = await api.get('/api/subscription/status', true);
    if (error) throw new Error('Failed to get subscription status');
    return data as {
      has_access: boolean;
      access_type: string;
      subscription_status: string;
      current_period_end?: string;
    };
  },

  async redeemCode(code: string) {
    const { data, error } = await api.post('/api/subscription/redeem', { code }, true);
    if (error) throw new Error((error as any).error || 'Invalid promo code');
    return data as { type: string; message: string; athlete: any };
  },
};
