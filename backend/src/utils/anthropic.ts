import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';

export const anthropic = new Anthropic({
  apiKey: config.anthropic.apiKey,
});

// Model definitions
export const HAIKU = 'claude-haiku-4-5-20251001';
export const SONNET = 'claude-sonnet-4-6';

// Default model for backward compatibility
export const MODEL = HAIKU;

// Model selection helper
export type TaskType = 'chat' | 'workout_generation' | 'training_plan';

export function selectModel(task: TaskType): string {
  // Use Sonnet for workout generation and training plans (more reliable for tool use)
  // Use Haiku for simple chat (cost savings)
  return task === 'chat' ? HAIKU : SONNET;
}
