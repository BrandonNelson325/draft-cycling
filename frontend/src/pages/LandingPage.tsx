import { Link } from 'react-router-dom';

const FEATURES = [
  {
    title: 'AI-Powered Coaching',
    description:
      'Chat with your personal cycling coach anytime. Get advice on training, nutrition, race strategy, and recovery — all tailored to your fitness level.',
    icon: '\u{1F9E0}',
  },
  {
    title: 'Adaptive Training Plans',
    description:
      "Plans that adapt to what you actually do. Missed a workout or went off-script? Your coach adjusts the plan automatically — no guilt, just progress.",
    icon: '\u{1F4C8}',
  },
  {
    title: 'Strava Integration',
    description:
      'Connect Strava and your rides sync automatically. Your coach sees every ride and uses the data to fine-tune your plan.',
    icon: 'strava',
  },
  {
    title: 'Structured Workouts',
    description:
      'Get structured workouts with power targets you can export to your bike computer. Zwift-compatible ZWO and FIT file downloads.',
    icon: '\u{26A1}',
  },
  {
    title: 'Morning Readiness Check-ins',
    description:
      'Quick daily check-ins help your coach understand how you feel, so your training matches your body — not just the calendar.',
    icon: '\u{2600}\u{FE0F}',
  },
  {
    title: 'Post-Ride Feedback',
    description:
      'After every ride, rate your effort and the coach learns what works for you. Over time, your plans get smarter and more personal.',
    icon: '\u{1F3AF}',
  },
];

const PRICING = [
  {
    name: 'Monthly',
    price: '$9.99',
    interval: '/month',
    description: 'Cancel anytime',
    highlight: false,
  },
  {
    name: 'Yearly',
    price: '$79',
    interval: '/year',
    description: 'Save 34% ($6.58/mo)',
    highlight: true,
  },
];

function StravaLogo({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M41.03 47.852l-5.572-10.976h-8.172L41.03 64l13.736-27.124h-8.18L41.03 47.852z"
        fill="#F9B797"
      />
      <path
        d="M27.898 36.876l-2.63-5.18L12.67 0h10.54l7.318 14.424 7.318-14.424h10.54L27.898 36.876z"
        fill="#F05222"
      />
    </svg>
  );
}

export function LandingPage() {
  return (
    <div className="min-h-screen bg-gray-950 text-gray-100">
      {/* Nav */}
      <nav className="fixed top-0 w-full z-50 bg-gray-950/80 backdrop-blur-md border-b border-gray-800">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src="/logo-dark.png" alt="Draft" className="h-10 w-auto" />
          </Link>
          <div className="flex items-center gap-4">
            <Link
              to="/login"
              className="text-sm text-gray-400 hover:text-white transition-colors"
            >
              Log in
            </Link>
            <Link
              to="/login?register=true"
              className="text-sm font-semibold bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-lg transition-colors"
            >
              Get Started Free
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-5xl md:text-6xl font-extrabold leading-tight tracking-tight">
            Your personal cycling coach,{' '}
            <span className="bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent">
              powered by AI
            </span>
          </h1>
          <p className="mt-6 text-xl text-gray-400 max-w-2xl mx-auto leading-relaxed">
            Adaptive training plans, real-time coaching, and Strava integration
            — all for less than the price of two coffees a month.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/login?register=true"
              className="inline-flex items-center justify-center px-8 py-3.5 text-base font-semibold bg-blue-600 hover:bg-blue-500 text-white rounded-xl transition-colors"
            >
              Start Free 7-Day Trial
            </Link>
            <a
              href="#features"
              className="inline-flex items-center justify-center px-8 py-3.5 text-base font-semibold border border-gray-700 hover:border-gray-500 text-gray-300 rounded-xl transition-colors"
            >
              Learn More
            </a>
          </div>
          <p className="mt-4 text-sm text-gray-500">No credit card required to explore. 7-day free trial on all plans.</p>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-20 px-6 bg-gray-900/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-4">
            Everything you need to ride stronger
          </h2>
          <p className="text-gray-400 text-center mb-14 max-w-2xl mx-auto">
            Draft combines AI coaching with your real ride data to create training plans that actually work for your life.
          </p>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-8">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="bg-gray-800/50 border border-gray-700/50 rounded-2xl p-6 hover:border-gray-600 transition-colors"
              >
                <div className="text-3xl mb-4">
                  {f.icon === 'strava' ? <StravaLogo className="w-9 h-9" /> : f.icon}
                </div>
                <h3 className="text-lg font-semibold mb-2">{f.title}</h3>
                <p className="text-sm text-gray-400 leading-relaxed">{f.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-20 px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Simple, affordable pricing</h2>
          <p className="text-gray-400 mb-12">
            Real coaching shouldn't cost a fortune. Get started with a 7-day free trial.
          </p>
          <div className="grid sm:grid-cols-2 gap-6 max-w-xl mx-auto">
            {PRICING.map((p) => (
              <div
                key={p.name}
                className={`rounded-2xl p-6 border-2 ${
                  p.highlight
                    ? 'border-blue-500 bg-blue-950/30'
                    : 'border-gray-700 bg-gray-800/30'
                } relative`}
              >
                {p.highlight && (
                  <span className="absolute -top-3 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs font-bold px-3 py-1 rounded-full">
                    BEST VALUE
                  </span>
                )}
                <p className="text-lg font-semibold">{p.name}</p>
                <div className="mt-3">
                  <span className="text-4xl font-extrabold">{p.price}</span>
                  <span className="text-gray-400">{p.interval}</span>
                </div>
                <p className="text-sm text-gray-400 mt-2">{p.description}</p>
                <Link
                  to="/login?register=true"
                  className={`mt-6 block text-center py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                    p.highlight
                      ? 'bg-blue-600 hover:bg-blue-500 text-white'
                      : 'bg-gray-700 hover:bg-gray-600 text-gray-200'
                  }`}
                >
                  Start Free Trial
                </Link>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Download */}
      <section id="download" className="py-20 px-6 bg-gray-900/50">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Take your coach everywhere</h2>
          <p className="text-gray-400 mb-8">
            Available on iOS and Android. Train smarter from your pocket.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <a
              href="#"
              className="inline-flex items-center justify-center gap-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl px-6 py-3 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-7 h-7 fill-current" xmlns="http://www.w3.org/2000/svg">
                <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
              </svg>
              <div className="text-left">
                <div className="text-xs text-gray-400">Download on the</div>
                <div className="text-sm font-semibold">App Store</div>
              </div>
            </a>
            <a
              href="#"
              className="inline-flex items-center justify-center gap-3 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl px-6 py-3 transition-colors"
            >
              <svg viewBox="0 0 24 24" className="w-7 h-7 fill-current" xmlns="http://www.w3.org/2000/svg">
                <path d="M3.18 23.73c.44.23.97.2 1.38-.08l16.18-9.47c.44-.26.71-.74.71-1.25s-.27-.99-.71-1.25L4.56.22c-.41-.28-.94-.31-1.38-.08S2.5.7 2.5 1.18v21.65c0 .49.25.93.68 1.17v-.27zM5.5 3.84L13.72 12 5.5 20.16V3.84z"/>
              </svg>
              <div className="text-left">
                <div className="text-xs text-gray-400">Get it on</div>
                <div className="text-sm font-semibold">Google Play</div>
              </div>
            </a>
          </div>
          <p className="text-xs text-gray-500 mt-4">Coming soon to app stores</p>
        </div>
      </section>

      {/* Contact / Support */}
      <section id="contact" className="py-20 px-6">
        <div className="max-w-xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Questions? We're here to help.</h2>
          <p className="text-gray-400 mb-8">
            Whether you need help getting started or have feedback about the app, reach out anytime.
          </p>
          <a
            href="mailto:support@draftcycling.com"
            className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold px-8 py-3.5 rounded-xl transition-colors"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
              <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
            </svg>
            support@draftcycling.com
          </a>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-gray-800 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src="/logo-dark.png" alt="Draft" className="h-7 w-auto" />
            <span className="text-sm text-gray-500">&copy; {new Date().getFullYear()} Draft Cycling. All rights reserved.</span>
          </div>
          <div className="flex gap-6 text-sm text-gray-500">
            <a href="#features" className="hover:text-gray-300 transition-colors">Features</a>
            <a href="#pricing" className="hover:text-gray-300 transition-colors">Pricing</a>
            <a href="mailto:support@draftcycling.com" className="hover:text-gray-300 transition-colors">Support</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
