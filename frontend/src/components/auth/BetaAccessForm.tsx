import { useState } from 'react';
import { subscriptionService } from '../../services/subscriptionService';
import { authService } from '../../services/authService';
import { useAuthStore } from '../../stores/useAuthStore';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';

export function BetaAccessForm() {
  const [promoCode, setPromoCode] = useState('');
  const [promoError, setPromoError] = useState('');
  const [promoSuccess, setPromoSuccess] = useState('');
  const [promoLoading, setPromoLoading] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<'monthly' | 'yearly' | null>(null);
  const { logout } = useAuthStore();

  const handleRedeemCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!promoCode.trim()) return;

    setPromoError('');
    setPromoSuccess('');
    setPromoLoading(true);

    try {
      const result = await subscriptionService.redeemCode(promoCode.trim());
      setPromoSuccess(result.message);

      // Refresh user profile
      await authService.getProfile();

      // If it was a beta/access code, page will re-render automatically
      // If it was a discount code, user still needs to subscribe
      if (result.type === 'beta_access') {
        setTimeout(() => window.location.reload(), 1000);
      }
    } catch (err: any) {
      setPromoError(err.message || 'Invalid code');
    } finally {
      setPromoLoading(false);
    }
  };

  const handleSubscribe = async (plan: 'monthly' | 'yearly') => {
    setCheckoutLoading(plan);
    try {
      const url = await subscriptionService.createCheckout(plan);
      window.location.href = url;
    } catch (err: any) {
      setPromoError(err.message || 'Failed to start checkout');
      setCheckoutLoading(null);
    }
  };

  return (
    <div className="w-full max-w-md space-y-6">
      {/* Logo/Brand */}
      <div className="text-center">
        <img src="/logo.png" alt="Draft" className="h-32 w-auto mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-foreground">Get Started with Draft</h1>
        <p className="text-muted-foreground mt-2">
          AI-powered cycling coach that adapts to you
        </p>
      </div>

      {/* Subscription Plans */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Choose a Plan</CardTitle>
          <p className="text-sm text-muted-foreground">7-day free trial on all plans. Cancel anytime.</p>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Monthly */}
          <button
            onClick={() => handleSubscribe('monthly')}
            disabled={!!checkoutLoading}
            className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-gray-200 hover:border-blue-400 transition-all text-left disabled:opacity-50"
          >
            <div>
              <p className="font-semibold text-foreground">Monthly</p>
              <p className="text-sm text-muted-foreground">Cancel anytime</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-foreground">$9.99</p>
              <p className="text-xs text-muted-foreground">/month</p>
            </div>
            {checkoutLoading === 'monthly' && (
              <span className="ml-2 animate-spin text-blue-500">&#8987;</span>
            )}
          </button>

          {/* Yearly */}
          <button
            onClick={() => handleSubscribe('yearly')}
            disabled={!!checkoutLoading}
            className="w-full flex items-center justify-between p-4 rounded-xl border-2 border-blue-500 bg-blue-50 hover:bg-blue-100 transition-all text-left relative disabled:opacity-50"
          >
            <span className="absolute -top-2.5 left-4 bg-blue-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              BEST VALUE
            </span>
            <div>
              <p className="font-semibold text-foreground">Yearly</p>
              <p className="text-sm text-muted-foreground">Save 34%</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold text-foreground">$79</p>
              <p className="text-xs text-muted-foreground">/year ($6.58/mo)</p>
            </div>
            {checkoutLoading === 'yearly' && (
              <span className="ml-2 animate-spin text-blue-500">&#8987;</span>
            )}
          </button>
        </CardContent>
      </Card>

      {/* Promo Code */}
      <Card>
        <CardContent className="pt-5">
          <form onSubmit={handleRedeemCode} className="space-y-3">
            <p className="text-sm font-medium text-muted-foreground">Have a promo code?</p>

            {promoError && (
              <div className="p-2 text-sm text-red-600 bg-red-50 rounded-md">{promoError}</div>
            )}
            {promoSuccess && (
              <div className="p-2 text-sm text-green-600 bg-green-50 rounded-md">{promoSuccess}</div>
            )}

            <div className="flex gap-2">
              <Input
                type="text"
                placeholder="Enter code"
                value={promoCode}
                onChange={(e) => setPromoCode(e.target.value.toUpperCase())}
                disabled={promoLoading}
                className="font-mono flex-1"
              />
              <Button type="submit" variant="outline" disabled={promoLoading || !promoCode.trim()}>
                {promoLoading ? '...' : 'Apply'}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Sign out */}
      <div className="text-center">
        <button
          onClick={logout}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
