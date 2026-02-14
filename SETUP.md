# Setup Guide - AI Cycling Coach

## Quick Start

This guide will help you set up the AI Cycling Coach application for development.

## Prerequisites

- Node.js 18+ installed
- A Supabase account (https://supabase.com)
- Optional for full functionality:
  - Stripe account (for payment processing)
  - Strava API credentials (for activity sync)
  - Anthropic API key (for AI features)

## Step 1: Clone and Install

```bash
cd /Users/bnelson/PersonalDev/cycling-coach

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

## Step 2: Set Up Supabase

1. **Create a new project** at https://supabase.com
2. **Get your credentials:**
   - Go to Settings > API
   - Copy the Project URL
   - Copy the `anon` public key
   - Copy the `service_role` key (keep this secret!)

3. **Set up the database:**
   - Go to SQL Editor in Supabase
   - Copy the contents of `backend/migrations/001_initial_schema.sql`
   - Paste and run the migration

## Step 3: Configure Environment Variables

### Backend (.env)

```bash
cd backend
cp .env.example .env
```

Edit `backend/.env` and add your credentials:

```bash
NODE_ENV=development
PORT=3000

# Supabase (REQUIRED)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here

# JWT (REQUIRED - generate a random string)
JWT_SECRET=your-secret-key-change-this-in-production

# Stripe (Optional for now, can add later)
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_ID=price_xxx

# Strava (Optional for now, can add later)
STRAVA_CLIENT_ID=xxx
STRAVA_CLIENT_SECRET=xxx
STRAVA_REDIRECT_URI=http://localhost:3000/api/strava/callback

# Anthropic (Optional for now, can add later)
ANTHROPIC_API_KEY=sk-ant-xxx

# Frontend URL
FRONTEND_URL=http://localhost:5173
```

### Frontend (.env)

```bash
cd frontend
cp .env.example .env
```

Edit `frontend/.env` and add your credentials:

```bash
# Backend API
VITE_API_URL=http://localhost:3000

# Supabase (REQUIRED)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key-here

# Stripe (Optional for now)
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_xxx

# Strava (Optional for now)
VITE_STRAVA_CLIENT_ID=xxx
```

## Step 4: Start Development Servers

Open two terminal windows:

### Terminal 1 - Backend:
```bash
cd backend
npm run dev
```

You should see:
```
🚴 AI Cycling Coach API running on port 3000
📍 Environment: development
🌐 Frontend URL: http://localhost:5173
```

### Terminal 2 - Frontend:
```bash
cd frontend
npm run dev
```

You should see:
```
VITE v7.x.x ready in xxx ms
➜  Local:   http://localhost:5173/
```

## Step 5: Test the Application

1. Open your browser to http://localhost:5173
2. You should see the AI Cycling Coach login page
3. Click "Sign up" to create an account
4. Fill in your email and password
5. After registration, you should be redirected to the dashboard

## Phase 1 Complete ✅

You have successfully set up:
- ✅ Project structure
- ✅ Backend API with Express + TypeScript
- ✅ Frontend with React + Vite + TypeScript
- ✅ Supabase database with RLS policies
- ✅ Authentication system (signup, login, JWT)
- ✅ Basic UI with Tailwind CSS
- ✅ Zustand state management
- ✅ API service layer

## What's Working

- User registration
- User login
- Protected routes
- JWT authentication
- Profile management
- Responsive UI

## What's Not Implemented Yet

The following features are planned for future phases:

- ⬜ Stripe subscription ($5/month payment)
- ⬜ Strava OAuth integration
- ⬜ Activity sync from Strava
- ⬜ Workout creation and management
- ⬜ Training calendar
- ⬜ AI chat coaching
- ⬜ Workout file generation (ZWO/FIT)
- ⬜ Fitness metrics (CTL, ATL, TSB)

## Troubleshooting

### Backend won't start
- Check that all required environment variables are set
- Verify your Supabase credentials are correct
- Make sure port 3000 is not already in use

### Frontend won't start
- Check that the backend is running first
- Verify your VITE environment variables are set
- Make sure port 5173 is not already in use

### Can't register/login
- Check the browser console for errors
- Verify the backend is running and accessible
- Check that the database migration ran successfully in Supabase
- Look at the backend terminal for error messages

### Database errors
- Verify the migration script ran successfully
- Check that RLS policies are enabled
- Ensure auth.users table exists in Supabase

## Next Steps

See the main README.md for the full implementation plan. Phase 2 will implement:
- Stripe subscription integration
- Checkout flow
- Webhook handling
- Subscription-required middleware

## Support

For issues, check:
1. Browser console for frontend errors
2. Backend terminal for API errors
3. Supabase logs for database errors

## Development Tips

- Use the browser DevTools to inspect network requests
- Check the Zustand devtools for state management
- Use Supabase Dashboard to view/edit database records
- Backend logs show all API requests and errors
