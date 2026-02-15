# Comprehensive Testing Guide

## Overview

This guide covers testing all features of the AI Cycling Coach application, from authentication through AI coaching analysis.

---

## Prerequisites

1. **Supabase Setup**:
   - Run all migrations in order
   - Verify tables exist
   - Enable RLS policies

2. **Environment Variables**:
   - Backend `.env` configured
   - Frontend `.env` configured
   - Valid Strava API credentials
   - Valid Anthropic API key

3. **Services Running**:
   - Backend: `cd backend && npm run dev` (port 3000)
   - Frontend: `cd frontend && npm run dev` (port 5173)

---

## Test Suites

### Suite 1: Authentication & Beta Access

#### Test 1.1: User Registration
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "test123456",
    "full_name": "Test Cyclist"
  }'
```

**Expected**: User created, returns user object + session tokens

#### Test 1.2: User Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "test123456"
  }'
```

**Expected**: Returns user + access_token
**Save the access_token** for subsequent requests!

#### Test 1.3: Get Profile (Protected)
```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected**: Returns user profile

#### Test 1.4: Beta Access Activation
```bash
curl -X POST http://localhost:3000/api/beta/activate \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code": "CYCLECOACH2026"}'
```

**Expected**: Beta access activated, user updated

#### Test 1.5: Check Beta Access
```bash
curl http://localhost:3000/api/beta/check \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected**: `{ "has_access": true, "access_type": "beta" }`

---

### Suite 2: Strava Connection

#### Test 2.1: Get Strava Auth URL
```bash
curl http://localhost:3000/api/strava/auth-url \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected**: Returns `{ "auth_url": "https://www.strava.com/oauth/authorize?..." }`

#### Test 2.2: Connect Strava (Manual)
1. Open the auth_url in browser
2. Authorize the app
3. Get redirected with tokens
4. Send tokens to connect endpoint

```bash
curl -X POST http://localhost:3000/api/strava/connect \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "access_token": "STRAVA_ACCESS_TOKEN",
    "refresh_token": "STRAVA_REFRESH_TOKEN",
    "expires_at": 1234567890,
    "athlete_id": 123456
  }'
```

**Expected**: Strava connected, initial sync starts

#### Test 2.3: Check Connection Status
```bash
curl http://localhost:3000/api/strava/status \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected**: `{ "connected": true, "strava_athlete_id": 123456 }`

#### Test 2.4: Manual Sync
```bash
curl -X POST http://localhost:3000/api/strava/sync \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected**: `{ "synced": 10, "total": 10, "analyzed": 5 }`

#### Test 2.5: Get Activities
```bash
curl http://localhost:3000/api/strava/activities \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected**: List of synced activities

---

### Suite 3: Webhooks (Requires Public URL)

#### Test 3.1: Create Webhook Subscription
```bash
curl -X POST http://localhost:3000/api/strava/webhook/subscribe
```

**Expected**: Webhook subscription created

**Note**: Requires your backend to be publicly accessible (ngrok, production URL)

#### Test 3.2: View Subscription
```bash
curl http://localhost:3000/api/strava/webhook/subscription
```

**Expected**: Current subscription details

#### Test 3.3: Test Webhook (Upload Ride to Strava)
1. Upload a ride to Strava
2. Check backend logs for webhook event
3. Verify activity appears in database

**Expected Logs**:
```
Webhook event received: {...}
Processing new activity: 12345678
Stored activity: 12345678
Analyzing power curve for activity: 12345678
✅ Successfully processed new activity: 12345678
```

---

### Suite 4: Power Curve Analysis

#### Test 4.1: Get Personal Records
```bash
curl http://localhost:3000/api/power/prs \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected**: PRs for all 10 durations (1,3,5,8,10,15,20,30,45,60 min)

#### Test 4.2: Get Activity Power Curve
```bash
curl http://localhost:3000/api/power/activity/STRAVA_ACTIVITY_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected**: Power curve data for specific activity

#### Test 4.3: Manually Analyze Activity
```bash
curl -X POST http://localhost:3000/api/power/analyze/STRAVA_ACTIVITY_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected**: Power curve calculated and stored

---

### Suite 5: FTP Estimation

#### Test 5.1: Get FTP Estimation
```bash
curl http://localhost:3000/api/ftp/estimate \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected**:
```json
{
  "estimation": {
    "estimated_ftp": 250,
    "confidence": "high",
    "based_on": "Best 20-min power from 12 rides in last 6 weeks",
    "best_20min_power": 263,
    "activity_count": 12
  }
}
```

#### Test 5.2: Update FTP from Estimation
```bash
curl -X POST http://localhost:3000/api/ftp/update \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected**: FTP updated in athlete profile

#### Test 5.3: Get FTP History
```bash
curl http://localhost:3000/api/ftp/history?weeks=12 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected**: Weekly FTP trends

---

### Suite 6: Training Status

#### Test 6.1: Get Training Status
```bash
curl http://localhost:3000/api/training/status \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected**:
```json
{
  "load": {
    "ctl": 65.2,
    "atl": 72.1,
    "tsb": -6.9
  },
  "status": {
    "status": "productive",
    "description": "You are carrying fatigue but adapting well",
    "recommendation": "Maintain current training load, recovery is important"
  }
}
```

#### Test 6.2: Get Metrics History
```bash
curl http://localhost:3000/api/training/metrics?days=90 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected**: Daily CTL/ATL/TSB values for charting

---

### Suite 7: AI Coaching

#### Test 7.1: Analyze Training
```bash
curl http://localhost:3000/api/ai/analyze-training \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected**: Comprehensive AI analysis of recent training

**Sample Response**:
```json
{
  "analysis": "Based on your current training status (TSB: -6.9), you're in a productive training zone with moderate fatigue. Your recent rides show consistent volume with 3 quality sessions in the past week...

Key Observations:
1. Your 20-min power is improving (263W best recent effort)
2. CTL is building steadily (65.2), showing good fitness gains
3. ATL is elevated (72.1), indicating recent training load

Recommendations for Next Week:
- Include 2 recovery rides in Zone 1-2 (<187W)
- One threshold interval session (227-262W)
- One longer endurance ride (187-234W)
- Take at least 1 complete rest day

This will allow you to maintain fitness while managing fatigue."
}
```

#### Test 7.2: Analyze Specific Ride
```bash
curl http://localhost:3000/api/ai/analyze-ride/STRAVA_ACTIVITY_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

**Expected**: Detailed analysis of specific ride

**Sample Response**:
```json
{
  "analysis": "Ride Analysis: \"Tuesday Threshold Intervals\"

This was a well-executed threshold workout. Your 20-minute best effort of 260W is 99% of your best recent 20-min power (263W), showing you're maintaining fitness well.

Key Metrics:
- Average Power: 220W (88% FTP)
- Duration: 75 minutes
- TSS: 82 (appropriate for a hard interval session)

Power Curve Highlights:
- 20-min: 260W (PR territory!)
- 5-min: 285W
- 1-min: 405W

Analysis:
Given your current TSB of -6.9, this workout was appropriately challenging. The intensity was right for a threshold session without digging too deep into your recovery reserves.

Next Time:
Consider extending the warm-up by 5 minutes - your 1-min power suggests you had more in the tank. The intervals were well-paced and consistent."
}
```

#### Test 7.3: Suggest Workout
```bash
curl -X POST http://localhost:3000/api/ai/suggest-workout \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{}'
```

**Expected**: Personalized workout suggestion

**Sample Response**:
```json
{
  "suggestion": "Recovery Endurance Ride

Given your current TSB of -6.9 (productive but fatigued), I recommend an easy endurance ride to promote recovery while maintaining aerobic fitness.

Workout Structure:
1. Warm-up: 10 minutes
   - Start at 125W, gradually increase to 175W

2. Main Set: 60 minutes
   - Maintain 187-200W (Zone 2, 75-80% FTP)
   - Keep cadence 85-95 rpm
   - Focus on smooth pedaling

3. Cool-down: 10 minutes
   - Gradually decrease from 175W to 100W

Total Duration: 80 minutes
Target TSS: ~50

Rationale:
This ride will contribute to your aerobic base without adding significant fatigue. Your ATL is currently elevated (72.1), so keeping intensity in Zone 2 allows active recovery while building CTL gradually.

Tips:
- If you feel fatigued, reduce power to 175-187W
- Stay hydrated
- Focus on form and breathing
- This should feel comfortable - Zone 2 is conversational pace"
}
```

#### Test 7.4: AI Chat
```bash
curl -X POST http://localhost:3000/api/ai/chat \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "message": "Should I do intervals today or rest?"
  }'
```

**Expected**: Personalized coaching response

**Sample Response**:
```json
{
  "response": "Based on your current training status, I'd recommend an easy day rather than intervals today. Here's why:

Your TSB is -6.9, which means you're carrying moderate fatigue. While this is productive training territory, your ATL (72.1) is noticeably higher than your CTL (65.2), indicating recent high training load.

Looking at your last 7 days:
- 5 rides totaling significant TSS
- 2 quality sessions already this week
- Limited recovery between efforts

Recommendation: Easy endurance ride or complete rest

If you're feeling fresh and motivated, a short easy ride (60 minutes, Zone 2, ~50 TSS) would be appropriate. But if you're feeling fatigued, a rest day would be more beneficial.

Save the intervals for 2-3 days from now when your TSB improves. Quality intervals require freshness to be effective, and doing them fatigued increases injury risk without much training benefit.

What does your body tell you? That's always the most important data point!",
  "conversationId": "uuid-here"
}
```

---

## Integration Testing Scenarios

### Scenario 1: New User Complete Flow

1. ✅ Register account
2. ✅ Login
3. ✅ Activate beta code
4. ✅ Update profile (add FTP and weight)
5. ✅ Connect Strava
6. ✅ Wait for initial sync
7. ✅ View activities
8. ✅ Check power PRs
9. ✅ Check FTP estimation
10. ✅ Check training status
11. ✅ Ask AI for training analysis

### Scenario 2: Post-Ride Flow (via Webhook)

1. ✅ User uploads ride to Strava
2. ✅ Webhook triggers instantly
3. ✅ Activity fetched and stored
4. ✅ Power curve calculated
5. ✅ TSS calculated
6. ✅ FTP re-estimated
7. ✅ Training status updated
8. ✅ Activity visible in app
9. ✅ AI can analyze the ride

### Scenario 3: Training Analysis Flow

1. ✅ User has multiple weeks of data
2. ✅ Request training status
3. ✅ Review CTL/ATL/TSB trends
4. ✅ Get AI analysis
5. ✅ Ask for workout suggestion
6. ✅ Chat with AI coach
7. ✅ Receive personalized recommendations

---

## Performance Benchmarks

### Expected Response Times

| Endpoint | Expected Time | Notes |
|----------|---------------|-------|
| Auth (register/login) | < 500ms | Database + JWT generation |
| Strava sync (10 activities) | 5-10s | API rate limited |
| Power curve analysis | 1-2s | Computation intensive |
| FTP estimation | < 500ms | Simple aggregation |
| Training status | < 1s | Includes TSS calculation |
| AI analysis | 2-5s | Claude API call |
| AI chat | 2-5s | Claude API call |
| Webhook processing | 3-5s | Background after 200 response |

### Database Query Optimization

- All foreign keys indexed
- RLS policies optimized
- Activity queries use date indexes
- Power curves use composite indexes

---

## Error Handling Tests

### Test Missing Auth
```bash
curl http://localhost:3000/api/power/prs
```
**Expected**: 401 Unauthorized

### Test Invalid Beta Code
```bash
curl -X POST http://localhost:3000/api/beta/activate \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"code": "INVALID"}'
```
**Expected**: 400 Invalid beta code

### Test No Strava Connection
```bash
curl http://localhost:3000/api/strava/sync \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```
**Expected**: 500 Strava not connected

### Test Activity Without Power
```bash
curl http://localhost:3000/api/power/activity/NO_POWER_ACTIVITY_ID \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```
**Expected**: 404 Power curve not found

---

## Security Tests

### Test RLS Policies
1. Create two users
2. User A uploads activities
3. User B tries to access User A's activities
**Expected**: No data returned (RLS blocks)

### Test Token Expiry
1. Get access token
2. Wait for expiry (or invalidate)
3. Try protected endpoint
**Expected**: 401 Unauthorized

### Test Subscription Gate
1. User without beta or subscription
2. Try protected endpoint
**Expected**: 403 Active subscription required

---

## Load Testing

### Concurrent Webhooks
Simulate 10 rides uploaded simultaneously:
- All should process successfully
- No data loss
- Correct order maintained

### Database Performance
- 1000+ activities: < 100ms query time
- Power curve calculation: < 2s per activity
- Bulk FTP estimation: < 1s

---

## Validation Checklist

### Data Integrity
- [ ] Activities have unique `strava_activity_id`
- [ ] Power curves linked to activities (foreign key)
- [ ] TSS values reasonable (0-500 range)
- [ ] FTP estimations > 100W, < 500W
- [ ] CTL/ATL/TSB within expected ranges

### Business Logic
- [ ] Beta codes work
- [ ] Subscription gates work
- [ ] FTP only updates with high confidence
- [ ] Training status matches TSB
- [ ] AI analysis includes all context

### API Consistency
- [ ] All endpoints return JSON
- [ ] Errors follow same format
- [ ] Timestamps in ISO format
- [ ] Power values in watts (integers)
- [ ] Durations in seconds

---

## Monitoring & Logging

### Key Logs to Watch
```
✅ Successfully processed new activity: 12345678
🔄 Initial Strava sync for user: 10 activities
📊 Analyzing power curve for activity: 12345678
⚡ Updated FTP for athlete: 240W -> 245W
💪 Training status: productive (TSB: -8.5)
🤖 AI analysis request completed: 3.2s
```

### Error Patterns
```
❌ Strava API rate limit exceeded
❌ Activity has no power data
❌ FTP estimation failed: insufficient data
❌ Webhook verification failed
```

---

## Success Criteria

All tests pass if:

1. ✅ User can register and activate beta
2. ✅ Strava connection works end-to-end
3. ✅ Webhooks process activities in real-time
4. ✅ Power curves calculated correctly (all 10 durations)
5. ✅ FTP estimated accurately from data
6. ✅ Training status reflects actual load
7. ✅ AI provides relevant, personalized coaching
8. ✅ No data leaks between users (RLS working)
9. ✅ Performance within acceptable ranges
10. ✅ Error handling graceful

---

## Next Steps After Testing

1. Deploy to production
2. Set up monitoring (error tracking, performance)
3. Configure production webhooks
4. Beta test with real cyclists
5. Gather feedback
6. Iterate

---

**Ready to start testing? Begin with Suite 1 and work through systematically!**
