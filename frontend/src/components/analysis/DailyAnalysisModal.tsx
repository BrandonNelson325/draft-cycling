import { useNavigate } from 'react-router-dom';
import { X, TrendingUp, TrendingDown, Minus, MessageCircle, Calendar } from 'lucide-react';
import type { DailyAnalysis } from '../../services/dailyAnalysisService';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/card';
import { Button } from '../ui/button';

interface DailyAnalysisModalProps {
  analysis: DailyAnalysis;
  onClose: () => void;
}

export function DailyAnalysisModal({ analysis, onClose }: DailyAnalysisModalProps) {
  const navigate = useNavigate();

  const getStatusIcon = () => {
    switch (analysis.status) {
      case 'fresh':
        return <TrendingUp className="w-6 h-6 text-green-600" />;
      case 'well-recovered':
        return <TrendingUp className="w-6 h-6 text-green-500" />;
      case 'slightly-tired':
        return <Minus className="w-6 h-6 text-orange-500" />;
      case 'fatigued':
        return <TrendingDown className="w-6 h-6 text-red-500" />;
    }
  };

  const getStatusText = () => {
    switch (analysis.status) {
      case 'fresh':
        return 'Very Fresh';
      case 'well-recovered':
        return 'Well Recovered';
      case 'slightly-tired':
        return 'Slightly Tired';
      case 'fatigued':
        return 'Fatigued';
    }
  };

  const getStatusColor = () => {
    switch (analysis.status) {
      case 'fresh':
        return 'bg-green-50 border-green-200';
      case 'well-recovered':
        return 'bg-green-50 border-green-200';
      case 'slightly-tired':
        return 'bg-orange-50 border-orange-200';
      case 'fatigued':
        return 'bg-red-50 border-red-200';
    }
  };

  const handleChatAboutThis = () => {
    // Navigate to chat with pre-populated context
    navigate('/chat', {
      state: {
        initialMessage: `I'd like to discuss my training status for today. Here's my daily analysis:\n\n${analysis.summary}\n\nRecommendation: ${analysis.recommendation}\n\nWhat do you think?`,
      },
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
      <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <CardHeader className="relative pb-4">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
          <CardTitle className="text-2xl">Good morning! ☀️</CardTitle>
          <p className="text-sm text-muted-foreground">Here's your training status for today</p>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Status Card */}
          <div className={`border rounded-xl p-4 ${getStatusColor()}`}>
            <div className="flex items-center gap-3 mb-2">
              {getStatusIcon()}
              <div>
                <div className="font-semibold text-lg">{getStatusText()}</div>
                <div className="text-sm text-muted-foreground">
                  Form: {analysis.currentTSB.toFixed(1)} | Fitness: {analysis.currentCTL.toFixed(1)}
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
                    <div className="flex gap-3 text-muted-foreground">
                      <span>{ride.duration}min</span>
                      <span>{ride.tss} TSS</span>
                      {ride.avgPower > 0 && <span>{ride.avgPower}W</span>}
                    </div>
                  </div>
                ))}
                <div className="text-right text-sm font-medium">
                  Total TSS: {analysis.yesterdayTotalTSS}
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
                <div className="flex gap-3 text-sm text-muted-foreground">
                  <span>{analysis.todaysWorkout.duration} minutes</span>
                  <span>{analysis.todaysWorkout.tss} TSS</span>
                </div>
              </div>
            </div>
          )}

          {/* Recommendation */}
          <div>
            <h3 className="font-semibold mb-2">Recommendation</h3>
            <p className="text-sm text-gray-700 bg-blue-50 border border-blue-200 rounded-lg p-3">
              {analysis.recommendation}
            </p>
          </div>

          {/* Actions */}
          <div className="flex gap-3">
            <Button
              onClick={handleChatAboutThis}
              className="flex-1 rounded-xl"
            >
              <MessageCircle className="w-4 h-4 mr-2" />
              Let's discuss this
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                navigate('/calendar');
                onClose();
              }}
              className="flex-1 rounded-xl"
            >
              <Calendar className="w-4 h-4 mr-2" />
              View Calendar
            </Button>
          </div>

          <Button
            variant="ghost"
            onClick={onClose}
            className="w-full rounded-xl"
          >
            Close
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
