export function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#0a0a0a] text-gray-300">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <a href="/" className="inline-block mb-10">
          <img src="/logo-dark.png" alt="Draft" className="h-8 w-auto" />
        </a>

        <h1 className="text-4xl font-bold text-white mb-2">Privacy Policy</h1>
        <p className="text-sm text-gray-500 mb-10">Last updated: March 10, 2026</p>

        <div className="space-y-8 leading-relaxed">
          <section>
            <p>
              Draft Cycling ("Draft", "we", "us", or "our") operates the Draft web application
              at draftcycling.com and the Draft mobile application (collectively, the "Service").
              This Privacy Policy explains what information we collect, how we use it, how we
              share it, and your choices regarding your data.
            </p>
            <p className="mt-3">
              By using the Service, you agree to the collection and use of information in
              accordance with this policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">1. Information We Collect</h2>

            <h3 className="text-lg font-medium text-white mt-4 mb-2">Account Information</h3>
            <p>When you create an account, we collect:</p>
            <ul className="list-disc ml-6 mt-2 space-y-1">
              <li>Email address</li>
              <li>Name (optional)</li>
              <li>Password (stored securely via Supabase Auth; we never store passwords in plaintext)</li>
              <li>Timezone</li>
            </ul>

            <h3 className="text-lg font-medium text-white mt-4 mb-2">Profile & Training Information</h3>
            <p>To provide personalized coaching, you may provide:</p>
            <ul className="list-disc ml-6 mt-2 space-y-1">
              <li>Functional Threshold Power (FTP)</li>
              <li>Body weight</li>
              <li>Training goals and event dates</li>
              <li>Training preferences (weekly hours, rest days, intensity preference, indoor/outdoor, equipment)</li>
              <li>Unit system preference (metric/imperial)</li>
              <li>Display mode preference</li>
            </ul>

            <h3 className="text-lg font-medium text-white mt-4 mb-2">Activity Data from Third-Party Services</h3>
            <p>
              When you connect a third-party fitness service (such as Strava or Garmin), we receive
              and store activity data including:
            </p>
            <ul className="list-disc ml-6 mt-2 space-y-1">
              <li>Activity name, type, date, and duration</li>
              <li>Distance, elevation gain, and speed</li>
              <li>Power data (average, normalized, and peak power at various durations)</li>
              <li>Heart rate data (average and maximum)</li>
              <li>Cadence data</li>
              <li>Energy expenditure (kilojoules)</li>
              <li>GPS/location data (start coordinates and route maps, as provided by the connected service)</li>
              <li>Device and gear information</li>
            </ul>
            <p className="mt-2">
              We use this data to calculate training metrics (Training Stress Score, Chronic Training
              Load, Acute Training Load, Training Stress Balance), build power curves, and provide
              personalized coaching recommendations.
            </p>

            <h3 className="text-lg font-medium text-white mt-4 mb-2">Health & Wellness Data</h3>
            <p>You may optionally provide daily wellness data including:</p>
            <ul className="list-disc ml-6 mt-2 space-y-1">
              <li>Sleep duration, quality, and score</li>
              <li>Heart rate variability (HRV) and resting heart rate</li>
              <li>Readiness and stress scores</li>
              <li>Subjective energy/feeling ratings</li>
              <li>Post-ride perceived effort (RPE) and notes</li>
            </ul>

            <h3 className="text-lg font-medium text-white mt-4 mb-2">AI Coaching Conversations</h3>
            <p>
              When you use the AI coaching feature, we store your conversation messages and the
              AI's responses to maintain conversation history and improve coaching quality.
            </p>

            <h3 className="text-lg font-medium text-white mt-4 mb-2">Payment Information</h3>
            <p>
              Payments are processed by Stripe. We store your Stripe customer ID and subscription
              status but do not store credit card numbers or payment method details directly.
              Please refer to{' '}
              <a href="https://stripe.com/privacy" className="text-blue-400 hover:text-blue-300" target="_blank" rel="noopener noreferrer">
                Stripe's Privacy Policy
              </a>{' '}
              for how they handle payment data.
            </p>

            <h3 className="text-lg font-medium text-white mt-4 mb-2">Device Information</h3>
            <p>
              If you use the mobile app and enable push notifications, we store your device's push
              notification token to deliver notifications. We do not collect device identifiers
              beyond this token.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">2. How We Use Your Information</h2>
            <p>We use the information we collect to:</p>
            <ul className="list-disc ml-6 mt-2 space-y-1">
              <li>Provide, maintain, and improve the Service</li>
              <li>Calculate training load, fitness, fatigue, and form metrics</li>
              <li>Generate personalized training plans and workout recommendations</li>
              <li>Power AI coaching conversations with context about your training</li>
              <li>Generate workout files (ZWO, FIT) compatible with smart trainers</li>
              <li>Send push notifications (ride summaries, morning check-in reminders)</li>
              <li>Process subscription payments</li>
              <li>Respond to support requests</li>
            </ul>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">3. How We Share Your Information</h2>
            <p>
              We do not sell your personal information. We share data with third-party services
              only as necessary to provide the Service:
            </p>

            <ul className="list-disc ml-6 mt-2 space-y-2">
              <li>
                <strong className="text-white">Anthropic (Claude AI)</strong> — Your training data,
                profile information, and conversation messages are sent to Anthropic's API to power
                AI coaching. This includes ride summaries, training metrics, health data, and
                preferences. Anthropic processes this data according to their{' '}
                <a href="https://www.anthropic.com/privacy" className="text-blue-400 hover:text-blue-300" target="_blank" rel="noopener noreferrer">
                  Privacy Policy
                </a>.
              </li>
              <li>
                <strong className="text-white">Strava</strong> — We exchange OAuth tokens and
                receive activity data via the Strava API. We access only the data you authorize.
                See{' '}
                <a href="https://www.strava.com/legal/privacy" className="text-blue-400 hover:text-blue-300" target="_blank" rel="noopener noreferrer">
                  Strava's Privacy Policy
                </a>.
              </li>
              <li>
                <strong className="text-white">Garmin</strong> — If you connect Garmin, we receive
                activity and health data via the Garmin API. We access only the data you authorize.
                See{' '}
                <a href="https://www.garmin.com/en-US/privacy/connect/" className="text-blue-400 hover:text-blue-300" target="_blank" rel="noopener noreferrer">
                  Garmin's Privacy Policy
                </a>.
              </li>
              <li>
                <strong className="text-white">Stripe</strong> — Your email and account identifier
                are shared with Stripe for payment processing. See{' '}
                <a href="https://stripe.com/privacy" className="text-blue-400 hover:text-blue-300" target="_blank" rel="noopener noreferrer">
                  Stripe's Privacy Policy
                </a>.
              </li>
              <li>
                <strong className="text-white">Expo (Push Notifications)</strong> — Your device
                push token and notification content are sent through Expo's push notification
                service.
              </li>
              <li>
                <strong className="text-white">Supabase</strong> — Our database and authentication
                provider. All user data is stored in Supabase's infrastructure with row-level
                security. See{' '}
                <a href="https://supabase.com/privacy" className="text-blue-400 hover:text-blue-300" target="_blank" rel="noopener noreferrer">
                  Supabase's Privacy Policy
                </a>.
              </li>
            </ul>

            <p className="mt-3">
              We may also disclose information if required by law or if we believe disclosure is
              necessary to protect our rights, your safety, or the safety of others.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">4. Third-Party Integrations</h2>
            <p>
              When you connect a third-party service (Strava, Garmin, or others), you authorize us
              to access specific data from that service. You can disconnect these integrations at
              any time from your account settings, which will stop future data syncing. Previously
              synced data will remain in your account unless you request its deletion.
            </p>
            <p className="mt-3">
              We only request the minimum permissions necessary to provide the Service. We do not
              access data beyond what is required for training analysis and coaching.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">5. Data Storage & Security</h2>
            <p>
              Your data is stored securely using Supabase (PostgreSQL with row-level security
              policies). Authentication tokens on mobile devices are stored in the device's secure
              keychain (iOS Keychain / Android Keystore). We use HTTPS for all data transmission.
            </p>
            <p className="mt-3">
              While we implement industry-standard security measures, no method of electronic
              storage or transmission is 100% secure. We cannot guarantee absolute security.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">6. Data Retention</h2>
            <p>
              We retain your data for as long as your account is active. If you delete your account,
              we will delete your personal data within 30 days, except where we are required by
              law to retain it.
            </p>
            <p className="mt-3">
              Activity data synced from third-party services is retained to provide historical
              training analysis. You may request deletion of specific data at any time.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">7. Your Rights & Choices</h2>
            <p>You have the right to:</p>
            <ul className="list-disc ml-6 mt-2 space-y-1">
              <li><strong className="text-white">Access</strong> your personal data</li>
              <li><strong className="text-white">Correct</strong> inaccurate data in your profile settings</li>
              <li><strong className="text-white">Delete</strong> your account and associated data</li>
              <li><strong className="text-white">Export</strong> your data</li>
              <li><strong className="text-white">Disconnect</strong> third-party integrations at any time</li>
              <li><strong className="text-white">Opt out</strong> of push notifications via your device or account settings</li>
            </ul>
            <p className="mt-3">
              To exercise any of these rights, contact us at{' '}
              <a href="mailto:support@draftcycling.com" className="text-blue-400 hover:text-blue-300">
                support@draftcycling.com
              </a>.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">8. Children's Privacy</h2>
            <p>
              The Service is not directed to children under 13. We do not knowingly collect
              personal information from children under 13. If you believe a child has provided us
              with personal information, please contact us and we will delete it.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">9. Analytics & Tracking</h2>
            <p>
              We do not use third-party analytics services, advertising trackers, or cookies for
              behavioral tracking. We do not sell or share your data with advertisers.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">10. Changes to This Policy</h2>
            <p>
              We may update this Privacy Policy from time to time. We will notify you of material
              changes by posting the updated policy on this page and updating the "Last updated"
              date. Your continued use of the Service after changes constitutes acceptance of the
              updated policy.
            </p>
          </section>

          <section>
            <h2 className="text-xl font-semibold text-white mb-3">11. Contact Us</h2>
            <p>
              If you have questions about this Privacy Policy or your data, contact us at:
            </p>
            <p className="mt-2">
              <a href="mailto:support@draftcycling.com" className="text-blue-400 hover:text-blue-300">
                support@draftcycling.com
              </a>
            </p>
          </section>
        </div>

        <div className="mt-16 pt-8 border-t border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo-dark.png" alt="Draft" className="h-6 w-auto" />
            <span className="text-sm text-gray-500">&copy; {new Date().getFullYear()} Draft Cycling. All rights reserved.</span>
          </div>
        </div>
      </div>
    </div>
  );
}
