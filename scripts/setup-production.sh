#!/bin/bash

# AI Cycling Coach - Production Setup Script
# This script helps you prepare for production deployment

set -e

echo "🚴 AI Cycling Coach - Production Setup Helper"
echo "=============================================="
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_success() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if required tools are installed
echo "Checking prerequisites..."
echo ""

# Check for git
if command -v git &> /dev/null; then
    print_success "Git is installed"
else
    print_error "Git is not installed. Please install Git first."
    exit 1
fi

# Check for node
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    print_success "Node.js is installed ($NODE_VERSION)"
else
    print_error "Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

# Check for npm
if command -v npm &> /dev/null; then
    NPM_VERSION=$(npm --version)
    print_success "npm is installed ($NPM_VERSION)"
else
    print_error "npm is not installed. Please install npm first."
    exit 1
fi

echo ""
echo "=============================================="
echo "🔑 Generating Secrets"
echo "=============================================="
echo ""

# Generate JWT Secret
echo "Generating JWT secret..."
JWT_SECRET=$(openssl rand -base64 32)
print_success "JWT Secret generated"
echo ""
echo "Add this to your Railway backend environment variables:"
echo "JWT_SECRET=$JWT_SECRET"
echo ""

# Generate Strava webhook token
STRAVA_TOKEN=$(echo "CYCLECOACH$(date +%Y)" | tr -d ' ')
print_success "Strava webhook token: $STRAVA_TOKEN"
echo ""

echo "=============================================="
echo "📋 Environment Variables Checklist"
echo "=============================================="
echo ""

echo "Backend Environment Variables:"
echo "------------------------------"
echo "[ ] NODE_ENV=production"
echo "[ ] PORT=3000"
echo "[ ] FRONTEND_URL=https://your-frontend.railway.app"
echo "[ ] JWT_SECRET=$JWT_SECRET"
echo "[ ] SUPABASE_URL"
echo "[ ] SUPABASE_ANON_KEY"
echo "[ ] SUPABASE_SERVICE_ROLE_KEY"
echo "[ ] ANTHROPIC_API_KEY"
echo "[ ] STRAVA_CLIENT_ID"
echo "[ ] STRAVA_CLIENT_SECRET"
echo "[ ] STRAVA_REDIRECT_URI"
echo "[ ] STRAVA_WEBHOOK_VERIFY_TOKEN=$STRAVA_TOKEN"
echo "[ ] STRIPE_SECRET_KEY"
echo "[ ] STRIPE_WEBHOOK_SECRET"
echo "[ ] STRIPE_PRICE_ID"
echo ""

echo "Frontend Environment Variables:"
echo "--------------------------------"
echo "[ ] VITE_API_URL=https://your-backend.railway.app"
echo "[ ] VITE_SUPABASE_URL"
echo "[ ] VITE_SUPABASE_ANON_KEY"
echo "[ ] VITE_STRIPE_PUBLISHABLE_KEY"
echo "[ ] VITE_STRAVA_CLIENT_ID"
echo ""

echo "=============================================="
echo "🔍 Validating Project Structure"
echo "=============================================="
echo ""

# Check for required files
FILES_TO_CHECK=(
    "backend/package.json"
    "backend/railway.json"
    "backend/.env.example"
    "backend/src/server.ts"
    "frontend/package.json"
    "frontend/railway.json"
    "frontend/.env.example"
    ".github/workflows/deploy.yml"
    "DEPLOYMENT.md"
)

for file in "${FILES_TO_CHECK[@]}"; do
    if [ -f "$file" ]; then
        print_success "Found: $file"
    else
        print_error "Missing: $file"
    fi
done

echo ""

# Check git status
echo "=============================================="
echo "📦 Git Status"
echo "=============================================="
echo ""

if [ -d .git ]; then
    print_success "Git repository initialized"

    # Check for uncommitted changes
    if [[ -n $(git status -s) ]]; then
        print_warning "You have uncommitted changes:"
        git status -s
        echo ""
        echo "Commit these changes before deploying to Railway."
    else
        print_success "All changes committed"
    fi

    # Check for remote
    if git remote -v | grep -q origin; then
        REMOTE_URL=$(git remote get-url origin)
        print_success "Git remote configured: $REMOTE_URL"
    else
        print_warning "No git remote configured. Add one with:"
        echo "  git remote add origin <your-github-repo-url>"
    fi
else
    print_error "Not a git repository. Initialize with: git init"
fi

echo ""

# Check for node_modules
echo "=============================================="
echo "📚 Dependencies"
echo "=============================================="
echo ""

if [ -d "backend/node_modules" ]; then
    print_success "Backend dependencies installed"
else
    print_warning "Backend dependencies not installed. Run: cd backend && npm install"
fi

if [ -d "frontend/node_modules" ]; then
    print_success "Frontend dependencies installed"
else
    print_warning "Frontend dependencies not installed. Run: cd frontend && npm install"
fi

echo ""

# Test builds
echo "=============================================="
echo "🔨 Testing Builds"
echo "=============================================="
echo ""

echo "Testing backend build..."
cd backend
if npm run build > /dev/null 2>&1; then
    print_success "Backend builds successfully"
else
    print_error "Backend build failed. Run 'cd backend && npm run build' to debug."
fi
cd ..

echo "Testing frontend build..."
cd frontend
if npm run build > /dev/null 2>&1; then
    print_success "Frontend builds successfully"
else
    print_error "Frontend build failed. Run 'cd frontend && npm run build' to debug."
fi
cd ..

echo ""

# Summary
echo "=============================================="
echo "📊 Summary"
echo "=============================================="
echo ""

echo "Your project structure is ready for deployment!"
echo ""
echo "Next steps:"
echo "1. Copy the generated JWT_SECRET to your Railway backend env vars"
echo "2. Gather all required API keys and secrets"
echo "3. Create a Railway account at https://railway.app"
echo "4. Follow the instructions in DEPLOYMENT.md"
echo ""
echo "Deployment guide: ./DEPLOYMENT.md"
echo "Mobile guide: ./MOBILE_DEPLOYMENT.md"
echo "Readiness check: ./PRODUCTION_READY.md"
echo ""
print_success "Setup script complete!"
echo ""
