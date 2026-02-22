#!/bin/bash

# Setup script for Intervals.icu integration
# Run this after receiving OAuth credentials from Intervals.icu

set -e

echo "🔧 Intervals.icu Integration Setup"
echo "===================================="
echo ""

# Step 1: Check if .env exists
if [ ! -f .env ]; then
    echo "❌ Error: .env file not found"
    echo "Creating .env from .env.example..."
    cp .env.example .env
    echo "✅ Created .env file"
    echo ""
fi

# Step 2: Check for Intervals.icu credentials
echo "📝 Step 1: Check Credentials"
echo "----------------------------"

if grep -q "INTERVALS_ICU_CLIENT_ID=your_intervals_icu_client_id" .env; then
    echo "⚠️  Warning: Intervals.icu credentials not set in .env"
    echo ""
    echo "Please update your .env file with your Intervals.icu OAuth credentials:"
    echo ""
    echo "  INTERVALS_ICU_CLIENT_ID=your_actual_client_id"
    echo "  INTERVALS_ICU_CLIENT_SECRET=your_actual_client_secret"
    echo "  INTERVALS_ICU_REDIRECT_URI=http://localhost:3000/api/integrations/intervals-icu/callback"
    echo ""
    read -p "Press Enter once you've updated .env, or Ctrl+C to exit..."
fi

# Verify credentials are set
source .env
if [ -z "$INTERVALS_ICU_CLIENT_ID" ] || [ "$INTERVALS_ICU_CLIENT_ID" = "your_intervals_icu_client_id" ]; then
    echo "❌ Error: INTERVALS_ICU_CLIENT_ID is not set properly"
    exit 1
fi

if [ -z "$INTERVALS_ICU_CLIENT_SECRET" ] || [ "$INTERVALS_ICU_CLIENT_SECRET" = "your_intervals_icu_client_secret" ]; then
    echo "❌ Error: INTERVALS_ICU_CLIENT_SECRET is not set properly"
    exit 1
fi

echo "✅ Intervals.icu credentials found"
echo ""

# Step 3: Run database migration
echo "🗄️  Step 2: Run Database Migration"
echo "-----------------------------------"

if [ -z "$DATABASE_URL" ]; then
    echo "❌ Error: DATABASE_URL is not set in .env"
    exit 1
fi

echo "Running migration: 005_add_integrations.sql"
psql "$DATABASE_URL" -f migrations/005_add_integrations.sql

if [ $? -eq 0 ]; then
    echo "✅ Database migration completed successfully"
else
    echo "❌ Error: Migration failed"
    exit 1
fi

echo ""

# Step 4: Build backend
echo "🔨 Step 3: Build Backend"
echo "------------------------"
npm run build

if [ $? -eq 0 ]; then
    echo "✅ Backend built successfully"
else
    echo "❌ Error: Build failed"
    exit 1
fi

echo ""
echo "🎉 Setup Complete!"
echo "=================="
echo ""
echo "Next steps:"
echo "1. Start the backend: npm start"
echo "2. Test OAuth flow: http://localhost:3000/api/integrations/intervals-icu/auth-url"
echo "3. Build frontend UI for settings page"
echo ""
echo "Intervals.icu integration is ready! 🚀"
