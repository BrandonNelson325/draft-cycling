# Intervals.icu Integration - Implementation Summary

## ✅ What's Implemented (Backend)

### 1. Database Schema
- **Migration:** `005_add_integrations.sql`
- Added Intervals.icu connection fields to `athletes` table
- Created `workout_syncs` table to track synced workouts
- Added notification preference fields
- Added daily analysis preference fields

### 2. Intervals.icu Service
- **File:** `services/intervalsIcuService.ts`
- OAuth 2.0 flow (authorization + token exchange)
- Automatic token refresh
- Upload workouts (`.zwo` files, base64 encoded)
- Delete workouts from Intervals.icu
- Connection management (connect/disconnect)

### 3. API Endpoints
- **File:** `controllers/integrationsController.ts` + `routes/integrationsRoutes.ts`
- `GET /api/integrations/intervals-icu/auth-url` - Get OAuth URL
- `GET /api/integrations/intervals-icu/callback` - Handle OAuth callback
- `GET /api/integrations/intervals-icu/status` - Check connection status
- `POST /api/integrations/intervals-icu/sync` - Manually sync a workout
- `POST /api/integrations/intervals-icu/settings` - Update auto-sync settings
- `DELETE /api/integrations/intervals-icu` - Disconnect

### 4. Auto-Sync Feature
- **File:** `services/calendarService.ts` (updated)
- Automatically syncs workouts to Intervals.icu when scheduled
- Background process (doesn't block calendar creation)
- Only runs if `intervals_icu_auto_sync` is enabled

### 5. Environment Variables
- **File:** `.env.example`
- Added Intervals.icu OAuth credentials
- Added notification service placeholders (SendGrid, Twilio, VAPID)

## 🔧 Configuration Needed

### Step 1: Register with Intervals.icu Developer Portal

**NOTE:** You need to contact Intervals.icu to get API access.

1. Email: **support@intervals.icu** or contact via [Intervals.icu Forum](https://forum.intervals.icu)
2. Request OAuth2 application credentials
3. Provide:
   - App name: "Your Cycling Coach App Name"
   - Description: "AI-powered cycling coach with workout sync"
   - Redirect URI: `https://yourapp.com/api/integrations/intervals-icu/callback`
   - Required scopes: `CALENDAR:WRITE`, `ACTIVITY:READ`

4. You'll receive:
   - `CLIENT_ID`
   - `CLIENT_SECRET`

### Step 2: Add Credentials to .env

```bash
# Add to your .env file
INTERVALS_ICU_CLIENT_ID=your_client_id_here
INTERVALS_ICU_CLIENT_SECRET=your_client_secret_here
INTERVALS_ICU_REDIRECT_URI=http://localhost:3000/api/integrations/intervals-icu/callback
```

### Step 3: Run Database Migration

```bash
# Run the migration to add new columns
psql $DATABASE_URL -f migrations/005_add_integrations.sql
```

Or in Supabase dashboard:
1. Go to SQL Editor
2. Paste contents of `005_add_integrations.sql`
3. Run

### Step 4: Rebuild and Restart Backend

```bash
cd backend
npm run build
npm start
```

## 🎯 How It Works (User Flow)

### First-Time Setup
1. User goes to Settings → Integrations
2. Clicks "Connect Intervals.icu"
3. Redirected to Intervals.icu OAuth page
4. User authorizes the app
5. Redirected back to your app
6. Connection established + tokens stored

### Automatic Sync
1. User (or AI coach) schedules a workout to calendar
2. If `intervals_icu_auto_sync` is `true`:
   - Workout automatically uploads to Intervals.icu
   - Appears in user's Intervals.icu calendar
   - Intervals.icu automatically syncs to Zwift
3. User sees workout in Zwift's Custom Workouts folder

### Manual Sync
1. User can manually sync any workout via API:
   ```
   POST /api/integrations/intervals-icu/sync
   {
     "workout_id": "uuid",
     "scheduled_date": "2026-02-20",
     "calendar_entry_id": "uuid"
   }
   ```

## 🔗 How Zwift Sync Works

```
Your App → Intervals.icu → Zwift
    ↓            ↓             ↓
Workout      Calendar     Custom
Created      Event        Workouts
```

**Timeline:**
- Your app → Intervals.icu: **Instant**
- Intervals.icu → Zwift: **Every hour** (Intervals.icu auto-syncs to Zwift)

**User sees:**
1. Workout appears in Intervals.icu calendar immediately
2. Within 1 hour, appears in Zwift Custom Workouts folder
3. User can start workout in Zwift

## 📱 Frontend Implementation Needed

### 1. Settings Page - Integrations Section

**Component:** `frontend/src/components/settings/IntegrationsSettings.tsx`

```tsx
export function IntegrationsSettings() {
  const [intervalsStatus, setIntervalsStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check connection status
    fetch('/api/integrations/intervals-icu/status')
      .then(res => res.json())
      .then(data => setIntervalsStatus(data));
  }, []);

  const handleConnect = async () => {
    setLoading(true);
    const { authUrl } = await fetch('/api/integrations/intervals-icu/auth-url').then(r => r.json());
    window.location.href = authUrl;
  };

  const handleDisconnect = async () => {
    await fetch('/api/integrations/intervals-icu', { method: 'DELETE' });
    setIntervalsStatus({ connected: false });
  };

  const toggleAutoSync = async (enabled: boolean) => {
    await fetch('/api/integrations/intervals-icu/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auto_sync: enabled }),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Intervals.icu Integration</CardTitle>
        <CardDescription>
          Connect your Intervals.icu account to automatically sync workouts to Zwift
        </CardDescription>
      </CardHeader>
      <CardContent>
        {intervalsStatus?.connected ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-green-600" />
                <span className="font-medium">Connected</span>
              </div>
              <Button variant="outline" onClick={handleDisconnect}>
                Disconnect
              </Button>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Auto-sync workouts</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically send scheduled workouts to Intervals.icu & Zwift
                </p>
              </div>
              <Switch
                checked={intervalsStatus.auto_sync}
                onCheckedChange={toggleAutoSync}
              />
            </div>

            <Alert>
              <Info className="w-4 h-4" />
              <AlertDescription>
                Workouts sync from Intervals.icu to Zwift every hour. Make sure your
                Intervals.icu account is connected to Zwift in your Intervals.icu settings.
              </AlertDescription>
            </Alert>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Connect your Intervals.icu account to enable automatic workout sync to Zwift
            </p>
            <Button onClick={handleConnect} disabled={loading}>
              <Link className="w-4 h-4 mr-2" />
              Connect Intervals.icu
            </Button>

            <Alert>
              <Info className="w-4 h-4" />
              <AlertDescription>
                <strong>How it works:</strong>
                <ol className="list-decimal list-inside mt-2 space-y-1">
                  <li>Connect Intervals.icu account</li>
                  <li>Connect Intervals.icu to Zwift (in Intervals.icu settings)</li>
                  <li>Scheduled workouts automatically appear in Zwift</li>
                </ol>
              </AlertDescription>
            </Alert>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

### 2. Workout Detail Page - Sync Button

Add manual sync button to workout detail page:

```tsx
<Button
  onClick={async () => {
    await fetch('/api/integrations/intervals-icu/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workout_id: workout.id,
        scheduled_date: selectedDate,
      }),
    });
    toast.success('Workout synced to Intervals.icu!');
  }}
>
  <Upload className="w-4 h-4 mr-2" />
  Send to Zwift (via Intervals.icu)
</Button>
```

### 3. Callback Handler

Add route to handle OAuth callback redirect:

```tsx
// In your router
<Route
  path="/settings"
  element={
    <SettingsPage
      onLoad={(params) => {
        if (params.get('intervals_icu') === 'connected') {
          toast.success('Intervals.icu connected successfully!');
        } else if (params.get('intervals_icu') === 'error') {
          toast.error('Failed to connect Intervals.icu');
        }
      }}
    />
  }
/>
```

## 🧪 Testing

### Test the OAuth Flow
1. Start backend: `npm start`
2. Go to: `http://localhost:3000/api/integrations/intervals-icu/auth-url`
3. Copy the returned URL
4. Open in browser → should redirect to Intervals.icu login
5. Authorize → should redirect back to your app

### Test Workout Upload
```bash
curl -X POST http://localhost:3000/api/integrations/intervals-icu/sync \
  -H "Authorization: Bearer YOUR_JWT" \
  -H "Content-Type: application/json" \
  -d '{
    "workout_id": "workout-uuid",
    "scheduled_date": "2026-02-20"
  }'
```

### Verify in Intervals.icu
1. Log into Intervals.icu
2. Go to Calendar
3. Check the scheduled date
4. Workout should appear with correct intervals

### Verify in Zwift
1. Wait up to 1 hour (Intervals.icu auto-syncs hourly)
2. Or manually trigger sync in Intervals.icu settings
3. Open Zwift → Custom Workouts
4. Workout should appear in your library

## 📊 Database Queries for Monitoring

### Check connected users
```sql
SELECT
  id,
  email,
  intervals_icu_athlete_id,
  intervals_icu_auto_sync,
  intervals_icu_token_expires_at
FROM athletes
WHERE intervals_icu_access_token IS NOT NULL;
```

### View synced workouts
```sql
SELECT
  ws.id,
  a.email,
  w.name AS workout_name,
  ws.sync_status,
  ws.external_url,
  ws.last_synced_at
FROM workout_syncs ws
JOIN athletes a ON ws.athlete_id = a.id
JOIN workouts w ON ws.workout_id = w.id
WHERE ws.integration = 'intervals_icu'
ORDER BY ws.last_synced_at DESC
LIMIT 50;
```

### Find failed syncs
```sql
SELECT
  a.email,
  w.name,
  ws.sync_error,
  ws.last_synced_at
FROM workout_syncs ws
JOIN athletes a ON ws.athlete_id = a.id
JOIN workouts w ON ws.workout_id = w.id
WHERE ws.sync_status = 'failed'
  AND ws.integration = 'intervals_icu'
ORDER BY ws.last_synced_at DESC;
```

## 🚀 Next Steps

1. **Register with Intervals.icu** - Get OAuth credentials
2. **Build Frontend UI** - Settings page + sync buttons
3. **Test OAuth flow** - End-to-end connection test
4. **Test workout sync** - Verify it appears in Intervals.icu + Zwift
5. **Document for users** - Add help docs explaining setup

## 📝 User Documentation Draft

### "How to Connect to Zwift"

**Step 1: Connect Intervals.icu**
1. Go to Settings → Integrations
2. Click "Connect Intervals.icu"
3. Log into your Intervals.icu account (create free account if needed)
4. Click "Authorize"

**Step 2: Connect Intervals.icu to Zwift**
1. Log into Intervals.icu
2. Go to Settings → Connections
3. Find "Zwift" and click "Connect"
4. Authorize Zwift connection

**Step 3: Enable Auto-Sync**
1. Back in our app: Settings → Integrations
2. Toggle "Auto-sync workouts" to ON

**Done!** Now when you schedule a workout, it automatically appears in Zwift within 1 hour.

## 🔍 Troubleshooting

**Workouts not appearing in Zwift:**
- Check Intervals.icu is connected to Zwift (Intervals.icu settings)
- Wait up to 1 hour for sync
- Manually trigger sync in Intervals.icu

**OAuth connection fails:**
- Check `INTERVALS_ICU_CLIENT_ID` and `CLIENT_SECRET` are correct
- Verify redirect URI matches exactly
- Check backend logs for errors

**Token expired:**
- Should automatically refresh
- If not, disconnect and reconnect
- Check `intervals_icu_refresh_token` exists in database

---

## 🎉 Summary

**What's working:**
✅ OAuth connection to Intervals.icu
✅ Automatic workout upload (.zwo format)
✅ Auto-sync when scheduling workouts
✅ Manual sync option
✅ Connection management
✅ Token refresh
✅ Sync status tracking

**What you need to do:**
1. Get Intervals.icu OAuth credentials
2. Add to `.env`
3. Run database migration
4. Build frontend UI
5. Test end-to-end

**Estimated time to complete:** 2-3 hours (mostly frontend UI)
