import { useState } from 'react';
import { useAuthStore } from '../../stores/useAuthStore';
import { subscriptionService } from '../../services/subscriptionService';
import { Button } from '../ui/button';

export function AccountInfo() {
  const user = useAuthStore((state) => state.user);
  const [portalLoading, setPortalLoading] = useState(false);

  if (!user) return null;

  const hasSubscription = user.subscription_status === 'active' || user.subscription_status === 'trialing';
  const hasBeta = !!user.beta_access_code;

  const handleManageSubscription = async () => {
    setPortalLoading(true);
    try {
      const url = await subscriptionService.createPortal();
      window.location.href = url;
    } catch (err) {
      console.error('Failed to open billing portal:', err);
    } finally {
      setPortalLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">
          Email
        </label>
        <div className="text-sm">{user.email}</div>
      </div>

      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">
          Access
        </label>
        <div className="text-sm">
          {hasBeta && (
            <span className="text-green-500">Beta Access (Code: {user.beta_access_code})</span>
          )}
          {hasSubscription && (
            <span className="text-green-500">
              {user.subscription_status === 'trialing' ? 'Trial' : 'Active Subscription'}
              {user.subscription_current_period_end && (
                <span className="text-muted-foreground ml-1">
                  (renews {new Date(user.subscription_current_period_end).toLocaleDateString()})
                </span>
              )}
            </span>
          )}
          {!hasBeta && !hasSubscription && user.subscription_status === 'past_due' && (
            <span className="text-red-500">Payment Past Due</span>
          )}
          {!hasBeta && !hasSubscription && user.subscription_status === 'canceled' && (
            <span className="text-yellow-500">Canceled</span>
          )}
          {!hasBeta && !hasSubscription && !user.subscription_status && (
            <span className="text-muted-foreground">No active subscription</span>
          )}
        </div>
      </div>

      {hasSubscription && (
        <Button
          variant="outline"
          size="sm"
          onClick={handleManageSubscription}
          disabled={portalLoading}
        >
          {portalLoading ? 'Loading...' : 'Manage Subscription'}
        </Button>
      )}
    </div>
  );
}
