# Strava Webhooks Setup Guide

## What Are Webhooks?

Strava webhooks enable **real-time activity sync**. The moment an athlete uploads a ride to Strava, your app is notified and automatically:
1. Fetches the activity
2. Stores it in your database
3. Analyzes power curve
4. Updates FTP estimation
5. Recalculates training status

**No manual sync needed!**

## Prerequisites

1. Your backend must be accessible from the internet (not localhost)
2. You need a public URL (e.g., via ngrok for development, or your production domain)
3. The URL must support HTTPS in production

## Setup Steps

### 1. Development Setup (Using ngrok)

For local development, use ngrok to expose your backend:

```bash
# Install ngrok (https://ngrok.com)
brew install ngrok

# Start your backend
cd backend
npm run dev

# In another terminal, expose port 3000
ngrok http 3000
```

You'll get a URL like: `https://abc123.ngrok.io`

### 2. Update Environment Variables

Add to `backend/.env`:

```bash
# Your public callback URL (ngrok URL or production domain)
PUBLIC_URL=https://abc123.ngrok.io

# Webhook verification token (keep this secret)
STRAVA_WEBHOOK_VERIFY_TOKEN=cycling_coach_webhook_2026
```

### 3. Create Webhook Subscription

**Option A: Via API (Recommended)**

Once your backend is running and accessible:

```bash
# Create subscription
curl -X POST http://localhost:3000/api/strava/webhook/subscribe

# View current subscription
curl http://localhost:3000/api/strava/webhook/subscription
```

**Option B: Via Strava API directly**

```bash
curl -X POST https://www.strava.com/api/v3/push_subscriptions \
  -F client_id=YOUR_CLIENT_ID \
  -F client_secret=YOUR_CLIENT_SECRET \
  -F callback_url=https://abc123.ngrok.io/api/strava/webhook \
  -F verify_token=cycling_coach_webhook_2026
```

### 4. Verify Setup

Strava will immediately send a GET request to verify your webhook:
```
GET /api/strava/webhook?hub.mode=subscribe&hub.verify_token=YOUR_TOKEN&hub.challenge=CHALLENGE
```

Your server should respond with:
```json
{ "hub.challenge": "CHALLENGE" }
```

Check your server logs - you should see:
```
Webhook verification request: { mode: 'subscribe', token: '...', challenge: '...' }
Webhook verified successfully
```

### 5. Test It!

1. Upload a ride to Strava (or edit an existing one)
2. Check your server logs - you should see:
   ```
   Webhook event received: {
     "object_type": "activity",
     "object_id": 12345678,
     "aspect_type": "create",
     "owner_id": 123456,
     ...
   }
   Processing new activity: 12345678 for athlete: xxx
   Stored activity: 12345678
   Analyzing power curve for activity: 12345678
   ✅ Successfully processed new activity: 12345678
   ```
3. The activity should appear in your database immediately!

## How It Works

### Event Types

Strava sends three types of events:

1. **create**: New activity uploaded
   - Fetches activity details
   - Stores in database
   - Analyzes power curve
   - Updates FTP
   - Recalculates training status

2. **update**: Activity edited (name, description, etc.)
   - Re-fetches activity
   - Updates database
   - Re-analyzes if power data changed

3. **delete**: Activity deleted from Strava
   - Removes from database
   - Power curves auto-deleted (foreign key cascade)

### Webhook Flow

```
User uploads ride to Strava
          ↓
Strava sends POST to your webhook URL
          ↓
Your server acknowledges (200 OK)
          ↓
Background processing:
  - Fetch activity details
  - Store in database
  - Analyze power curve (1,3,5,8,10,15,20,30,45,60 min)
  - Calculate TSS
  - Update FTP estimation
  - Recalculate CTL/ATL/TSB
          ↓
Activity appears in app instantly!
```

## Webhook Endpoints

### Public (No Auth)
- `GET /api/strava/webhook` - Verification endpoint
- `POST /api/strava/webhook` - Event handler

### Admin (Should add auth in production)
- `POST /api/strava/webhook/subscribe` - Create subscription
- `GET /api/strava/webhook/subscription` - View subscription
- `DELETE /api/strava/webhook/subscription/:id` - Delete subscription

## Production Deployment

### 1. Deploy Your Backend

Deploy to a platform with a public URL:
- Railway: `https://your-app.railway.app`
- Render: `https://your-app.onrender.com`
- AWS/GCP/Azure: Your custom domain

### 2. Update Webhook URL

Delete old subscription:
```bash
curl -X DELETE https://www.strava.com/api/v3/push_subscriptions/SUBSCRIPTION_ID \
  -F client_id=YOUR_CLIENT_ID \
  -F client_secret=YOUR_CLIENT_SECRET
```

Create new subscription with production URL:
```bash
curl -X POST http://your-production-api.com/api/strava/webhook/subscribe
```

### 3. Monitor Webhooks

Check logs to ensure events are being received and processed:
```bash
# Your logs should show:
✅ Successfully processed new activity: 12345678
```

## Troubleshooting

### Webhook verification failing?
- Check `STRAVA_WEBHOOK_VERIFY_TOKEN` matches in both Strava and your `.env`
- Ensure your URL is publicly accessible
- Check server logs for verification requests

### Not receiving events?
- Verify subscription exists: `GET /api/strava/webhook/subscription`
- Check the callback URL is correct
- Test by editing an activity on Strava
- Check server logs for incoming POST requests

### Events received but not processing?
- Check if athlete exists in database with matching `strava_athlete_id`
- Verify Strava tokens are valid (not expired)
- Check server logs for error messages

### Events taking too long?
- Processing is done in background (after 200 response)
- Large activities with power data may take 5-10 seconds
- This is normal and won't block other webhooks

## Rate Limits

- Strava enforces rate limits on API calls
- Your app: 200 requests per 15 minutes, 2,000 per day
- Webhook events don't count toward your rate limit
- Fetching activity details and streams does count

## Security Notes

1. **Verify Token**: Always check the verify token matches
2. **HTTPS Only**: Use HTTPS in production
3. **Validate Events**: Check `object_type` is 'activity'
4. **Idempotency**: Handle duplicate events gracefully (using `strava_activity_id` as unique key)
5. **Auth for Admin**: Add authentication to webhook management endpoints

## Benefits

✅ **Instant Sync**: Activities appear in app immediately after upload
✅ **Automatic Analysis**: Power curves calculated automatically
✅ **FTP Updates**: FTP re-estimated after every ride
✅ **Training Status**: Always up-to-date CTL/ATL/TSB
✅ **No Manual Action**: Users never need to click "sync"
✅ **Resource Efficient**: Only syncs new/changed activities
✅ **Reliable**: Strava retries failed deliveries

## Next Steps

1. Set up ngrok for development testing
2. Create webhook subscription
3. Upload a test ride to Strava
4. Verify it appears in your app instantly
5. Deploy to production
6. Update webhook URL for production

Your app now has **real-time Strava integration**! 🚀
