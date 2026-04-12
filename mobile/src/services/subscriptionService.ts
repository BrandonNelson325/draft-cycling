import apiClient from '../api/client';

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
    const { data } = await apiClient.get<{ plans: SubscriptionPlan[] }>('/api/subscription/plans');
    return data.plans;
  },

  async createCheckout(plan: 'monthly' | 'yearly', promoCode?: string): Promise<string> {
    const { data } = await apiClient.post<{ url: string }>('/api/subscription/checkout', {
      plan,
      promo_code: promoCode,
      mobile: true,
    });
    return data.url;
  },

  async createPortal(): Promise<string> {
    const { data } = await apiClient.post<{ url: string }>('/api/subscription/portal', {});
    return data.url;
  },

  async getStatus() {
    const { data } = await apiClient.get<{
      has_access: boolean;
      access_type: string;
      subscription_status: string;
      current_period_end?: string;
    }>('/api/subscription/status');
    return data;
  },

  async redeemCode(code: string) {
    const { data } = await apiClient.post<{ type: string; message: string; athlete: any }>(
      '/api/subscription/redeem',
      { code }
    );
    return data;
  },
};
