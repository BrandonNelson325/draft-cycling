# 📱 AI Cycling Coach - Mobile App Deployment Guide

This guide covers deploying the React Native mobile applications (iOS and Android) using Expo Application Services (EAS).

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [Initial Setup](#initial-setup)
3. [EAS Configuration](#eas-configuration)
4. [App Store Setup](#app-store-setup)
5. [CI/CD Pipeline](#cicd-pipeline)
6. [Push Notifications](#push-notifications)
7. [Over-The-Air Updates](#over-the-air-updates)
8. [Testing Strategy](#testing-strategy)

---

## Prerequisites

### Required Accounts

- ✅ **Apple Developer Program**: $99/year (for iOS)
  - Sign up: https://developer.apple.com/programs/
- ✅ **Google Play Console**: $25 one-time (for Android)
  - Sign up: https://play.google.com/console/signup
- ✅ **Expo Account**: Free tier available
  - Sign up: https://expo.dev/signup

### Required Tools

```bash
# Install Expo CLI
npm install -g expo-cli

# Install EAS CLI
npm install -g eas-cli

# Login to Expo
eas login
```

---

## Initial Setup

### Step 1: Create Mobile App Directory

```bash
cd /Users/bnelson/PersonalDev/cycling-coach

# Create mobile app with Expo
npx create-expo-app mobile --template
# Choose: "blank (TypeScript)"

cd mobile
```

### Step 2: Install Dependencies

```bash
# Core dependencies
npm install @react-navigation/native
npm install @react-navigation/native-stack
npm install expo-router

# Backend communication
npm install @supabase/supabase-js
npm install axios zustand

# UI Components
npm install react-native-safe-area-context
npm install react-native-screens

# Environment variables
npm install react-native-dotenv
```

### Step 3: Initialize EAS

```bash
eas init
# This creates an Expo project ID and links it to your account
```

---

## EAS Configuration

### Create `eas.json`

Create `mobile/eas.json`:

```json
{
  "cli": {
    "version": ">= 5.0.0"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "ios": {
        "simulator": true
      }
    },
    "preview": {
      "distribution": "internal",
      "ios": {
        "simulator": false,
        "resourceClass": "m-medium"
      },
      "android": {
        "buildType": "apk",
        "gradleCommand": ":app:assembleRelease"
      }
    },
    "production": {
      "autoIncrement": true,
      "ios": {
        "resourceClass": "m-medium",
        "bundler": "metro"
      },
      "android": {
        "buildType": "aab",
        "gradleCommand": ":app:bundleRelease"
      }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "your-email@example.com",
        "ascAppId": "1234567890",
        "appleTeamId": "ABCD123456"
      },
      "android": {
        "serviceAccountKeyPath": "./google-play-service-account.json",
        "track": "production"
      }
    }
  }
}
```

### Update `app.json`

```json
{
  "expo": {
    "name": "Cycling Coach AI",
    "slug": "cycling-coach-ai",
    "version": "1.0.0",
    "orientation": "portrait",
    "icon": "./assets/icon.png",
    "userInterfaceStyle": "automatic",
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    },
    "updates": {
      "enabled": true,
      "fallbackToCacheTimeout": 0,
      "url": "https://u.expo.dev/your-project-id"
    },
    "assetBundlePatterns": ["**/*"],
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.yourcompany.cyclingcoach",
      "buildNumber": "1",
      "infoPlist": {
        "NSLocationWhenInUseUsageDescription": "We need your location to track outdoor rides",
        "NSLocationAlwaysAndWhenInUseUsageDescription": "We need background location access to track rides even when the app is closed",
        "NSBluetoothAlwaysUsageDescription": "We use Bluetooth to connect to your power meter and heart rate monitor"
      }
    },
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      },
      "package": "com.yourcompany.cyclingcoach",
      "versionCode": 1,
      "permissions": [
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        "BLUETOOTH",
        "BLUETOOTH_ADMIN",
        "BLUETOOTH_CONNECT"
      ]
    },
    "web": {
      "favicon": "./assets/favicon.png"
    },
    "extra": {
      "eas": {
        "projectId": "your-expo-project-id"
      }
    },
    "owner": "your-expo-username"
  }
}
```

### Environment Variables

Create `mobile/.env.production`:

```bash
API_URL=https://api.cyclingcoach.app
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
STRIPE_PUBLISHABLE_KEY=pk_live_xxxxx
SENTRY_DSN=https://xxxxx@sentry.io/xxxxx
```

---

## App Store Setup

### Apple App Store Connect

1. **Create App ID**:
   - Go to https://developer.apple.com/account/resources/identifiers/list
   - Click "+" to create new App ID
   - Description: "Cycling Coach AI"
   - Bundle ID: `com.yourcompany.cyclingcoach`
   - Enable capabilities: Push Notifications, Background Modes

2. **Create App in App Store Connect**:
   - Go to https://appstoreconnect.apple.com
   - Click "+" → "New App"
   - Platform: iOS
   - Name: "Cycling Coach AI"
   - Bundle ID: Select the one you created
   - SKU: `cycling-coach-ai-ios`
   - User Access: Full Access

3. **Prepare App Metadata**:
   - App Privacy: Declare data collection
   - Screenshots: 6.5" iPhone (required), 12.9" iPad (optional)
   - App Description: Write compelling description
   - Keywords: cycling, training, coach, AI, strava, workouts
   - Category: Health & Fitness
   - Age Rating: 4+

### Google Play Console

1. **Create App**:
   - Go to https://play.google.com/console
   - Click "Create app"
   - App name: "Cycling Coach AI"
   - Default language: English (US)
   - App type: App
   - Free/Paid: Free

2. **Set Up App Signing**:
   - Google Play will manage your app signing key
   - Download service account JSON for CI/CD

3. **Prepare Store Listing**:
   - Short description: 80 characters
   - Full description: 4000 characters
   - App icon: 512x512 PNG
   - Feature graphic: 1024x500 PNG
   - Screenshots: At least 2 for phone
   - Category: Health & Fitness
   - Content rating: Complete questionnaire

4. **Download Service Account JSON**:
   - Go to Settings → API access
   - Create service account
   - Download JSON key
   - Save as `google-play-service-account.json` (DO NOT commit to git!)

---

## CI/CD Pipeline

### GitHub Actions Workflow

Create `.github/workflows/mobile-deploy.yml`:

```yaml
name: Mobile App Deployment

on:
  push:
    branches: [main]
    paths:
      - 'mobile/**'
  workflow_dispatch:
    inputs:
      platform:
        description: 'Platform to build'
        required: true
        type: choice
        options:
          - ios
          - android
          - all
      build_type:
        description: 'Build type'
        required: true
        type: choice
        options:
          - production
          - preview

jobs:
  build-ios:
    name: Build iOS
    runs-on: ubuntu-latest
    if: |
      github.event.inputs.platform == 'ios' ||
      github.event.inputs.platform == 'all' ||
      github.event_name == 'push'

    steps:
      - name: 🏗 Setup repo
        uses: actions/checkout@v4

      - name: 🏗 Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: mobile/package-lock.json

      - name: 🏗 Setup Expo
        uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}

      - name: 📦 Install dependencies
        working-directory: mobile
        run: npm ci

      - name: 🚀 Build iOS
        working-directory: mobile
        run: |
          BUILD_PROFILE="${{ github.event.inputs.build_type || 'production' }}"
          eas build --platform ios --profile $BUILD_PROFILE --non-interactive --no-wait

  build-android:
    name: Build Android
    runs-on: ubuntu-latest
    if: |
      github.event.inputs.platform == 'android' ||
      github.event.inputs.platform == 'all' ||
      github.event_name == 'push'

    steps:
      - name: 🏗 Setup repo
        uses: actions/checkout@v4

      - name: 🏗 Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: mobile/package-lock.json

      - name: 🏗 Setup Expo
        uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}

      - name: 📦 Install dependencies
        working-directory: mobile
        run: npm ci

      - name: 🚀 Build Android
        working-directory: mobile
        run: |
          BUILD_PROFILE="${{ github.event.inputs.build_type || 'production' }}"
          eas build --platform android --profile $BUILD_PROFILE --non-interactive --no-wait

  publish-ota:
    name: Publish OTA Update
    runs-on: ubuntu-latest
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'

    steps:
      - name: 🏗 Setup repo
        uses: actions/checkout@v4

      - name: 🏗 Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '18'
          cache: 'npm'
          cache-dependency-path: mobile/package-lock.json

      - name: 🏗 Setup Expo
        uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EXPO_TOKEN }}

      - name: 📦 Install dependencies
        working-directory: mobile
        run: npm ci

      - name: 🚀 Publish OTA update
        working-directory: mobile
        run: eas update --auto --non-interactive
```

### GitHub Secrets

Add these secrets to your GitHub repository (Settings → Secrets):

```bash
EXPO_TOKEN=<get from: npx eas-cli whoami>
APPLE_ID=<your apple id email>
APPLE_APP_SPECIFIC_PASSWORD=<generate at appleid.apple.com>
```

---

## Push Notifications

### Setup Expo Push Notifications

```bash
cd mobile
npm install expo-notifications
```

### Backend Push Service

Add to `backend/src/services/pushNotificationService.ts`:

```typescript
import { Expo } from 'expo-server-sdk';

const expo = new Expo();

export const pushNotificationService = {
  async sendWorkoutReminder(userId: string, workoutName: string) {
    const { data: tokens } = await supabaseAdmin
      .from('push_tokens')
      .select('token')
      .eq('athlete_id', userId);

    const messages = tokens.map(({ token }) => ({
      to: token,
      sound: 'default',
      title: 'Workout Reminder ⏰',
      body: `Time for: ${workoutName}`,
      data: { type: 'workout_reminder', workoutName },
    }));

    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk);
    }
  },
};
```

---

## Over-The-Air Updates

### Configure Updates

OTA updates allow you to push JavaScript changes without app store review.

```bash
# Publish update to production
eas update --branch production --message "Fix workout display bug"

# Publish to specific channel
eas update --channel preview --message "Test new feature"
```

### Update Strategy

**Use OTA for**:
- ✅ JavaScript code changes
- ✅ UI tweaks
- ✅ Bug fixes
- ✅ Content updates

**Requires App Store submission for**:
- ❌ Native code changes
- ❌ New permissions
- ❌ SDK updates
- ❌ Major features

---

## Testing Strategy

### TestFlight (iOS)

```bash
# Build for TestFlight
eas build --platform ios --profile production

# Submit to App Store Connect
eas submit --platform ios --latest
```

1. Invite testers in App Store Connect
2. Up to 10,000 external testers
3. Builds expire after 90 days

### Google Play Internal Testing

```bash
# Build for Play Store
eas build --platform android --profile production

# Submit to Play Console
eas submit --platform android --latest
```

1. Create internal testing track
2. Add testers via email
3. Instant distribution

---

## Build Commands

### Development Builds

```bash
# iOS simulator build
eas build --platform ios --profile development

# Android emulator build
eas build --platform android --profile development
```

### Preview Builds

```bash
# iOS preview (TestFlight)
eas build --platform ios --profile preview

# Android preview (APK)
eas build --platform android --profile preview
```

### Production Builds

```bash
# iOS production
eas build --platform ios --profile production
eas submit --platform ios --latest

# Android production
eas build --platform android --profile production
eas submit --platform android --latest

# Both platforms
eas build --platform all --profile production
```

---

## Monthly Costs

**EAS Free Tier**:
- 30 builds/month
- Unlimited OTA updates
- Good for getting started

**EAS Production Plan**: $29/month
- Unlimited builds
- Priority build queue
- Faster build machines

**App Store Fees**:
- Apple Developer: $99/year
- Google Play: $25 one-time

**Total First Year**: ~$480
**Total Ongoing**: ~$450/year + $29/month EAS (optional)

---

## Troubleshooting

### Build Fails

**Error**: Provisioning profile error (iOS)
- **Solution**: Check certificate expiration
- **Solution**: Regenerate provisioning profile in Apple Developer

**Error**: Android build fails
- **Solution**: Check `google-services.json` is present
- **Solution**: Verify bundle identifier matches

### OTA Update Not Applying

- **Solution**: Check app version is configured for updates
- **Solution**: Verify `updates.url` in `app.json`
- **Solution**: Users must restart app to get update

---

## Next Steps

1. ✅ Create app icons and splash screens
2. ✅ Write app store descriptions
3. ✅ Take screenshots for app stores
4. ✅ Set up push notifications
5. ✅ Configure analytics (Expo Analytics or PostHog)
6. ✅ Set up error tracking (Sentry)
7. ✅ Create privacy policy
8. ✅ Submit for review

---

**🎉 Your mobile app deployment pipeline is ready!**
