-- Promo codes table for beta access, discounts, and free trials
CREATE TABLE IF NOT EXISTS promo_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('beta_access', 'discount_percent', 'discount_fixed', 'free_trial')),
  -- For discount codes: percent off or fixed amount in cents
  discount_value INTEGER,
  -- How many times this code can be used (NULL = unlimited)
  max_uses INTEGER,
  -- How many times it has been used
  current_uses INTEGER NOT NULL DEFAULT 0,
  -- Stripe coupon ID (created when promo code is a discount)
  stripe_coupon_id TEXT,
  -- Optional: trial days to grant
  trial_days INTEGER,
  -- Active window
  active_from TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  active_until TIMESTAMPTZ,
  -- Soft delete
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Track which users used which codes
CREATE TABLE IF NOT EXISTS promo_code_redemptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promo_code_id UUID NOT NULL REFERENCES promo_codes(id),
  athlete_id UUID NOT NULL REFERENCES athletes(id),
  redeemed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(promo_code_id, athlete_id)
);

-- Seed the existing beta code as a promo code
INSERT INTO promo_codes (code, type, max_uses, is_active)
VALUES ('CYCLECOACH2026', 'beta_access', NULL, true)
ON CONFLICT (code) DO NOTHING;

-- RLS policies
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_code_redemptions ENABLE ROW LEVEL SECURITY;

-- Only service role can manage promo codes (no user-facing policies needed)
-- Redemptions: users can see their own
CREATE POLICY "Users can view own redemptions"
  ON promo_code_redemptions FOR SELECT
  USING (athlete_id = auth.uid());
