import { useState, useEffect } from 'react';
import {
  activityFeedbackService,
  type UnacknowledgedActivity,
  type ActivityFeedback,
} from '../services/activityFeedbackService';
import { useAuthStore } from '../stores/useAuthStore';

const SESSION_KEY = 'new_activities_last_checked';

export function useNewActivities() {
  const [activities, setActivities] = useState<UnacknowledgedActivity[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const { user } = useAuthStore();

  useEffect(() => {
    if (!user) return;

    // Only fetch once per app session
    if (sessionStorage.getItem(SESSION_KEY)) return;

    fetchUnacknowledged();
  }, [user]);

  const fetchUnacknowledged = async () => {
    try {
      const list = await activityFeedbackService.getUnacknowledged();
      setActivities(list);
      sessionStorage.setItem(SESSION_KEY, new Date().toISOString());
    } catch (error) {
      console.error('Error fetching unacknowledged activities:', error);
    }
  };

  const acknowledge = async (feedback: ActivityFeedback) => {
    const current = activities[currentIndex];
    if (!current) return;

    try {
      await activityFeedbackService.acknowledge(current.id, feedback);
    } catch (error) {
      console.error('Error acknowledging activity:', error);
    }

    advanceToNext();
  };

  const skip = async () => {
    const current = activities[currentIndex];
    if (!current) return;

    try {
      // Acknowledge with no feedback so it won't reappear
      await activityFeedbackService.acknowledge(current.id, {});
    } catch (error) {
      console.error('Error skipping activity:', error);
    }

    advanceToNext();
  };

  const advanceToNext = () => {
    setCurrentIndex((prev) => prev + 1);
  };

  return { activities, currentIndex, acknowledge, skip };
}
