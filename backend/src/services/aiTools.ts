import { Tool } from '@anthropic-ai/sdk/resources';

export const AI_TOOLS: Tool[] = [
  {
    name: 'create_workout',
    description:
      'Create a structured cycling workout with intervals and power targets. Use this to build complete workouts for the athlete.',
    input_schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'Workout name, e.g. "4x8 VO2max Intervals"',
        },
        description: {
          type: 'string',
          description: 'Detailed workout description and purpose',
        },
        workout_type: {
          type: 'string',
          enum: ['endurance', 'tempo', 'threshold', 'vo2max', 'sprint', 'recovery', 'custom'],
          description: 'Type of workout',
        },
        duration_minutes: {
          type: 'integer',
          description: 'Total workout duration in minutes',
        },
        intervals: {
          type: 'array',
          description: 'Array of workout intervals in sequence',
          items: {
            type: 'object',
            properties: {
              duration: {
                type: 'integer',
                description: 'Interval duration in seconds',
              },
              power: {
                type: 'number',
                description: 'Power target as % of FTP (e.g., 85 for 85% FTP). For steady intervals.',
              },
              power_low: {
                type: 'number',
                description: 'For ramps, starting power % FTP',
              },
              power_high: {
                type: 'number',
                description: 'For ramps, ending power % FTP',
              },
              type: {
                type: 'string',
                enum: ['warmup', 'work', 'rest', 'cooldown', 'ramp'],
                description: 'Interval type',
              },
              cadence: {
                type: 'integer',
                description: 'Target cadence (optional)',
              },
              repeat: {
                type: 'integer',
                description: 'Number of times to repeat this interval (default 1)',
              },
            },
            required: ['duration', 'type'],
          },
        },
      },
      required: ['name', 'workout_type', 'duration_minutes', 'intervals'],
    },
  },

  {
    name: 'schedule_workout',
    description:
      "Schedule a workout to a specific date on the athlete's calendar. Use this after creating a workout or to schedule an existing workout.",
    input_schema: {
      type: 'object',
      properties: {
        workout_id: {
          type: 'string',
          description: 'UUID of workout to schedule',
        },
        scheduled_date: {
          type: 'string',
          description: 'Date in YYYY-MM-DD format',
        },
        rationale: {
          type: 'string',
          description: 'Why this workout on this day (optional)',
        },
      },
      required: ['workout_id', 'scheduled_date'],
    },
  },

  {
    name: 'move_workout',
    description: 'Move a scheduled workout to a different date',
    input_schema: {
      type: 'object',
      properties: {
        entry_id: {
          type: 'string',
          description: 'Calendar entry UUID',
        },
        new_date: {
          type: 'string',
          description: 'New date in YYYY-MM-DD format',
        },
      },
      required: ['entry_id', 'new_date'],
    },
  },

  {
    name: 'delete_workout_from_calendar',
    description:
      'Remove a scheduled workout from the calendar (does not delete the workout itself, just removes it from the schedule)',
    input_schema: {
      type: 'object',
      properties: {
        entry_id: {
          type: 'string',
          description: 'Calendar entry UUID to delete',
        },
      },
      required: ['entry_id'],
    },
  },

  {
    name: 'get_calendar',
    description: "Get the athlete's training calendar for a date range to see what workouts are scheduled",
    input_schema: {
      type: 'object',
      properties: {
        start_date: {
          type: 'string',
          description: 'Start date in YYYY-MM-DD format',
        },
        end_date: {
          type: 'string',
          description: 'End date in YYYY-MM-DD format',
        },
      },
      required: ['start_date', 'end_date'],
    },
  },

  {
    name: 'get_workouts',
    description:
      "Get list of available workouts from the athlete's library. Use this to see what workouts exist before scheduling.",
    input_schema: {
      type: 'object',
      properties: {
        workout_type: {
          type: 'string',
          enum: ['endurance', 'tempo', 'threshold', 'vo2max', 'sprint', 'recovery', 'custom'],
          description: 'Filter by workout type (optional)',
        },
        ai_generated: {
          type: 'boolean',
          description: 'Filter for AI-generated workouts (optional)',
        },
      },
    },
  },

  {
    name: 'update_athlete_ftp',
    description:
      "Update the athlete's functional threshold power. Use this when you have evidence that their FTP has changed based on recent performance.",
    input_schema: {
      type: 'object',
      properties: {
        ftp: {
          type: 'integer',
          description: 'New FTP in watts',
        },
        rationale: {
          type: 'string',
          description: 'Why FTP is being updated (e.g., based on recent 20min power)',
        },
      },
      required: ['ftp'],
    },
  },

  {
    name: 'generate_training_plan',
    description:
      'Generate a complete multi-week periodized training plan for the athlete. Use this when they want a structured plan leading up to an event.',
    input_schema: {
      type: 'object',
      properties: {
        goal_event: {
          type: 'string',
          description: 'The goal event (e.g., "Gran Fondo", "Century Ride", "Criterium Race")',
        },
        event_date: {
          type: 'string',
          description: 'Event date in YYYY-MM-DD format',
        },
        current_fitness_level: {
          type: 'string',
          enum: ['beginner', 'intermediate', 'advanced'],
          description: 'Current fitness level',
        },
        weekly_hours: {
          type: 'number',
          description: 'Hours available per week for training',
        },
        strengths: {
          type: 'array',
          items: { type: 'string' },
          description: 'Athlete strengths (e.g., "climbing", "sprinting", "endurance")',
        },
        weaknesses: {
          type: 'array',
          items: { type: 'string' },
          description: 'Areas to improve',
        },
        indoor_outdoor: {
          type: 'string',
          enum: ['indoor', 'outdoor', 'both'],
          description: 'Training environment preference',
        },
        zwift_availability: {
          type: 'boolean',
          description: 'Whether athlete has access to Zwift',
        },
      },
      required: ['goal_event', 'event_date', 'current_fitness_level', 'weekly_hours'],
    },
  },

  {
    name: 'update_athlete_preferences',
    description:
      'Save athlete preferences and training details so you remember them for future conversations. Use this AUTOMATICALLY when you learn new information about the athlete through conversation (goals, preferences, constraints, etc.). This makes you smarter over time!',
    input_schema: {
      type: 'object',
      properties: {
        preferences: {
          type: 'object',
          description: 'Preferences to save or update (will be merged with existing preferences)',
          properties: {
            training_goal: {
              type: 'string',
              description: 'Their training goal or target event',
            },
            event_date: {
              type: 'string',
              description: 'Target event date in YYYY-MM-DD format',
            },
            weekly_hours: {
              type: 'number',
              description: 'Hours available per week for training',
            },
            rest_days: {
              type: 'array',
              items: { type: 'string' },
              description: 'Days they take off (e.g., ["Sunday", "Wednesday"])',
            },
            workout_duration_preference: {
              type: 'string',
              description: 'Preferred workout duration (e.g., "60-90min", "45-60min")',
            },
            preferred_workout_types: {
              type: 'array',
              items: { type: 'string' },
              description: 'Types of workouts they enjoy',
            },
            time_constraints: {
              type: 'string',
              description: 'Schedule constraints (e.g., "Limited on weekdays, more time on weekends")',
            },
            intensity_preference: {
              type: 'string',
              description: 'Intensity preference (e.g., "prefers-hard-efforts", "prefers-volume")',
            },
            indoor_outdoor: {
              type: 'string',
              enum: ['indoor', 'outdoor', 'both'],
              description: 'Indoor/outdoor preference',
            },
            zwift_available: {
              type: 'boolean',
              description: 'Whether they have Zwift',
            },
          },
        },
      },
      required: ['preferences'],
    },
  },
];
