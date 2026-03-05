import { useState } from 'react';
import { X, Activity, MessageCircle, Calendar, Dumbbell, Route } from 'lucide-react';
import { Button } from '../ui/button';

interface WelcomeModalProps {
  onClose: () => void;
  showWelcome?: boolean;
}

const features = [
  {
    icon: Activity,
    title: 'Training Status',
    description: 'Your dashboard shows a real-time freshness score based on your recent training load. See at a glance whether you\'re ready to push hard or need recovery.',
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    icon: Route,
    title: 'Strava Sync',
    description: 'Connect Strava and your rides sync automatically. We track your power, TSS, and fitness trends so everything stays up to date.',
    color: 'text-orange-600',
    bg: 'bg-orange-50',
  },
  {
    icon: MessageCircle,
    title: 'AI Coach',
    description: 'Chat with your AI cycling coach anytime. Get feedback on your training, ask for advice, or talk through race strategy. It knows your fitness and history.',
    color: 'text-purple-600',
    bg: 'bg-purple-50',
  },
  {
    icon: Dumbbell,
    title: 'Custom Workouts',
    description: 'Ask the coach to build a workout for you — VO2max intervals, sweet spot, recovery spins, anything. It creates structured workouts with power targets you can download.',
    color: 'text-green-600',
    bg: 'bg-green-50',
  },
  {
    icon: Calendar,
    title: 'Training Plans',
    description: 'Need a full plan? Tell the coach your goal and timeline and it\'ll build a periodized plan on your calendar — from base through race day.',
    color: 'text-red-600',
    bg: 'bg-red-50',
  },
];

export function WelcomeModal({ onClose, showWelcome = true }: WelcomeModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const showingWelcome = showWelcome && currentIndex === 0;
  const featureIndex = showWelcome ? currentIndex - 1 : currentIndex;
  const totalSteps = features.length + (showWelcome ? 1 : 0);
  const isLastStep = currentIndex === totalSteps - 1;

  const handleNext = () => {
    if (isLastStep) {
      onClose();
    } else {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleBack = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="relative bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-5">
          <button
            onClick={onClose}
            className="absolute top-3 right-3 text-white/70 hover:text-white transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-xl font-bold text-white">
            {showingWelcome ? 'Welcome to Draft!' : features[featureIndex].title}
          </h2>
          {/* Step dots */}
          <div className="flex gap-1.5 mt-3">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div
                key={i}
                className={`h-1 rounded-full transition-all ${
                  i === currentIndex ? 'w-6 bg-white' : 'w-1.5 bg-white/40'
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5">
          {showingWelcome ? (
            <div className="space-y-4">
              <p className="text-gray-700 leading-relaxed">
                Draft is your AI-powered cycling coach. It learns from your rides,
                tracks your fitness, and gives you personalized training guidance — all in one place.
              </p>
              <p className="text-gray-500 text-sm">
                Here's a quick look at what you can do.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              <div className={`inline-flex p-2.5 rounded-lg ${features[featureIndex].bg}`}>
                {(() => {
                  const Icon = features[featureIndex].icon;
                  return <Icon className={`w-6 h-6 ${features[featureIndex].color}`} />;
                })()}
              </div>
              <p className="text-gray-700 leading-relaxed">
                {features[featureIndex].description}
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-5 flex items-center justify-between">
          {currentIndex > 0 ? (
            <button
              onClick={handleBack}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
            >
              Back
            </button>
          ) : (
            <div />
          )}
          <Button onClick={handleNext}>
            {isLastStep ? "Let's Go" : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
}
