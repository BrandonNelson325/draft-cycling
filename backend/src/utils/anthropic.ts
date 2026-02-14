import Anthropic from '@anthropic-ai/sdk';
import { config } from '../config';

export const anthropic = new Anthropic({
  apiKey: config.anthropic.apiKey,
});

export const MODEL = 'claude-3-5-sonnet-20241022';
