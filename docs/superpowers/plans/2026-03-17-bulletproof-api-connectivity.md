# Bulletproof API Connectivity Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure the mobile app and web frontend never silently disconnect from the backend — users always see clear feedback and the app self-heals auth/subscription state.

**Architecture:** Three-layer fix: (1) Mobile and frontend refresh the user profile on app open / page load using existing `GET /api/auth/me`, so the local nav gate always reflects server-side truth. (2) API interceptors handle 403 as an auth-level event — refresh profile so RootNavigator can redirect to the subscription gate. (3) Dashboard components surface errors instead of silently showing "No data." Pull-to-refresh and a connectivity banner provide additional UX resilience.

**Tech Stack:** Express (backend), React Native / Expo (mobile), React + Vite (frontend), Zustand (state), Axios (mobile HTTP), fetch (frontend HTTP)

---

### Task 1: Mobile — Refresh user profile on app open

**Why:** The mobile app caches the user object in SecureStore but never refreshes it on app open. If a user's beta code or subscription expires server-side, the local cache is stale, the RootNavigator lets them through, and all API calls 403 silently. This is the PRIMARY root cause of "data not showing."

**Files:**
- Modify: `mobile/src/hooks/useTokenRefresh.ts` — refresh profile after token refresh

- [ ] **Step 1: Update `useTokenRefresh` to refresh profile after token**

Replace the contents of `mobile/src/hooks/useTokenRefresh.ts`:

```typescript
import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useAuthStore } from '../stores/useAuthStore';
import { refreshIfNeeded } from '../api/tokenRefresh';
import { authService } from '../services/authService';

/**
 * Proactively refreshes the auth token AND user profile:
 * 1. When the app first opens (mount)
 * 2. When the app returns to foreground
 * 3. On a periodic timer (every 45 minutes) for the token
 *
 * Sets tokenReady=true once the initial refresh check completes,
 * so dashboard components know it's safe to fetch data.
 */
export function useTokenRefresh() {
  const { user } = useAuthStore();
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!user) return;

    // Refresh token and profile on mount, then mark ready
    const init = async () => {
      try {
        await refreshIfNeeded();
      } catch {
        // refreshIfNeeded handles logout internally
      }
      // Always refresh the user profile so subscription/beta status is current.
      // This ensures RootNavigator's nav gate reflects server-side truth.
      try {
        await authService.getProfile();
      } catch {
        // Non-fatal — profile stays as cached. If token is invalid,
        // the 401 interceptor will have already handled logout.
      }
      useAuthStore.getState().setTokenReady(true);
    };
    init();

    // Refresh when app comes to foreground
    const handleAppState = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        refreshIfNeeded();
        // Fire-and-forget profile refresh on foreground (non-blocking)
        authService.getProfile().catch(() => {});
      }
    };
    const subscription = AppState.addEventListener('change', handleAppState);

    // Periodic token refresh every 45 minutes
    intervalRef.current = setInterval(refreshIfNeeded, 45 * 60 * 1000);

    return () => {
      subscription.remove();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [user?.id]);
}
```

Note: `authService.getProfile()` already exists at `mobile/src/services/authService.ts:57-61`. It calls `GET /api/auth/me` (which requires only `authenticateJWT`, no subscription check) and updates the Zustand store via `useAuthStore.getState().setUser(data)`. No new endpoint needed.

- [ ] **Step 2: Verify no circular dependency**

The import chain is: `useTokenRefresh.ts` → `authService.ts` → `client.ts`. `useTokenRefresh.ts` does not export anything consumed by `authService` or `client`, so there is no circular dependency.

- [ ] **Step 3: Commit**

```bash
git add mobile/src/hooks/useTokenRefresh.ts
git commit -m "feat: refresh user profile on app open and foreground to sync subscription state"
```

---

### Task 2: Mobile — Handle 403 as auth-level event in API interceptor

**Why:** When `checkSubscription` middleware returns 403, the mobile interceptor ignores it (only handles 401). The screen catches it silently and shows "No data." We need to intercept 403, refresh the profile, and let the RootNavigator redirect them to the BetaAccessScreen.

**Files:**
- Modify: `mobile/src/api/client.ts` — add 403 handling in response interceptor

- [ ] **Step 1: Add 403 handler in the response interceptor**

In `mobile/src/api/client.ts`, replace the final `return Promise.reject(error);` on line 102 with:

```typescript
    // Handle 403 — subscription/beta expired.
    // Refresh profile so RootNavigator can redirect to BetaAccessScreen.
    // We treat ALL 403s from non-auth endpoints as subscription issues,
    // since checkSubscription is the only source of 403 in this codebase.
    if (error.response?.status === 403 && !isAuthEndpoint) {
      try {
        // Dynamic import to avoid circular dependency (authService imports client)
        const { authService } = await import('../services/authService');
        await authService.getProfile();
      } catch {
        // If profile refresh also fails, the error still propagates to the screen
      }
    }

    return Promise.reject(error);
```

- [ ] **Step 2: Commit**

```bash
git add mobile/src/api/client.ts
git commit -m "feat: handle 403 subscription errors by refreshing user profile for nav redirect"
```

---

### Task 3: Mobile — Surface API errors in dashboard components

**Why:** CoachCard, MetricsCard, WeeklyVolumeChart, PowerCurveChart, and FTPEstimateCard all catch API errors and show "No data" text. Users think they have no data when actually the API is failing. RecentActivities already shows errors correctly — we need the same pattern in the other 5 components.

**Files:**
- Modify: `mobile/src/components/dashboard/CoachCard.tsx`
- Modify: `mobile/src/components/dashboard/MetricsCard.tsx`
- Modify: `mobile/src/components/dashboard/WeeklyVolumeChart.tsx`
- Modify: `mobile/src/components/dashboard/PowerCurveChart.tsx`
- Modify: `mobile/src/components/dashboard/FTPEstimateCard.tsx`

- [ ] **Step 1: Fix CoachCard — track error separately from null data**

In `mobile/src/components/dashboard/CoachCard.tsx`, add an `error` state (separate from data being null, so a legitimate "no training data" scenario doesn't show a false error):

```typescript
  const [error, setError] = useState(false);
```

Update the useEffect (lines 27-36):

```typescript
  useEffect(() => {
    let failed = 0;
    Promise.all([
      dailyAnalysisService.getTodaySuggestion().catch(() => { failed++; return null; }),
      trainingService.getTrainingStatus().catch(() => { failed++; return null; }),
    ]).then(([s, t]) => {
      if (failed === 2) setError(true);
      setSuggestion(s);
      setTraining(t ?? null);
      setLoading(false);
    });
  }, []);
```

After the loading check (after line 44), add:

```typescript
  if (error) {
    return (
      <Card>
        <Text style={styles.title}>Training Status</Text>
        <Text style={{ color: '#ef4444', fontSize: 13, marginTop: 8 }}>
          Unable to load training data. Pull down to refresh.
        </Text>
      </Card>
    );
  }
```

- [ ] **Step 2: Fix MetricsCard — distinguish error from empty data**

In `mobile/src/components/dashboard/MetricsCard.tsx`, add `error` state:

```typescript
  const [error, setError] = useState(false);
```

Update the catch block (line 35-37):

```typescript
    } catch (err: any) {
      console.warn('[MetricsCard] fetch error:', err?.response?.status, err?.response?.data?.error || err.message);
      setData(null);
      setError(true);
    } finally {
```

Update the empty state text (line 74):

```typescript
        <Text style={styles.empty}>
          {error ? 'Unable to load metrics. Pull down to refresh.' : 'No data for this period'}
        </Text>
```

Also reset error when period changes — update the `load` function:

```typescript
  const load = async () => {
    setLoading(true);
    setError(false);
    try {
```

- [ ] **Step 3: Fix WeeklyVolumeChart — add error state**

In `mobile/src/components/dashboard/WeeklyVolumeChart.tsx`, add `error` state:

```typescript
  const [error, setError] = useState(false);
```

Update the catch block (lines 50-53):

```typescript
    }).catch((err) => {
      console.warn('[WeeklyVolumeChart] fetch error:', err?.response?.status, err?.response?.data?.error || err.message);
      setError(true);
      setLoading(false);
    });
```

After the loading check, when `data.length === 0`, render the error message if `error` is true. Find the existing empty state text (should be something like "No data yet") and update it:

```typescript
  // Where data.length === 0 is checked:
  if (error) {
    return (
      <Card>
        <Text style={styles.title}>Weekly Volume</Text>
        <Text style={{ color: '#ef4444', fontSize: 13, marginVertical: 12 }}>
          Unable to load chart data. Pull down to refresh.
        </Text>
      </Card>
    );
  }
```

- [ ] **Step 4: Fix PowerCurveChart — add error state**

In `mobile/src/components/dashboard/PowerCurveChart.tsx`, add `error` state:

```typescript
  const [error, setError] = useState(false);
```

Update the catch block (lines 43-46):

```typescript
    }).catch((err) => {
      console.warn('[PowerCurveChart] fetch error:', err?.response?.status, err?.response?.data?.error || err.message);
      setError(true);
      setLoading(false);
    });
```

Where the "No power data yet" empty state is shown, conditionally show error:

```typescript
  if (error) {
    return (
      <Card>
        <Text style={styles.title}>Power Curve</Text>
        <Text style={{ color: '#ef4444', fontSize: 13, marginVertical: 12 }}>
          Unable to load power data. Pull down to refresh.
        </Text>
      </Card>
    );
  }
```

- [ ] **Step 5: Fix FTPEstimateCard — add error state**

In `mobile/src/components/dashboard/FTPEstimateCard.tsx`, add `error` state:

```typescript
  const [error, setError] = useState(false);
```

Update the useEffect (lines 16-24). Currently it chains two `.catch(() => ...)` calls that swallow errors:

```typescript
  useEffect(() => {
    authService.getProfile().catch(() => {}).then(() =>
      ftpService.getEstimate().then(e => {
        setEstimate(e);
        setLoading(false);
      }).catch(() => {
        setError(true);
        setLoading(false);
      })
    );
  }, []);
```

Change the `if (!estimate) return null;` line (48) to also check error:

```typescript
  if (!estimate && !error) return null;
  if (error) {
    return (
      <Card>
        <Text style={styles.title}>FTP Estimate</Text>
        <Text style={{ color: '#ef4444', fontSize: 13 }}>
          Unable to load FTP estimate.
        </Text>
      </Card>
    );
  }
```

Note: When FTP estimate returns null legitimately (no rides), the card still hides itself. Error only shows when the API call actually failed.

- [ ] **Step 6: Commit**

```bash
git add mobile/src/components/dashboard/
git commit -m "fix: surface API errors in dashboard components instead of silent empty states"
```

---

### Task 4: Frontend — Handle 403 and refresh profile on page load

**Why:** The web frontend has the same stale-profile issue. The Zustand auth store persists to localStorage but the user profile is never refreshed on page load. A 403 from subscription check is returned as `{ error }` but never triggers a profile refresh or redirect.

**Files:**
- Modify: `frontend/src/services/api.ts` — add 403 handling
- Modify: `frontend/src/App.tsx` — add profile refresh on mount

- [ ] **Step 1: Add 403 handling in frontend ApiClient**

In `frontend/src/services/api.ts`, inside the `request` method, after the existing 401 handling block (lines 94-101), add:

```typescript
      // If forbidden (subscription expired), refresh profile so UI can redirect.
      // Uses a self-referential call with retryCount=999 to prevent re-entry.
      if (response.status === 403 && requireAuth && retryCount === 0) {
        try {
          const profileResult = await this.request<{ user: any }>('/api/auth/me', { method: 'GET', requireAuth: true }, 999);
          if (profileResult.data) {
            const { useAuthStore } = await import('../stores/useAuthStore');
            useAuthStore.getState().setUser(profileResult.data);
          }
        } catch {
          // Non-fatal
        }
      }
```

Note: Using `retryCount=999` prevents the 403 handler from recursing if the profile endpoint itself returns 403 (it won't, since `/api/auth/me` has no subscription check, but this is a safety guard).

- [ ] **Step 2: Add profile refresh on page load in ProtectedRoutes**

In `frontend/src/App.tsx`, inside the `ProtectedRoutes` function component, add this useEffect (after the existing `useEffect` for welcome modal, around line 39):

```typescript
  // Refresh user profile on mount to sync subscription/beta status with server
  useEffect(() => {
    const { accessToken } = useAuthStore.getState();
    if (accessToken) {
      import('./services/authService').then(({ authService }) => {
        authService.getProfile().catch(() => {
          // If profile fetch fails, 401 handler will logout if needed
        });
      });
    }
  }, []);
```

Add `authService` to imports is also fine — no circular dependency here since `App.tsx` doesn't export anything consumed by `authService`. So alternatively:

```typescript
import { authService } from './services/authService';

// Inside ProtectedRoutes:
  useEffect(() => {
    authService.getProfile().catch(() => {});
  }, []);
```

This is simpler and correct since `ProtectedRoutes` only renders when `user` exists (so there's always a token).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/services/api.ts frontend/src/App.tsx
git commit -m "feat: refresh user profile on page load and handle 403 subscription errors"
```

---

### Task 5: Mobile — Add pull-to-refresh on DashboardScreen

**Why:** When errors occur, users need a way to retry without restarting the app. The dashboard currently has no pull-to-refresh. Adding `RefreshControl` gives users an explicit retry mechanism. Since dashboard components use `key={refreshKey}` pattern, incrementing the key remounts them, which resets their `useState` (including error states) and re-triggers their `useEffect` data fetches.

**Files:**
- Modify: `mobile/src/screens/DashboardScreen.tsx`

- [ ] **Step 1: Add RefreshControl to the ScrollView**

In `mobile/src/screens/DashboardScreen.tsx`:

Add `RefreshControl` to the import (line 2):

```typescript
import { ScrollView, StyleSheet, View, AppState, RefreshControl } from 'react-native';
```

Add state and handler inside `DashboardScreen` (after `refreshKey` state):

```typescript
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setRefreshKey((k) => k + 1);
    // Components will remount and refetch. Use a short delay to dismiss the spinner.
    setTimeout(() => setRefreshing(false), 1000);
  }, []);
```

Update the `<ScrollView>` to include `refreshControl`:

```typescript
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor="#3b82f6"
            colors={['#3b82f6']}
          />
        }
      >
```

- [ ] **Step 2: Commit**

```bash
git add mobile/src/screens/DashboardScreen.tsx
git commit -m "feat: add pull-to-refresh on dashboard for error recovery"
```

---

### Task 6: Mobile — Add connection status banner

**Why:** If the device has no internet or the backend is unreachable, every API call fails silently. A connectivity banner at the top of the app tells the user immediately that something is wrong.

**Files:**
- Create: `mobile/src/components/ui/ConnectionBanner.tsx`
- Modify: `mobile/App.tsx` — render banner above navigation

- [ ] **Step 1: Create ConnectionBanner component**

Create `mobile/src/components/ui/ConnectionBanner.tsx`:

```typescript
import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, AppState } from 'react-native';

const API_URL = process.env.EXPO_PUBLIC_API_URL || 'http://localhost:3000';

export default function ConnectionBanner() {
  const [connected, setConnected] = useState(true);
  const connectedRef = useRef(true);

  const checkConnection = async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${API_URL}/health`, { signal: controller.signal });
      clearTimeout(timeout);
      connectedRef.current = res.ok;
      setConnected(res.ok);
    } catch {
      connectedRef.current = false;
      setConnected(false);
    }
  };

  useEffect(() => {
    checkConnection();

    // Re-check on app foreground
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') checkConnection();
    });

    return () => sub.remove();
  }, []);

  // When disconnected, poll every 10 seconds to detect recovery
  useEffect(() => {
    if (connected) return;
    const retry = setInterval(checkConnection, 10000);
    return () => clearInterval(retry);
  }, [connected]);

  if (connected) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>No connection to server. Retrying...</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#dc2626',
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },
});
```

- [ ] **Step 2: Render ConnectionBanner in App.tsx**

In `mobile/App.tsx`, add the import and render the banner inside the `SafeAreaProvider`, before the `NavigationContainer`:

```typescript
import ConnectionBanner from './src/components/ui/ConnectionBanner';
```

Inside the return JSX, after `<SafeAreaProvider>` and before `<BottomSheetModalProvider>`:

```typescript
        <ConnectionBanner />
        <BottomSheetModalProvider>
```

- [ ] **Step 3: Commit**

```bash
git add mobile/src/components/ui/ConnectionBanner.tsx mobile/App.tsx
git commit -m "feat: add connection banner when backend is unreachable"
```

---

### Task 7: Verify all fixes end-to-end

**Why:** We need to confirm the fixes actually work in the scenarios that broke for test users.

- [ ] **Step 1: Test scenario — expired subscription (mobile)**

1. In Supabase SQL editor, set a test user's `beta_access_code` to NULL and `subscription_status` to 'inactive'
2. Open the mobile app (while logged in as that user)
3. **Expected:** App refreshes profile on open → RootNavigator sees no beta/subscription → redirects to BetaAccessScreen
4. **Previously:** Dashboard would load with all empty cards, user had no idea why

- [ ] **Step 2: Test scenario — backend unreachable**

1. Turn off the backend server (or set mobile .env to wrong URL)
2. Open the mobile app
3. **Expected:** Red "No connection to server" banner appears at top. Dashboard components show "Unable to load..." error messages (not "No data").
4. **Previously:** All cards showed "No data" with no indication of a problem

- [ ] **Step 3: Test scenario — 403 mid-session**

1. While the app is open and showing data, change the user's `beta_access_code` to NULL in DB
2. Navigate to a different tab, then back to dashboard
3. **Expected:** API calls return 403 → interceptor refreshes profile → RootNavigator redirects to BetaAccessScreen
4. **Previously:** Dashboard would show stale data, new fetches would silently fail

- [ ] **Step 4: Test scenario — web frontend with expired subscription**

1. Same as step 1 but on the web frontend
2. **Expected:** Profile refreshes on page load → `ProtectedRoutes` sees no access → shows BetaAccessForm
3. Navigating to chat or other protected pages that 403 → profile refresh triggers redirect

- [ ] **Step 5: Test scenario — pull to refresh recovery**

1. Cause an error state (e.g., backend briefly down)
2. Dashboard shows error messages
3. Start backend again, pull down on dashboard
4. **Expected:** Components remount, refetch, and show real data

- [ ] **Step 6: Commit any fixes found during testing**

```bash
git commit -m "fix: address issues found during end-to-end verification"
```
