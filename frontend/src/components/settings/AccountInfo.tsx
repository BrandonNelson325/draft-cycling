import { useAuthStore } from '../../stores/useAuthStore';

export function AccountInfo() {
  const user = useAuthStore((state) => state.user);

  if (!user) return null;

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
          Beta Access
        </label>
        <div className="text-sm">
          {user.beta_access_code ? (
            <span className="text-green-500">✓ Active (Code: {user.beta_access_code})</span>
          ) : (
            <span className="text-muted-foreground">No beta code</span>
          )}
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-muted-foreground mb-1">
          Subscription Status
        </label>
        <div className="text-sm">
          {user.subscription_status === 'active' && (
            <span className="text-green-500">✓ Active</span>
          )}
          {user.subscription_status === 'trialing' && (
            <span className="text-blue-500">Trial Period</span>
          )}
          {user.subscription_status === 'canceled' && (
            <span className="text-yellow-500">Canceled</span>
          )}
          {user.subscription_status === 'past_due' && (
            <span className="text-red-500">Past Due</span>
          )}
          {!user.subscription_status && (
            <span className="text-muted-foreground">No subscription</span>
          )}
        </div>
      </div>

      {/* Subscription end date not yet implemented */}
    </div>
  );
}
