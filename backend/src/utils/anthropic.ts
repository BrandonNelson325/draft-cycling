import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';

export const anthropic = new Anthropic({
  apiKey: config.anthropic.apiKey,
});

// Model definitions
export const HAIKU = 'claude-haiku-4-5-20251001';
export const SONNET = 'claude-sonnet-4-6';
export const OPUS = 'claude-opus-4-6';

// Default model for backward compatibility
export const MODEL = HAIKU;

// Model selection helper
export type TaskType = 'chat' | 'workout_generation' | 'training_plan';

export function selectModel(task: TaskType): string {
  // Use Sonnet for all tasks — Haiku is too weak for schedule reasoning,
  // date math, and multi-turn coaching conversations. The system prompt is
  // cached so most input tokens cost 10% of normal.
  return SONNET;
}
