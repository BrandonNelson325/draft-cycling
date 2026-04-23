import { useState, useEffect } from 'react';
import { AppState } from 'react-native';
import {
  activityFeedbackService,
  type UnacknowledgedActivity,
  type ActivityFeedback,
} from '../services/activityFeedbackService';
import { useAuthStore } from '../stores/useAuthStore';

export function useNewActivities() {
  const [activities, setActivities] = useState<UnacknowledgedActivity[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const { user } = useAuthStore();

  useEffect(() => {
    if (!user) return;
    // Fetch on mount, and again every time the app returns to the foreground —
    // this catches rides that finished while the app was backgrounded (e.g. a
    // user completes a ride in the evening and reopens the app the same night).
    // Previously we gated this with a once-per-calendar-day AsyncStorage flag,
    // which suppressed the post-ride survey if the user had already opened the
    // app earlier the same day.
    fetchUnacknowledged();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') fetchUnacknowledged();
    });
    return () => sub.remove();
  }, [user]);

  const fetchUnacknowledged = async () => {
    try {
      const list = await activityFeedbackService.getUnacknowledged();
      // Reset cursor — otherwise a new ride appearing after the user had
      // already cleared their queue earlier today would stay past the cursor
      // (e.g. list length 1, currentIndex 1) and the modal would never show.
      setCurrentIndex(0);
      setActivities(list);
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

    setCurrentIndex((prev) => prev + 1);
  };

  const skip = async () => {
    const current = activities[currentIndex];
    if (!current) return;

    try {
      await activityFeedbackService.acknowledge(current.id, {});
    } catch (error) {
      console.error('Error skipping activity:', error);
    }

    setCurrentIndex((prev) => prev + 1);
  };

  const refetch = async () => {
    try {
      setCurrentIndex(0);
      await fetchUnacknowledged();
    } catch (error) {
      // Don't let a failed refetch (e.g. during token refresh) break the app
      console.warn('[useNewActivities] refetch failed:', error);
    }
  };

  return { activities, currentIndex, acknowledge, skip, refetch };
}
