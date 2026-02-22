# 🚀 AI Cycling Coach - Production Deployment Guide

This guide will walk you through deploying the AI Cycling Coach application to production using Railway.app.

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Start](#quick-start)
3. [Railway Deployment](#railway-deployment)
4. [Environment Variables](#environment-variables)
5. [Custom Domain Setup](#custom-domain-setup)
6. [OAuth Configuration](#oauth-configuration)
7. [Post-Deployment](#post-deployment)
8. [Monitoring](#monitoring)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

Before deploying, ensure you have:

- ✅ GitHub account
- ✅ Railway.app account (sign up at https://railway.app with GitHub)
- ✅ Supabase project configured
- ✅ Anthropic API key
- ✅ Strava API application
- ✅ Stripe account (for payments)
- ✅ All code committed to your GitHub repository

### Generate JWT Secret

```bash
openssl rand -base64 32
```

Save this - you'll need it for environment variables.

---

## Quick Start

**Total Time: ~30 minutes**

1. **Push code to GitHub**
2. **Create Railway project from GitHub repo**
3. **Configure backend service**
4. **Configure frontend service**
5. **Update OAuth callbacks**
6. **Test the deployment**

---

## Railway Deployment

### Step 1: Create Railway Account

1. Go to https://railway.app
2. Click "Login with GitHub"
3. Authorize Railway to access your repositories

### Step 2: Create New Project

1. Click "New Project" in Railway dashboard
2. Select "Deploy from GitHub repo"
3. Choose your `cycling-coach` repository
4. Railway will detect your monorepo structure

### Step 3: Configure Backend Service

1. Railway should auto-detect the `backend` folder
2. Click on the backend service
3. Go to **Settings**:
   - **Service Name**: `cycling-coach-backend`
   - **Root Directory**: `backend`
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `npm start`
   - **Watch Paths**: `backend/**`

4. Go to **Variables** tab:
   - Click "RAW Editor"
   - Paste all backend environment variables (see below)
   - Click "Add"

5. Go to **Networking** tab:
   - **Enable Public Networking**
   - Copy the generated URL (e.g., `cycling-coach-backend.up.railway.app`)
   - This is your `BACKEND_URL`

6. Click **Deploy**

### Step 4: Configure Frontend Service

1. In Railway, click "New" → "GitHub Repo" (same repo)
2. Select your repository again
3. Railway will create a second service
4. Click on the new service

5. Go to **Settings**:
   - **Service Name**: `cycling-coach-frontend`
   - **Root Directory**: `frontend`
   - **Build Command**: `npm ci && npm run build`
   - **Start Command**: `npm start`
   - **Watch Paths**: `frontend/**`

6. Go to **Variables** tab:
   - Add all frontend environment variables
   - Set `VITE_API_URL` to your backend Railway URL

7. Go to **Networking** tab:
   - **Enable Public Networking**
   - Copy the generated URL (e.g., `cycling-coach-frontend.up.railway.app`)
   - This is your `FRONTEND_URL`

8. Click **Deploy**

### Step 5: Update Cross-References

1. Go back to **Backend Service** → **Variables**
2. Update `FRONTEND_URL` to your frontend Railway URL
3. Backend will automatically redeploy

---

## Environment Variables

### Backend Environment Variables

Copy these into Railway's backend service variables:

```bash
# Server Configuration
NODE_ENV=production
PORT=3000
FRONTEND_URL=https://your-frontend.railway.app

# JWT Authentication
JWT_SECRET=<output-from-openssl-command>

# Supabase
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Anthropic AI
ANTHROPIC_API_KEY=sk-ant-api03-xxxxx

# Strava OAuth
STRAVA_CLIENT_ID=12345
STRAVA_CLIENT_SECRET=abcdef1234567890
STRAVA_REDIRECT_URI=https://your-backend.railway.app/api/strava/callback
STRAVA_WEBHOOK_VERIFY_TOKEN=CYCLECOACH2026

# Stripe
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
STRIPE_PRICE_ID=price_xxxxx

# Beta Access (Optional)
BETA_ACCESS_CODE=CYCLECOACH2026

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100

# Security
HELMET_CSP_ENABLED=true
```

### Frontend Environment Variables

Copy these into Railway's frontend service variables:

```bash
# Backend API
VITE_API_URL=https://your-backend.railway.app

# Supabase
VITE_SUPABASE_URL=https://xxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# Stripe
VITE_STRIPE_PUBLISHABLE_KEY=pk_live_xxxxx

# Strava
VITE_STRAVA_CLIENT_ID=12345

# App Config
VITE_APP_NAME=AI Cycling Coach
VITE_APP_VERSION=1.0.0

# Feature Flags
VITE_ENABLE_ANALYTICS=true
VITE_ENABLE_INTERVALS_ICU=true
VITE_ENABLE_GARMIN=false
```

---

## Custom Domain Setup

### Option 1: Buy Domain (Recommended)

**Recommended Registrars:**
- **Namecheap**: https://www.namecheap.com (~$15/year for .app)
- **Cloudflare**: https://www.cloudflare.com (~$10/year at cost)

### Option 2: Configure DNS in Railway

1. **Buy your domain** (e.g., `cyclingcoach.app`)

2. **Add Frontend Domain**:
   - Railway → Frontend Service → Settings → Networking
   - Click "Custom Domain"
   - Add: `cyclingcoach.app`
   - Railway shows DNS records to add

3. **Add DNS Records** (in your registrar):
   ```
   Type: CNAME
   Name: @
   Value: your-frontend.railway.app
   TTL: 3600
   ```

4. **Add Backend Subdomain**:
   - Railway → Backend Service → Settings → Networking
   - Add: `api.cyclingcoach.app`

5. **Add DNS Record**:
   ```
   Type: CNAME
   Name: api
   Value: your-backend.railway.app
   TTL: 3600
   ```

6. **Wait for DNS Propagation** (5-60 minutes)

7. **Update Environment Variables**:
   - Backend `FRONTEND_URL` → `https://cyclingcoach.app`
   - Frontend `VITE_API_URL` → `https://api.cyclingcoach.app`
   - Update OAuth callbacks (see next section)

---

## OAuth Configuration

### Strava OAuth Setup

1. Go to https://www.strava.com/settings/api
2. Click "My API Application"
3. Update **Authorization Callback Domain**:
   - For Railway domain: `https://your-backend.railway.app/api/strava/callback`
   - For custom domain: `https://api.cyclingcoach.app/api/strava/callback`
4. Save changes
5. Update Railway backend env var `STRAVA_REDIRECT_URI` to match

### Stripe Webhook Setup

1. Go to https://dashboard.stripe.com/webhooks
2. Click "Add endpoint"
3. **Endpoint URL**:
   - Railway: `https://your-backend.railway.app/api/stripe/webhook`
   - Custom: `https://api.cyclingcoach.app/api/stripe/webhook`
4. **Select events**:
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy **Signing Secret**
6. Update Railway backend env var `STRIPE_WEBHOOK_SECRET`

### Intervals.icu OAuth (Optional)

1. Contact Intervals.icu for API access
2. Update redirect URI to your backend URL
3. Update Railway backend env vars:
   - `INTERVALS_ICU_CLIENT_ID`
   - `INTERVALS_ICU_CLIENT_SECRET`
   - `INTERVALS_ICU_REDIRECT_URI`

---

## Post-Deployment

### 1. Verify Deployment

Check both services are running in Railway dashboard:
- ✅ Backend: Green checkmark
- ✅ Frontend: Green checkmark

### 2. Test the Application

1. **Visit your frontend URL**
2. **Test user registration**
3. **Test Strava OAuth connection**
4. **Test AI chat functionality**
5. **Test workout creation**

### 3. Check Logs

Railway → Service → Deployments → View Logs

Look for:
```
🚴 AI Cycling Coach API running on port 3000
📍 Environment: production
🌐 Frontend URL: https://...
✅ Strava auto-sync cron job started
```

### 4. Test Webhooks

**Strava Webhook**:
```bash
curl -X POST https://your-backend.railway.app/api/strava/webhook \
  -H "Content-Type: application/json" \
  -d '{"aspect_type":"create","object_type":"activity"}'
```

**Stripe Webhook**:
Use Stripe CLI or trigger test events in Stripe dashboard.

---

## Monitoring

### Railway Built-in Monitoring

1. **Metrics**: Railway dashboard shows CPU, Memory, Network
2. **Logs**: Real-time logs in deployment view
3. **Health**: Automatic restart on failure

### Optional: Add Sentry (Error Tracking)

1. Sign up at https://sentry.io
2. Create project
3. Add to Railway env vars:
   ```bash
   SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
   SENTRY_ENVIRONMENT=production
   ```
4. Install in backend:
   ```bash
   npm install @sentry/node
   ```

### Optional: Add UptimeRobot

1. Sign up at https://uptimerobot.com
2. Add monitors for:
   - Frontend URL (HTTP monitor)
   - Backend health endpoint: `https://api.../health`
3. Configure alerts (email, SMS, Slack)

---

## Troubleshooting

### Build Fails

**Error**: `npm ci` fails
- **Solution**: Check `package-lock.json` exists in repo
- **Solution**: Run `npm install` locally and commit lock file

**Error**: TypeScript compilation fails
- **Solution**: Run `npm run build` locally to debug
- **Solution**: Check `tsconfig.json` paths

### Runtime Errors

**Error**: "Cannot connect to database"
- **Solution**: Verify Supabase env vars are correct
- **Solution**: Check Supabase project is active

**Error**: CORS errors
- **Solution**: Verify `FRONTEND_URL` in backend matches exactly
- **Solution**: Ensure no trailing slash in URLs

**Error**: OAuth fails
- **Solution**: Verify redirect URIs match exactly in Strava/Stripe
- **Solution**: Check URLs use HTTPS (not HTTP)

### Performance Issues

**Slow response times**:
- **Solution**: Check Railway metrics for CPU/memory usage
- **Solution**: Upgrade Railway plan if needed
- **Solution**: Add Redis caching for frequent queries

**Frequent crashes**:
- **Solution**: Check Railway logs for error patterns
- **Solution**: Add more memory in Railway settings
- **Solution**: Fix infinite loops or memory leaks in code

---

## Scaling Strategy

### Current Setup (Good for 0-100 users)
- Railway Hobby: $5/month credit
- Should handle light traffic

### Growing (100-1,000 users)
- Upgrade to Railway Pro: $20/month minimum
- Consider Supabase Pro: $25/month
- Add Redis for caching

### Scaling (1,000+ users)
- Separate worker service for background jobs
- Add CDN for frontend assets
- Consider load balancing
- Monitor Anthropic API costs

---

## Monthly Cost Estimate

**Starter (0-100 users)**:
- Railway: $20-30/month
- Supabase: Free tier
- Domain: $1-2/month
- **Total**: ~$25/month

**Growth (100-1,000 users)**:
- Railway: $40-60/month
- Supabase: $25/month
- Anthropic: $20-50/month
- Stripe fees: 2.9% + $0.30 per charge
- **Total**: ~$100-150/month

**Scale (1,000+ users)**:
- Railway: $100-200/month
- Supabase: $25-100/month
- Anthropic: $100-500/month
- Additional services: $50/month
- **Total**: ~$300-800/month

---

## Support

- **Railway Docs**: https://docs.railway.app
- **Railway Discord**: https://discord.gg/railway
- **GitHub Issues**: Create issue in your repo
- **Email**: support@railway.app

---

## Next Steps

After successful deployment:

1. ✅ Set up monitoring (Sentry, UptimeRobot)
2. ✅ Configure custom domain
3. ✅ Add analytics (PostHog, Plausible)
4. ✅ Set up backup strategy
5. ✅ Write user documentation
6. ✅ Launch beta program
7. ✅ Plan mobile app development

---

**🎉 Congratulations! Your AI Cycling Coach is now live in production!**
