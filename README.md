# AI Cycling Coach

An AI-powered cycling coach application with Strava integration, personalized training plans, and AI chat coaching powered by Claude.

## Features

- 🔐 User authentication with Supabase
- 💳 Stripe subscription ($5/month)
- 🚴 Strava integration for activity tracking
- 🤖 AI coach powered by Claude 3.5 Sonnet
- 📅 Training calendar with drag-and-drop
- 🏋️ Workout builder with ZWO/FIT file export
- 📊 Fitness metrics (CTL, ATL, TSB)
- 💬 AI chat interface with tool calling

## Tech Stack

### Backend
- Node.js + Express + TypeScript
- Supabase (PostgreSQL + Auth)
- Stripe for payments
- Anthropic Claude API
- Strava API

### Frontend
- React + Vite + TypeScript
- Tailwind CSS + Radix UI
- Zustand for state management
- Supabase client

## Project Structure

```
cycling-coach/
├── backend/          # Express API server
│   ├── src/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── middleware/
│   │   ├── routes/
│   │   ├── utils/
│   │   ├── config/
│   │   └── server.ts
│   └── migrations/   # Database migrations
│
├── frontend/         # React web app
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── stores/
│       ├── services/
│       └── config/
│
└── shared/          # Shared TypeScript types
    └── types/
```

## Setup Instructions

### Prerequisites

- Node.js 18+
- Supabase account
- Stripe account (for payments)
- Strava API credentials (for integration)
- Anthropic API key (for AI features)

### 1. Database Setup

1. Create a new Supabase project at https://supabase.com
2. Run the migration script in the Supabase SQL editor:
   ```bash
   # Copy contents of backend/migrations/001_initial_schema.sql
   # Paste into Supabase SQL Editor and run
   ```

### 2. Backend Setup

```bash
cd backend

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env with your credentials

# Start development server
npm run dev
```

The API will be available at `http://localhost:3000`

### 3. Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Configure environment variables
cp .env.example .env
# Edit .env with your credentials

# Start development server
npm run dev
```

The app will be available at `http://localhost:5173`

## Environment Variables

### Backend (.env)

```bash
NODE_ENV=development
PORT=3000
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx
STRIPE_SECRET_KEY=sk_test_xxx
STRIPE_WEBHOOK_SECRET=whsec_xxx
STRIPE_PRICE_ID=price_xxx
STRAVA_CLIENT_ID=xxx
STRAVA_CLIENT_SECRET=xxx
STRAVA_REDIRECT_URI=http://localhost:3000/api/strava/callback
ANTHROPIC_API_KEY=sk-ant-xxx
JWT_SECRET=your-secret-key
FRONTEND_URL=http://localhost:5173
```

### Frontend (.env)

```bash
VITE_API_URL=http://localhost:3000
VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=xxx
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_xxx
VITE_STRAVA_CLIENT_ID=xxx
```

## Development Status

### ✅ Phase 1: Foundation (Completed)
- [x] Project structure
- [x] Backend setup (Express + TypeScript)
- [x] Frontend setup (Vite + React + TypeScript)
- [x] Supabase configuration
- [x] Authentication system (signup, login, JWT)
- [x] Basic UI with Tailwind + Radix UI
- [x] Zustand state management
- [x] API service layer

### ⬜ Phase 2: Stripe Subscription (Next)
- [ ] Stripe integration
- [ ] Checkout flow
- [ ] Webhook handling
- [ ] Subscription middleware

### ⬜ Phase 3: Strava Integration
- [ ] OAuth flow
- [ ] Activity sync
- [ ] Token management

### ⬜ Phase 4: Workout Management
- [ ] Workout CRUD
- [ ] Workout builder UI
- [ ] ZWO/FIT file generation

### ⬜ Phase 5: Calendar System
- [ ] Calendar UI
- [ ] Drag-and-drop
- [ ] Workout scheduling

### ⬜ Phase 6: AI Chat
- [ ] Claude API integration
- [ ] Streaming responses
- [ ] Chat UI

### ⬜ Phase 7: AI Tool Calling
- [ ] Tool definitions
- [ ] Workout generation
- [ ] Calendar manipulation

### ⬜ Phase 8: Polish
- [ ] Fitness metrics
- [ ] Dashboard
- [ ] Mobile responsiveness

## API Endpoints

### Authentication
- `POST /api/auth/register` - Create account
- `POST /api/auth/login` - Sign in
- `POST /api/auth/logout` - Sign out
- `GET /api/auth/me` - Get profile
- `PUT /api/auth/me` - Update profile

### Coming Soon
- Subscription endpoints
- Strava endpoints
- Workout endpoints
- Calendar endpoints
- Chat endpoints

## Testing

To test the authentication flow:

1. Start both backend and frontend servers
2. Navigate to `http://localhost:5173`
3. Click "Sign up" and create an account
4. You should be redirected to the dashboard
5. Verify you can log out and log back in

## Database Schema

See `backend/migrations/001_initial_schema.sql` for the complete database schema including:
- Athletes (user profiles)
- Workouts
- Calendar entries
- Chat conversations & messages
- Strava activities
- Athlete metrics (fitness tracking)

## License

MIT

## Contributing

This is a personal project. Contributions are welcome!

## Support

For issues or questions, please create an issue in the repository.
