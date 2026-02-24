import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { TrendingUp, TrendingDown, Minus, MessageCircle, Calendar, X } from 'lucide-react';
import toast from 'react-hot-toast';
import type { DailyAnalysis } from '../../services/dailyAnalysisService';
import { dailyCheckInService, type DailyReadiness } from '../../services/dailyCheckInService';
import { Button } from '../ui/button';

interface DailyMorningModalProps {
  analysis: DailyAnalysis | null;
  readiness: DailyReadiness;
  onClose: () => void;
}

type SleepQuality = 'poor' | 'good' | 'great';
type Feeling = 'tired' | 'normal' | 'energized';

export function DailyMorningModal({ analysis, readiness, onClose }: DailyMorningModalProps) {
  const navigate = useNavigate();
  const [step, setStep] = useState<'checkin' | 'analysis'>('checkin');
  const [sleepQuality, setSleepQuality] = useState<SleepQuality | null>(null);
  const [feeling, setFeeling] = useState<Feeling | null>(null);
  const [saving, setSaving] = useState(false);

  // ── Step 1: Check-in ─────────────────────────────────────────────────────

  const handleCheckInNext = async () => {
    if (!sleepQuality || !feeling) {
      toast.error('Please answer both questions before continuing');
      return;
    }
    try {
      setSaving(true);
      await dailyCheckInService.saveDailyCheckIn({ sleepQuality, feeling });
      if (analysis) {
        setStep('analysis');
      } else {
        // No analysis — go straight to chat
        goToChat();
      }
    } catch (error: any) {
      toast.error(error.message || 'Failed to save check-in');
    } finally {
      setSaving(false);
    }
  };

  // ── Step 2: Analysis ─────────────────────────────────────────────────────

  const getStatusIcon = () => {
    switch (analysis?.status) {
      case 'fresh':
      case 'well-recovered':
        return <TrendingUp className="w-6 h-6 text-green-600" />;
      case 'slightly-tired':
        return <Minus className="w-6 h-6 text-orange-500" />;
      case 'fatigued':
        return <TrendingDown className="w-6 h-6 text-red-500" />;
    }
  };

  const getStatusText = () => {
    switch (analysis?.status) {
      case 'fresh': return 'Very Fresh';
      case 'well-recovered': return 'Well Recovered';
      case 'slightly-tired': return 'Slightly Tired';
      case 'fatigued': return 'Fatigued';
    }
  };

  const getStatusColor = () => {
    switch (analysis?.status) {
      case 'fresh':
      case 'well-recovered': return 'bg-green-50 border-green-200';
      case 'slightly-tired': return 'bg-orange-50 border-orange-200';
      case 'fatigued': return 'bg-red-50 border-red-200';
      default: return 'bg-gray-50 border-gray-200';
    }
  };

  const goToChat = () => {
    const parts: string[] = ["Good morning! Here's my daily check-in:"];

    if (sleepQuality && feeling) {
      parts.push(`\nSleep: ${sleepQuality}, Feeling: ${feeling}`);
    }

    if (analysis) {
      parts.push(`\n\n${analysis.summary}`);
      parts.push(`\nRecommendation: ${analysis.recommendation}`);
    } else {
      if (readiness.todaysWorkout) {
        parts.push(
          `\nToday's workout: ${readiness.todaysWorkout.name} (${readiness.todaysWorkout.duration_minutes} min, ${readiness.todaysWorkout.tss} TSS)`
        );
      }
      parts.push(
        `\nLast 7 days: ${readiness.recentActivity.last7DaysRides} rides, ${readiness.recentActivity.last7DaysTSS} total TSS`
      );
    }

    parts.push('\nWhat do you recommend for my training today?');

    navigate('/chat', { state: { initialMessage: parts.join('') } });
    onClose();
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">

        {/* Header */}
        <div className="bg-gradient-to-r from-blue-500 to-indigo-600 text-white p-6 rounded-t-2xl relative">
          <button onClick={onClose} className="absolute top-4 right-4 text-white/70 hover:text-white">
            <X className="w-5 h-5" />
          </button>
          <h2 className="text-2xl font-bold">Good morning! 🌅</h2>
          <p className="text-blue-100 mt-1">
            {step === 'checkin'
              ? "Let's check in on how you're feeling"
              : "Here's your training status for today"}
          </p>

          {/* Step progress — only shown when both steps are present */}
          {analysis && (
            <div className="flex gap-2 mt-3">
              <div className={`h-1 flex-1 rounded-full ${step === 'checkin' ? 'bg-white' : 'bg-white/40'}`} />
              <div className={`h-1 flex-1 rounded-full ${step === 'analysis' ? 'bg-white' : 'bg-white/40'}`} />
            </div>
          )}
        </div>

        <div className="p-6 space-y-6">

          {/* ── STEP 1: Check-In ───────────────────────────────────────── */}
          {step === 'checkin' && (
            <>
              {/* Today's Workout */}
              {readiness.todaysWorkout ? (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <h3 className="font-semibold text-blue-900 mb-2">📅 Today's Workout</h3>
                  <p className="text-lg font-medium text-blue-800">{readiness.todaysWorkout.name}</p>
                  <div className="flex gap-4 mt-2 text-sm text-blue-700">
                    <span>⏱️ {readiness.todaysWorkout.duration_minutes} min</span>
                    <span>📊 {readiness.todaysWorkout.tss} TSS</span>
                    <span className="capitalize">🏃 {readiness.todaysWorkout.workout_type}</span>
                  </div>
                </div>
              ) : (
                <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-700">📅 Today's Workout</h3>
                  <p className="text-gray-600 mt-1">No workout scheduled · Rest day</p>
                </div>
              )}

              {/* Sleep Quality */}
              <div>
                <label className="block font-semibold text-gray-800 mb-2">😴 How did you sleep?</label>
                <div className="grid grid-cols-3 gap-3">
                  {([
                    { value: 'poor', emoji: '😴', label: 'Poor', active: 'border-red-500 bg-red-50 text-red-700' },
                    { value: 'good', emoji: '😊', label: 'Good', active: 'border-blue-500 bg-blue-50 text-blue-700' },
                    { value: 'great', emoji: '😄', label: 'Great', active: 'border-green-500 bg-green-50 text-green-700' },
                  ] as const).map(({ value, emoji, label, active }) => (
                    <button
                      key={value}
                      onClick={() => setSleepQuality(value)}
                      className={`py-3 px-4 rounded-xl border-2 transition-all ${
                        sleepQuality === value ? active : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-2xl mb-1">{emoji}</div>
                      <div className="font-medium">{label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Feeling */}
              <div>
                <label className="block font-semibold text-gray-800 mb-2">💪 How are you feeling?</label>
                <div className="grid grid-cols-3 gap-3">
                  {([
                    { value: 'tired', emoji: '😩', label: 'Tired', active: 'border-orange-500 bg-orange-50 text-orange-700' },
                    { value: 'normal', emoji: '😐', label: 'Normal', active: 'border-blue-500 bg-blue-50 text-blue-700' },
                    { value: 'energized', emoji: '⚡', label: 'Energized', active: 'border-green-500 bg-green-50 text-green-700' },
                  ] as const).map(({ value, emoji, label, active }) => (
                    <button
                      key={value}
                      onClick={() => setFeeling(value)}
                      className={`py-3 px-4 rounded-xl border-2 transition-all ${
                        feeling === value ? active : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="text-2xl mb-1">{emoji}</div>
                      <div className="font-medium">{label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-3 pt-2">
                <Button variant="outline" onClick={onClose} className="flex-1">
                  Skip
                </Button>
                <Button
                  onClick={handleCheckInNext}
                  disabled={!sleepQuality || !feeling || saving}
                  className="flex-1 bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700"
                >
                  {saving ? 'Saving...' : analysis ? 'See My Analysis →' : '💬 Talk to Coach'}
                </Button>
              </div>
            </>
          )}

          {/* ── STEP 2: Analysis ───────────────────────────────────────── */}
          {step === 'analysis' && analysis && (
            <>
              {/* Check-in recap */}
              {sleepQuality && feeling && (
                <div className="flex gap-2 text-sm text-gray-600 bg-gray-50 rounded-lg px-4 py-2">
                  <span>Sleep: <strong className="capitalize">{sleepQuality}</strong></span>
                  <span>·</span>
                  <span>Feeling: <strong className="capitalize">{feeling}</strong></span>
                </div>
              )}

              {/* Status */}
              <div className={`border rounded-xl p-4 ${getStatusColor()}`}>
                <div className="flex items-center gap-3">
                  {getStatusIcon()}
                  <div>
                    <div className="font-semibold text-lg">{getStatusText()}</div>
                    <div className="text-sm text-gray-600">
                      Form: {analysis.currentTSB.toFixed(1)} · Fitness: {analysis.currentCTL.toFixed(1)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary */}
              <div>
                <h3 className="font-semibold mb-2">Summary</h3>
                <p className="text-sm text-gray-700">{analysis.summary}</p>
              </div>

              {/* Yesterday's Training */}
              {analysis.yesterdayRides.length > 0 && (
                <div>
                  <h3 className="font-semibold mb-2">Yesterday's Training</h3>
                  <div className="space-y-2">
                    {analysis.yesterdayRides.map((ride, index) => (
                      <div
                        key={index}
                        className="flex items-center justify-between text-sm bg-gray-50 rounded-lg p-3"
                      >
                        <span className="font-medium">{ride.name}</span>
                        <div className="flex gap-3 text-gray-500">
                          <span>{ride.duration}min</span>
                          <span>{ride.tss} TSS</span>
                          {ride.avgPower > 0 && <span>{ride.avgPower}W</span>}
                        </div>
                      </div>
                    ))}
                    <div className="text-right text-sm font-medium text-gray-700">
                      Total TSS: {Math.round(analysis.yesterdayTotalTSS)}
                    </div>
                  </div>
                </div>
              )}

              {/* Today's Workout */}
              {analysis.todaysWorkout && (
                <div>
                  <h3 className="font-semibold mb-2">Today's Scheduled Workout</h3>
                  <div className="bg-primary/5 border border-primary/20 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{analysis.todaysWorkout.name}</span>
                      <span className="text-xs bg-primary text-primary-foreground px-2 py-1 rounded">
                        {analysis.todaysWorkout.type}
                      </span>
                    </div>
                    <div className="flex gap-3 text-sm text-gray-500">
                      <span>{analysis.todaysWorkout.duration} minutes</span>
                      <span>{analysis.todaysWorkout.tss} TSS</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Recommendation */}
              <div>
                <h3 className="font-semibold mb-2">Recommendation</h3>
                <p className="text-sm text-gray-700 bg-blue-50 border border-blue-200 rounded-xl p-3">
                  {analysis.recommendation}
                </p>
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <Button onClick={goToChat} className="flex-1 rounded-xl">
                  <MessageCircle className="w-4 h-4 mr-2" />
                  Let's discuss this
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { navigate('/calendar'); onClose(); }}
                  className="flex-1 rounded-xl"
                >
                  <Calendar className="w-4 h-4 mr-2" />
                  View Calendar
                </Button>
              </div>

              <Button variant="ghost" onClick={onClose} className="w-full rounded-xl">
                Close
              </Button>
            </>
          )}

        </div>
      </div>
    </div>
  );
}
