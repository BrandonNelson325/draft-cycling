import { useState, useEffect } from 'react';
import {
  activityFeedbackService,
  type UnacknowledgedActivity,
  type ActivityFeedback,
} from '../services/activityFeedbackService';
import { useAuthStore } from '../stores/useAuthStore';
import { appStorage } from '../utils/storage';

// Use date-keyed check: same calendar day = already checked
function getTodayKey(): string {
  const now = new Date();
  return `new_activities_checked_${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}`;
}

export function useNewActivities() {
  const [activities, setActivities] = useState<UnacknowledgedActivity[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const { user } = useAuthStore();

  useEffect(() => {
    if (!user) return;
    checkAndFetch();
  }, [user]);

  const checkAndFetch = async () => {
    const key = getTodayKey();
    const alreadyChecked = await appStorage.getItem(key);
    if (alreadyChecked) return;

    await fetchUnacknowledged();
  };

  const fetchUnacknowledged = async () => {
    try {
      const list = await activityFeedbackService.getUnacknowledged();
      setActivities(list);
      await appStorage.setItem(getTodayKey(), new Date().toISOString());
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

  return { activities, currentIndex, acknowledge, skip };
}
