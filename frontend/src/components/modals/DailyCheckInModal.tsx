import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { dailyCheckInService, type DailyReadiness } from '../../services/dailyCheckInService';
import { Button } from '../ui/button';

interface DailyCheckInModalProps {
  readiness: DailyReadiness;
  onClose: () => void;
}

export function DailyCheckInModal({ readiness, onClose }: DailyCheckInModalProps) {
  const navigate = useNavigate();
  const [sleepQuality, setSleepQuality] = useState<'poor' | 'good' | 'great' | null>(null);
  const [feeling, setFeeling] = useState<'tired' | 'normal' | 'energized' | null>(null);
  const [saving, setSaving] = useState(false);

  const handleTalkToCoach = async () => {
    if (!sleepQuality || !feeling) {
      toast.error('Please answer both questions before continuing');
      return;
    }

    try {
      setSaving(true);

      // Save check-in data
      const updatedReadiness = await dailyCheckInService.saveDailyCheckIn({
        sleepQuality,
        feeling,
      });

      // Build context message for AI
      const contextParts = [
        `Good morning! Here's my daily check-in:`,
        `\nSleep: ${sleepQuality}`,
        `Feeling: ${feeling}`,
      ];

      if (readiness.todaysWorkout) {
        contextParts.push(
          `\nToday's planned workout: ${readiness.todaysWorkout.name} (${readiness.todaysWorkout.duration_minutes} min, ${readiness.todaysWorkout.tss} TSS)`
        );
      } else {
        contextParts.push(`\nNo workout scheduled for today`);
      }

      if (readiness.recentActivity.yesterdayWorkout) {
        contextParts.push(
          `\nYesterday: ${readiness.recentActivity.yesterdayWorkout.name} (${readiness.recentActivity.yesterdayWorkout.tss} TSS)`
        );
      }

      contextParts.push(
        `\nLast 7 days: ${readiness.recentActivity.last7DaysRides} rides, ${readiness.recentActivity.last7DaysTSS} total TSS`
      );

      contextParts.push(
        `\nBased on this, what do you recommend for my training today?`
      );

      const contextMessage = contextParts.join('');

      // Navigate to chat with context
      navigate('/chat', {
        state: {
          initialMessage: contextMessage,
          dailyCheckIn: {
            sleepQuality,
            feeling,
            readiness: updatedReadiness,
          },
        },
      });

      onClose();
    } catch (error: any) {
      console.error('Failed to save check-in:', error);
      toast.error(error.message || 'Failed to save check-in');
      setSaving(false);
    }
  };

  const getRecommendationColor = () => {
    switch (readiness.recommendation) {
      case 'push':
        return 'text-green-600 bg-green-50';
      case 'proceed':
        return 'text-blue-600 bg-blue-50';
      case 'light':
        return 'text-yellow-600 bg-yellow-50';
      case 'rest':
        return 'text-red-600 bg-red-50';
    }
  };

  const getRecommendationEmoji = () => {
    switch (readiness.recommendation) {
      case 'push':
        return '🚀';
      case 'proceed':
        return '✅';
      case 'light':
        return '⚠️';
      case 'rest':
        return '😴';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white p-6 rounded-t-2xl">
          <h2 className="text-2xl font-bold">Good Morning! 🌅</h2>
          <p className="text-blue-100 mt-1">Let's check in on your training</p>
        </div>

        <div className="p-6 space-y-6">
          {/* Today's Workout */}
          {readiness.todaysWorkout ? (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <h3 className="font-semibold text-blue-900 mb-2">📅 Today's Workout</h3>
              <p className="text-lg font-medium text-blue-800">
                {readiness.todaysWorkout.name}
              </p>
              <div className="flex gap-4 mt-2 text-sm text-blue-700">
                <span>⏱️ {readiness.todaysWorkout.duration_minutes} min</span>
                <span>📊 {readiness.todaysWorkout.tss} TSS</span>
                <span className="capitalize">🏃 {readiness.todaysWorkout.workout_type}</span>
              </div>
              {readiness.todaysWorkout.description && (
                <p className="text-sm text-blue-600 mt-2">
                  {readiness.todaysWorkout.description}
                </p>
              )}
            </div>
          ) : (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h3 className="font-semibold text-gray-700">📅 Today's Workout</h3>
              <p className="text-gray-600 mt-1">No workout scheduled • Rest day</p>
            </div>
          )}

          {/* Recent Training */}
          <div className="bg-gray-50 rounded-lg p-4">
            <h3 className="font-semibold text-gray-800 mb-3">📈 Last 7 Days</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-gray-600">Total Rides</p>
                <p className="text-2xl font-bold text-gray-900">
                  {readiness.recentActivity.last7DaysRides}
                </p>
              </div>
              <div>
                <p className="text-sm text-gray-600">Total TSS</p>
                <p className="text-2xl font-bold text-gray-900">
                  {readiness.recentActivity.last7DaysTSS}
                </p>
              </div>
            </div>
            {readiness.recentActivity.yesterdayWorkout && (
              <div className="mt-3 pt-3 border-t border-gray-200">
                <p className="text-sm text-gray-600">Yesterday</p>
                <p className="font-medium text-gray-900">
                  {readiness.recentActivity.yesterdayWorkout.name}
                </p>
                <p className="text-sm text-gray-600">
                  {readiness.recentActivity.yesterdayWorkout.tss} TSS •{' '}
                  {readiness.recentActivity.yesterdayWorkout.duration_minutes} min
                </p>
              </div>
            )}
          </div>

          {/* Check-in Questions */}
          <div className="space-y-4">
            {/* Sleep Quality */}
            <div>
              <label className="block font-semibold text-gray-800 mb-2">
                😴 How did you sleep?
              </label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setSleepQuality('poor')}
                  className={`py-3 px-4 rounded-lg border-2 transition-all ${
                    sleepQuality === 'poor'
                      ? 'border-red-500 bg-red-50 text-red-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-2xl mb-1">😴</div>
                  <div className="font-medium">Poor</div>
                </button>
                <button
                  onClick={() => setSleepQuality('good')}
                  className={`py-3 px-4 rounded-lg border-2 transition-all ${
                    sleepQuality === 'good'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-2xl mb-1">😊</div>
                  <div className="font-medium">Good</div>
                </button>
                <button
                  onClick={() => setSleepQuality('great')}
                  className={`py-3 px-4 rounded-lg border-2 transition-all ${
                    sleepQuality === 'great'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-2xl mb-1">😄</div>
                  <div className="font-medium">Great</div>
                </button>
              </div>
            </div>

            {/* Feeling */}
            <div>
              <label className="block font-semibold text-gray-800 mb-2">
                💪 How are you feeling?
              </label>
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setFeeling('tired')}
                  className={`py-3 px-4 rounded-lg border-2 transition-all ${
                    feeling === 'tired'
                      ? 'border-orange-500 bg-orange-50 text-orange-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-2xl mb-1">😩</div>
                  <div className="font-medium">Tired</div>
                </button>
                <button
                  onClick={() => setFeeling('normal')}
                  className={`py-3 px-4 rounded-lg border-2 transition-all ${
                    feeling === 'normal'
                      ? 'border-blue-500 bg-blue-50 text-blue-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-2xl mb-1">😐</div>
                  <div className="font-medium">Normal</div>
                </button>
                <button
                  onClick={() => setFeeling('energized')}
                  className={`py-3 px-4 rounded-lg border-2 transition-all ${
                    feeling === 'energized'
                      ? 'border-green-500 bg-green-50 text-green-700'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="text-2xl mb-1">⚡</div>
                  <div className="font-medium">Energized</div>
                </button>
              </div>
            </div>
          </div>

          {/* AI Recommendation Preview */}
          {sleepQuality && feeling && (
            <div className={`rounded-lg p-4 ${getRecommendationColor()}`}>
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">{getRecommendationEmoji()}</span>
                <h3 className="font-semibold">Initial Assessment</h3>
              </div>
              <p className="text-sm">{readiness.reasoning}</p>
              <p className="text-xs mt-2 opacity-75">
                Talk to your coach for personalized recommendations
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <Button
              onClick={onClose}
              variant="outline"
              className="flex-1"
            >
              Skip for now
            </Button>
            <Button
              onClick={handleTalkToCoach}
              disabled={!sleepQuality || !feeling || saving}
              className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
            >
              {saving ? 'Saving...' : '💬 Talk to Coach'}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
