# Intervals.icu OAuth API Access Request

## Email Template

**To:** support@intervals.icu
**Subject:** OAuth API Access Request for Cycling Coach Application

---

Hi Intervals.icu Team,

I'm developing an AI-powered cycling coach application and would like to request OAuth API access to integrate with Intervals.icu.

**Application Details:**

- **Application Name:** [Your App Name]
- **Description:** An AI-powered cycling coach that creates personalized training plans and structured workouts. We want to enable seamless workout sync from our platform to Intervals.icu, which then syncs to Zwift for our users.

**Technical Details:**

- **Redirect URI (Development):** `http://localhost:3000/api/integrations/intervals-icu/callback`
- **Redirect URI (Production):** `https://[your-domain]/api/integrations/intervals-icu/callback`

**Required Scopes:**
- `CALENDAR:WRITE` - To upload planned workouts to athlete calendars
- `ACTIVITY:READ` - To read completed activities for analysis (optional but helpful)

**Use Case:**

Our application generates structured cycling workouts with specific intervals, power targets, and durations. Users would like these workouts to automatically sync to their Intervals.icu calendar, which then syncs to Zwift through Intervals.icu's existing Zwift integration.

**User Flow:**
1. User connects their Intervals.icu account via OAuth
2. When a workout is scheduled in our app, it's automatically uploaded to Intervals.icu
3. Intervals.icu syncs to Zwift (via existing integration)
4. User sees workout in Zwift Custom Workouts

**File Format:**
We'll upload workouts as base64-encoded .zwo (Zwift Workout) files via the `/athlete/{id}/events/bulk` endpoint.

**Expected Launch:**
Beta testing in 2-3 weeks

Please let me know if you need any additional information or documentation.

Thank you for your time!

Best regards,
[Your Name]
[Your Email]
[Your Website/App URL if available]

---

## Alternative: Forum Post

If email doesn't get a quick response, you can also post on the Intervals.icu forum:

**Forum:** https://forum.intervals.icu/c/guide/8

**Post Title:** "OAuth API Access Request for Training App Integration"

**Post Body:** [Same content as email above]

---

## What to Expect

**Response Time:** Usually 1-3 business days

**You'll Receive:**
- OAuth Client ID
- OAuth Client Secret
- Confirmation of approved scopes
- Any additional documentation or requirements

**Common Questions They May Ask:**
1. How many users do you expect?
2. Will this be a paid or free app?
3. Do you need any additional scopes?
4. What's your privacy policy for user data?

**Be Ready to Answer:**
- User data is only used for workout sync
- OAuth tokens are stored securely (encrypted)
- Users can disconnect at any time
- We don't share user data with third parties

---

## Tips for Faster Approval

1. **Be specific about your use case** - They want to know you'll use the API properly
2. **Mention Zwift integration** - They love supporting Zwift users
3. **Show you've done your homework** - Reference their API docs/forum posts
4. **Provide timeline** - Helps them prioritize
5. **Be professional** - This is a business request

---

## While You Wait

You can continue development using:
1. Mock OAuth responses
2. Manual .zwo file downloads (already working)
3. Frontend UI development
4. Other integrations (Garmin, notifications)

The backend code is ready - you just need to plug in the credentials once approved!
